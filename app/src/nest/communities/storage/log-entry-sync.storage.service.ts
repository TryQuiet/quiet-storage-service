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
import { DateTime } from 'luxon'
import { TableNames } from '../../storage/postgres/const.js'

interface StoredSyncPosition {
  receivedAtMs: number
  syncSeq: number
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
      const stored = await this.orm.em.transactional(async em => {
        await em.getConnection().execute(
          `insert into "${TableNames.LOG_ENTRY_SYNC_COUNTER}" ("community_id", "next_sync_seq")
             values (?, 1)
             on conflict ("community_id") do nothing`,
          [payload.communityId],
        )

        const executedRows: Array<{ next_sync_seq: number | string }> = await em
          .getConnection()
          .execute(
            `select "next_sync_seq"
             from "${TableNames.LOG_ENTRY_SYNC_COUNTER}"
            where "community_id" = ?
            for update`,
            [payload.communityId],
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
          return {
            receivedAtMs: DateTime.fromJSDate(
              new Date(existingEntity.receivedAt),
            )
              .toUTC()
              .toMillis(),
            syncSeq: Number(existingEntity.syncSeq),
          }
        }

        const syncSeq = Number(lockedCounter.next_sync_seq)
        const entity = this.payloadToEntity({ ...payload, syncSeq })
        await repo.insert(entity)
        await em.getConnection().execute(
          `update "${TableNames.LOG_ENTRY_SYNC_COUNTER}"
                set "next_sync_seq" = ?
              where "community_id" = ?`,
          [syncSeq + 1, payload.communityId],
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
          syncSeq: Number(existingEntity.syncSeq),
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

    return existing != null ? Number(existing.syncSeq) : 0
  }

  public async getPaginatedLogEntries(
    communityId: string,
    filter: {
      limit?: number
      startSeq: number
      endSeq?: number
      hashedDbId?: string
      hash?: string
    },
  ): Promise<{
    items: LogEntrySyncEntity[]
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
    const items = await repo.find(
      { $and: filters },
      {
        limit: pageSize + 1,
        orderBy: { syncSeq: 'ASC' },
      },
    )
    return {
      items: items.slice(0, pageSize),
      hasNextPage: items.length > pageSize,
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
      syncSeq: Number(entity.syncSeq),
    }
  }

  public async close(): Promise<void> {
    await this.postgresClient.close()
  }
}
