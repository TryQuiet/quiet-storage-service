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

  public async addLogEntry(payload: LogSyncEntry): Promise<boolean> {
    try {
      this.logger.log(`Adding new log sync data with ID ${payload.cid}`)
      const entity = this.payloadToEntity(payload)
      return await this.repository.add(entity)
    } catch (e) {
      let error: Error
      if (e instanceof Error) {
        error = e
      } else {
        error = new Error(String(e))
      }
      this.logger.info(`Error name: ${error.name}`)
      if (error.name === 'UniqueConstraintViolationException') {
        return true
      }
      this.logger.error(`Error while writing log sync data to storage`, error)
      return false
    }
  }

  public async getLogEntriesForCommunity(
    communityId: string,
    startTs: number,
  ): Promise<LogSyncEntry[] | undefined | null> {
    const startDateTime = DateTime.fromMillis(startTs).toISO()
    this.logger.log(
      `Getting log entries for community ID ${communityId} and starting datetime ${startDateTime}`,
    )
    const result = await this.repository.findMany({
      communityId: { $eq: communityId },
      receivedAt: { $gte: startDateTime },
    })
    if (result == null) {
      this.logger.warn(
        `No log entries found in storage for community ID ${communityId} and starting datetime ${startDateTime}`,
      )
      return undefined
    }
    return result.map(entity => this.entityToPayload(entity))
  }

  public async clearRepository(): Promise<void> {
    this.logger.warn(`Clearing the communities data respository!`)
    await this.repository.clearRepository()
  }

  private payloadToEntity(payload: LogSyncEntry): LogEntrySyncEntity {
    const entity = new LogEntrySyncEntity()
    entity.assign({
      id: payload.cid,
      communityId: payload.communityId,
      entry: payload.entry,
      hashedDbId: payload.hashedDbId,
      receivedAt: payload.receivedAt.toUTC().toISO(),
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
    }
  }

  public async close(): Promise<void> {
    await this.postgresClient.close()
  }
}
