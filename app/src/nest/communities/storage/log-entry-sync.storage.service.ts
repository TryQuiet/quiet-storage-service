/**
 * Communities storage abstraction layer
 */

import { Injectable, OnModuleInit } from '@nestjs/common'
import type { Cursor } from '@mikro-orm/core'
import { createLogger } from '../../app/logger/logger.js'
import { LogSyncEntry } from '../types.js'
import { LogEntrySync as LogEntrySyncEntity } from './entities/log-sync.entity.js'
import { PostgresClient } from '../../storage/postgres/postgres.client.js'
import { PostgresRepo } from '../../storage/postgres/postgres.repo.js'
import { MikroORM } from '@mikro-orm/postgresql'
import { DateTime } from 'luxon'
import { TableNames } from '../../storage/postgres/const.js'
import { isDuplicateKeyError } from './log-entry-sync.storage.util.js'

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
      this.logger.log(
        `Adding new log sync data with ID ${payload.cid} to community ${payload.communityId}`,
      )
      const createdAt = DateTime.utc().toISO()
      const receivedAt = payload.receivedAt.toUTC().toISO()
      const insertedRows: Array<{ sync_seq: number | string }> =
        await this.orm.em
          .fork()
          .getConnection()
          .execute(
            // Allocate and insert in one statement so Postgres keeps the counter
            // consistent with minimal lock time, even if the counter row drifts.
            `with allocated as (
             insert into "${TableNames.LOG_ENTRY_SYNC_COUNTER}" ("community_id", "next_sync_seq")
                  values (?, 2)
             on conflict ("community_id") do update
                   set "next_sync_seq" = greatest(
                         "${TableNames.LOG_ENTRY_SYNC_COUNTER}"."next_sync_seq",
                         coalesce(
                           (
                             select "sync_seq" + 1
                               from "${TableNames.LOG_ENTRY_SYNC}"
                              where "community_id" = excluded."community_id"
                              order by "sync_seq" desc
                              limit 1
                           ),
                           1::bigint
                         )
                       ) + 1
             returning "next_sync_seq" - 1 as "sync_seq"
           ),
           inserted as (
             insert into "${TableNames.LOG_ENTRY_SYNC}" (
               "id",
               "community_id",
               "hashed_db_id",
               "entry",
               "received_at",
               "sync_seq",
               "created_at"
             )
             select ?, ?, ?, ?, ?, "sync_seq", ?
               from allocated
             returning "sync_seq"
           )
           select "sync_seq"
             from inserted`,
            [
              payload.communityId,
              payload.cid,
              payload.communityId,
              payload.hashedDbId,
              payload.entry,
              receivedAt,
              createdAt,
            ],
            'all',
          )
      const inserted = insertedRows.at(0)

      if (inserted == null) {
        throw new Error(
          `Unable to allocate sync sequence for community ${payload.communityId}`,
        )
      }

      const stored = {
        receivedAtMs,
        syncSeq: toSyncSeq(inserted.sync_seq),
      }
      this.logger.log(
        `[addLogEntry] cid=${payload.cid} communityId=${payload.communityId} committed syncSeq=${stored.syncSeq}`,
      )
      return stored
    } catch (e) {
      let error: Error
      if (e instanceof Error) {
        error = e
      } else {
        error = new Error(String(e))
      }
      if (isDuplicateKeyError(e)) {
        this.logger.warn('Entry ID already exists in database!')
        return await this.getStoredPositionById(payload.cid)
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
    if (result.length === 0) {
      this.logger.warn(
        `No log entries found in storage for community ID ${communityId} after sync seq ${afterSeq}`,
      )
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

  private async getStoredPositionById(
    cid: string,
  ): Promise<StoredSyncPosition | undefined> {
    const existingEntity = await this.repository.findOne(cid)
    if (existingEntity == null) {
      this.logger.error(
        `Duplicate log sync entry ${cid} was not readable after unique violation`,
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
