/**
 * Communities storage abstraction layer
 */

import { Injectable, OnModuleInit } from '@nestjs/common'
import { createLogger } from '../../app/logger/logger.js'
import { CommunitiesData } from '../types.js'
import { CommunitiesData as CommunitiesDataEntity } from './entities/communities-data.entity.js'
import { PostgresClient } from '../../storage/postgres/postgres.client.js'
import { PostgresRepo } from '../../storage/postgres/postgres.repo.js'
import { MikroORM } from '@mikro-orm/postgresql'
import { EntityValidationError } from '../../utils/errors.js'
import { DateTime } from 'luxon'

@Injectable()
export class CommunitiesDataStorageService implements OnModuleInit {
  /**
   * Postgres repository
   */
  private readonly repository: PostgresRepo<CommunitiesDataEntity>

  private readonly logger = createLogger('Storage:Communities')

  constructor(
    private readonly postgresClient: PostgresClient,
    private readonly orm: MikroORM,
  ) {
    this.repository = postgresClient.getRepository(CommunitiesDataEntity)
  }

  onModuleInit(): void {
    this.logger.log(`${CommunitiesDataStorageService.name} initialized!`)
  }

  public async addCommunitiesData(payload: CommunitiesData): Promise<boolean> {
    try {
      this.logger.log(`Adding new community sync data with ID ${payload.cid}`)
      const entity = this.payloadToEntity(payload)
      return await this.repository.add(entity)
    } catch (e) {
      this.logger.error(`Error while writing community sync data to storage`, e)
      return false
    }
  }

  public async getCommunitiesData(
    communityId: string,
    startTs: number,
  ): Promise<CommunitiesData[] | undefined | null> {
    const startDateTime = DateTime.fromMillis(startTs).toISO()
    this.logger.log(
      `Getting communities data for ID ${communityId} and starting datetime ${startDateTime}`,
    )
    const result = await this.repository.findMany({
      communityId: { $eq: communityId },
      receivedAt: { $gte: startDateTime },
    })
    if (result == null) {
      this.logger.warn(
        `No community data found in storage for ID ${communityId} and starting datetime ${startDateTime}`,
      )
      return undefined
    }
    return result.map(entity => this.entityToPayload(entity))
  }

  public async clearRepository(): Promise<void> {
    this.logger.warn(`Clearing the communities respository!`)
    await this.orm.getSchemaGenerator().clearDatabase()
  }

  private payloadToEntity(payload: CommunitiesData): CommunitiesDataEntity {
    if (payload.receivedAt == null) {
      throw new EntityValidationError(
        `${CommunitiesDataEntity.name}: receivedAt must be non-null`,
      )
    }

    const entity = new CommunitiesDataEntity()
    entity.assign({
      id: payload.cid,
      communityId: payload.communityId,
      entry: payload.entry,
      receivedAt: payload.receivedAt.toUTC().toISO(),
      createdAt: DateTime.utc().toISO(),
    })
    return entity
  }

  private entityToPayload(entity: CommunitiesDataEntity): CommunitiesData {
    return {
      communityId: entity.communityId,
      entry: entity.entry,
      cid: entity.id,
      receivedAt: DateTime.fromJSDate(new Date(entity.receivedAt)).toUTC(),
    }
  }

  public async close(): Promise<void> {
    await this.postgresClient.close()
  }
}
