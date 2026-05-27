/**
 * Communities storage abstraction layer
 */

import { Injectable, OnModuleInit } from '@nestjs/common'
import { createLogger } from '../../app/logger/logger.js'
import { LogSyncEntry } from '../types.js'
import { LogEntrySync as LogEntrySyncEntity } from './entities/log-sync.entity.js'
import { PostgresClient } from '../../storage/postgres/postgres.client.js'
import { PostgresRepo } from '../../storage/postgres/postgres.repo.js'
import { MikroORM } from '@mikro-orm/postgresql'
import type { Cursor, Transaction } from '@mikro-orm/core'
import { DateTime } from 'luxon'
import { TableNames } from '../../storage/postgres/const.js'

interface StoredSyncPosition {
  receivedAtMs: number
  syncSeq: number
}

/**
 * Safely convert a bigint or number sync sequence value to a JS number.
 * sync_seq is a bigint column in Postgres; MikroORM may return it as bigint or
 * string depending on the driver.  Values will never exceed Number.MAX_SAFE_INTEGER
 * in practice (would require ~9 quadrillion entries), but we centralise the cast
 * here so there is one place to change if we ever need BigInt throughout.
 */
export function toSyncSeq(value: bigint | number | string): number {
  return Number(value)
}

@Injectable()
export class LogEntrySyncStorageService implements OnModuleInit {
  /**
   * Postgres repository
   */
  private readonly repository: PostgresRepo<LogEntrySyncEntity>

  private readonly logger = createLogger('Storage:Communities:LogEntrySync')

  constructor(
    private readonly postgresClient: PostgresClient,
    private readonly orm: MikroORM,
  ) {
    this.repository = postgresClient.getRepository(LogEntrySyncEntity)
  }

  onModuleInit(): void {
    this.logger.log(`${LogEntrySyncStorageService.name} initialized!`)
  }

  public async addLogEntry(
    payload: LogSyncEntry,
  ): Promise<StoredSyncPosition | undefined> {
    const receivedAtMs = payload.receivedAt.toUTC().toMillis()
    try {
      this.logger.log(`Adding new log sync data with ID ${payload.cid}`)
      const stored = await this.orm.em.fork().transactional(async em => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents -- Transaction<T = any> is typed as `any` in MikroORM; the cast is intentional
        const trx: Transaction | undefined = em.getTransactionContext()
        await em.getConnection().execute(
          `insert into "${TableNames.LOG_ENTRY_SYNC_COUNTER}" ("community_id", "next_sync_seq")
             values (?, 1)
             on conflict ("community_id") do nothing`,
          [payload.communityId],
          'run',
          trx,
        )

        const executedRows: Array<{ next_sync_seq: number | string }> = await em
          .getConnection()
          .execute(
            `select "next_sync_seq"
             from "${TableNames.LOG_ENTRY_SYNC_COUNTER}"
            where "community_id" = ?
            for update`,
            [payload.communityId],
            'all',
            trx,
          )
        const [lockedCounter] = executedRows

        if (lockedCounter == null) {
          throw new Error(
            `Unable to allocate sync sequence for community ${payload.communityId}`,
          )
        }

        const repo = em.getRepository(LogEntrySyncEntity)
        const existingEntity = await repo.findOne({ id: { $eq: payload.cid } })
        if (existingEntity != null) {
          this.logger.log(
            `[addLogEntry] cid=${payload.cid} already exists with syncSeq=${toSyncSeq(existingEntity.syncSeq)}, skipping insert`,
          )
          return {
            receivedAtMs: DateTime.fromJSDate(
              new Date(existingEntity.receivedAt),
            )
              .toUTC()
              .toMillis(),
            syncSeq: toSyncSeq(existingEntity.syncSeq),
          }
        }

        const syncSeq = toSyncSeq(lockedCounter.next_sync_seq)
        this.logger.log(
          `[addLogEntry] cid=${payload.cid} communityId=${payload.communityId} allocating syncSeq=${syncSeq} next_sync_seq_raw=${lockedCounter.next_sync_seq}`,
        )
        const entity = this.payloadToEntity({ ...payload, syncSeq })
        await repo.insert(entity)
        await em.getConnection().execute(
          `update "${TableNames.LOG_ENTRY_SYNC_COUNTER}"
                set "next_sync_seq" = ?
              where "community_id" = ?`,
          [syncSeq + 1, payload.communityId],
          'run',
          trx,
        )
        this.logger.log(
          `[addLogEntry] cid=${payload.cid} committed syncSeq=${syncSeq} updated counter to ${syncSeq + 1}`,
        )

        return {
          receivedAtMs,
          syncSeq,
        }
      })
      return stored
    } catch (e) {
      let error: Error
      if (e instanceof Error) {
        error = e
      } else {
        error = new Error(String(e))
      }
      if (error.name === 'UniqueConstraintViolationException') {
        this.logger.warn('Entry ID already exists in database!')
        const existingEntity = await this.repository.findOne(payload.cid)
        if (existingEntity == null) {
          this.logger.error(
            `Duplicate log sync entry ${payload.cid} was not readable after unique violation`,
          )
          return undefined
        }
        return {
          receivedAtMs: DateTime.fromJSDate(new Date(existingEntity.receivedAt))
            .toUTC()
            .toMillis(),
          syncSeq: toSyncSeq(existingEntity.syncSeq),
        }
      }
      this.logger.error(`Error while writing log sync data to storage`, error)
      return undefined
    }
  }

  public async getLogEntriesForCommunity(
    communityId: string,
    afterSeq: number,
  ): Promise<LogSyncEntry[] | undefined | null> {
    this.logger.log(
      `Getting log entries for community ID ${communityId} after sync seq ${afterSeq}`,
    )
    const repo = this.repository.entityManager.getRepository(LogEntrySyncEntity)
    const result = await repo.find(
      {
        communityId: { $eq: communityId },
        syncSeq: { $gt: afterSeq },
      },
      { orderBy: { syncSeq: 'ASC' } },
    )
    if (result == null) {
      this.logger.warn(
        `No log entries found in storage for community ID ${communityId} after sync seq ${afterSeq}`,
      )
      return undefined
    }
    return result.map(entity => this.entityToPayload(entity))
  }

  public async resolveSyncSeqForTimestamp(
    communityId: string,
    timestamp: number,
  ): Promise<number> {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return 0
    }

    const startDateTime = DateTime.fromMillis(timestamp).toISO()
    const repo = this.repository.entityManager.getRepository(LogEntrySyncEntity)
    const existing = await repo.findOne(
      {
        communityId: { $eq: communityId },
        receivedAt: { $lte: startDateTime },
      },
      { orderBy: { receivedAt: 'DESC', syncSeq: 'DESC' } },
    )

    return existing != null ? toSyncSeq(existing.syncSeq) : 0
  }

  public async getPaginatedLogEntries(
    communityId: string,
    filter: {
      limit?: number
      startTs: number
      endTs?: number
      hashedDbId?: string
      hash?: string
      direction?: 'forward' | 'backward'
    },
    cursor?: string,
  ): Promise<Cursor<LogEntrySyncEntity>> {
    const startDateTime = DateTime.fromMillis(filter.startTs).toISO()
    const endDateTime =
      filter.endTs != null
        ? DateTime.fromMillis(filter.endTs).toISO()
        : undefined
    this.logger.log(
      `Getting paged log entries for community ID ${communityId} and starting datetime ${startDateTime}`,
    )
    const filters = [
      ...(filter.hash != null ? [{ id: { $eq: filter.hash } }] : []),
      { communityId: { $eq: communityId } },
      ...(filter.hashedDbId != null
        ? [{ hashedDbId: { $eq: filter.hashedDbId } }]
        : []),
      {
        receivedAt: {
          $gte: startDateTime,
          ...(endDateTime != null ? { $lte: endDateTime } : {}),
        },
      },
    ]
    const repo = this.repository.entityManager.getRepository(LogEntrySyncEntity)
    if (filter.direction === 'backward') {
      return await repo.findByCursor(
        { $and: filters },
        {
          before: cursor,
          last: filter.limit,
          includeCount: true,
          orderBy: { receivedAt: 'ASC', id: 'ASC' },
        },
      )
    }

    return await repo.findByCursor(
      { $and: filters },
      {
        after: cursor,
        first: filter.limit,
        includeCount: true,
        orderBy: { receivedAt: 'ASC', id: 'ASC' },
      },
    )
  }

  public async getPaginatedLogEntriesBySyncSeq(
    communityId: string,
    filter: {
      limit?: number
      startSeq: number
      endSeq?: number
      hashedDbId?: string
      hash?: string
    },
  ): Promise<{
    items: Array<{ id: string; syncSeq: number; entry: Buffer }>
    hasNextPage: boolean
  }> {
    this.logger.log(
      `Getting paged log entries for community ID ${communityId} after sync seq ${filter.startSeq}`,
    )
    const filters = [
      ...(filter.hash != null ? [{ id: { $eq: filter.hash } }] : []),
      { communityId: { $eq: communityId } },
      ...(filter.hashedDbId != null
        ? [{ hashedDbId: { $eq: filter.hashedDbId } }]
        : []),
      {
        syncSeq: {
          $gt: filter.startSeq,
          ...(filter.endSeq != null ? { $lte: filter.endSeq } : {}),
        },
      },
    ]
    const repo = this.repository.entityManager.getRepository(LogEntrySyncEntity)
    const pageSize = Math.min(filter.limit ?? 200, 200)
    const rows = await repo.find(
      { $and: filters },
      {
        limit: pageSize + 1,
        orderBy: { syncSeq: 'ASC' },
      },
    )
    return {
      items: rows.slice(0, pageSize).map(r => ({
        id: r.id,
        syncSeq: toSyncSeq(r.syncSeq),
        entry: r.entry,
      })),
      hasNextPage: rows.length > pageSize,
    }
  }

  public async clearRepository(): Promise<void> {
    this.logger.warn(`Clearing the communities data respository!`)
    await this.repository.clearRepository()
    await this.orm.em
      .getConnection()
      .execute(`delete from "${TableNames.LOG_ENTRY_SYNC_COUNTER}"`)
  }

  private payloadToEntity(payload: LogSyncEntry): LogEntrySyncEntity {
    if (payload.syncSeq == null) {
      throw new Error(`syncSeq must be provided when writing log sync data`)
    }

    const entity = new LogEntrySyncEntity()
    entity.assign({
      id: payload.cid,
      communityId: payload.communityId,
      entry: payload.entry,
      hashedDbId: payload.hashedDbId,
      receivedAt: payload.receivedAt.toUTC().toISO(),
      syncSeq: payload.syncSeq,
      createdAt: DateTime.utc().toISO(),
    })
    return entity
  }

  private entityToPayload(entity: LogEntrySyncEntity): LogSyncEntry {
    return {
      communityId: entity.communityId,
      entry: entity.entry,
      cid: entity.id,
      hashedDbId: entity.hashedDbId,
      receivedAt: DateTime.fromJSDate(new Date(entity.receivedAt)).toUTC(),
      syncSeq: toSyncSeq(entity.syncSeq),
    }
  }

  public async close(): Promise<void> {
    await this.postgresClient.close()
  }
}
