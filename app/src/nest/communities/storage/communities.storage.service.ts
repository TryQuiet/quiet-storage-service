/**
 * Communities storage abstraction layer
 */

import { Injectable, OnModuleInit } from '@nestjs/common'
import { createLogger } from '../../app/logger/logger.js'
import { Community, CommunityUpdate } from '../types.js'
import { Community as CommunityEntity } from './entities/community.entity.js'
import { EntityData } from '@mikro-orm/core'
import { PostgresClient } from '../../storage/postgres/postgres.client.js'
import { PostgresRepo } from '../../storage/postgres/postgres.repo.js'
import { MikroORM } from '@mikro-orm/postgresql'
import * as uint8arrays from 'uint8arrays'

@Injectable()
export class CommunitiesStorageService implements OnModuleInit {
  /**
   * Postgres repository
   */
  private readonly repository: PostgresRepo<CommunityEntity>

  private readonly logger = createLogger('Storage:Communities')

  constructor(
    private readonly postgresClient: PostgresClient,
    private readonly orm: MikroORM,
  ) {
    this.repository = postgresClient.getRepository(CommunityEntity)
  }

  onModuleInit(): void {
    this.logger.log(`${CommunitiesStorageService.name} initialized!`)
  }

  public async addCommunity(payload: Community): Promise<boolean> {
    try {
      this.logger.log(`Adding new community with ID ${payload.teamId}`)
      return await this.repository.add(this.payloadToEntity(payload))
    } catch (e) {
      this.logger.error(`Error while writing community to storage`, e)
      return false
    }
  }

  public async updateCommunity(
    teamId: string,
    payload: CommunityUpdate,
  ): Promise<boolean> {
    try {
      this.logger.log(`Updating community with ID ${teamId}`)
      return await this.repository.update(
        teamId,
        this.payloadToEntityData(payload),
      )
    } catch (e) {
      this.logger.error(`Error while writing community to storage`, e)
      return false
    }
  }

  public async updateAndFindCommunity(
    teamId: string,
    payload: CommunityUpdate,
  ): Promise<Community | undefined | null> {
    this.logger.log(`Updating and getting community with ID ${teamId}`)
    const result = await this.repository.updateAndFindOne(
      teamId,
      this.payloadToEntityData(payload),
    )
    if (result == null) {
      this.logger.warn(`No community found in storage for ID ${teamId}`)
      return undefined
    }
    return this.entityToPayload(result)
  }

  public async getCommunity(
    teamId: string,
  ): Promise<Community | undefined | null> {
    this.logger.log(`Getting community with ID ${teamId}`)
    const result = await this.repository.findOne(teamId)
    if (result == null) {
      this.logger.warn(`No community found in storage for ID ${teamId}`)
      return undefined
    }
    return this.entityToPayload(result)
  }

  public async hasCommunity(teamId: string): Promise<boolean> {
    this.logger.log(`Checking for community with ID ${teamId}`)
    const result = await this.repository.has(teamId)
    if (result == null) {
      throw new Error(
        `Failed to determine if community with ID ${teamId} exists in storage`,
      )
    }
    return result
  }

  public async clearRepository(): Promise<void> {
    this.logger.warn(`Clearing the communities respository!`)
    await this.repository.clearRepository()
  }

  private payloadToEntity(payload: Community): CommunityEntity {
    const entity = new CommunityEntity()
    entity.assign({
      id: payload.teamId,
      sigChain: Buffer.from(uint8arrays.fromString(payload.sigChain, 'hex')),
    })
    return entity
  }

  private payloadToEntityData(
    payload: CommunityUpdate,
  ): EntityData<CommunityEntity> {
    const entityData: EntityData<CommunityEntity> = {
      sigChain:
        payload.sigChain != null
          ? Buffer.from(uint8arrays.fromString(payload.sigChain, 'hex'))
          : undefined,
    }
    return Object.fromEntries(
      Object.entries(entityData).filter(([_, v]) => v != null),
    )
  }

  private entityToPayload(entity: CommunityEntity): Community {
    return {
      teamId: entity.id,
      sigChain: uint8arrays.toString(Uint8Array.from(entity.sigChain), 'hex'),
    }
  }

  public async close(): Promise<void> {
    await this.postgresClient.close()
  }
}
