import { Injectable, OnModuleInit } from '@nestjs/common'
import { createLogger } from '../../app/logger/logger.js'
import { Community, CommunityUpdate } from '../../communities/types.js'
import { ConfigService } from '../../utils/config/config.service.js'
import { Community as CommunityEntity } from './entities/community.entity.js'
import { EntityData } from '@mikro-orm/core'
import { PostgresClient } from '../../storage/postgres/postgres.client.js'
import { PostgresRepo } from '../../storage/postgres/postgres.repo.js'
import { MikroORM } from '@mikro-orm/postgresql'
import * as uint8arrays from 'uint8arrays'

@Injectable()
export class CommunityStorageService implements OnModuleInit {
  private readonly logger = createLogger('Storage:Communities')
  private readonly repository: PostgresRepo<CommunityEntity>

  constructor(
    private readonly configService: ConfigService,
    private readonly postgresClient: PostgresClient,
    private readonly orm: MikroORM,
  ) {
    this.repository = postgresClient.getRepository(CommunityEntity)
  }

  onModuleInit(): void {
    this.logger.log(`${CommunityStorageService.name} initialized!`)
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
      await this.repository.update(teamId, this.payloadToEntityData(payload))
      return true
    } catch (e) {
      this.logger.error(`Error while writing community to storage`, e)
      return false
    }
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

  private payloadToEntity(payload: Community): CommunityEntity {
    const entity = new CommunityEntity()
    entity.assign({
      name: payload.name,
      id: payload.teamId,
      psk: payload.psk,
      peerList: payload.peerList,
      sigChain: Buffer.from(uint8arrays.fromString(payload.sigChain, 'hex')),
    })
    return entity
  }

  private payloadToEntityData(
    payload: CommunityUpdate,
  ): EntityData<CommunityEntity> {
    return {
      name: payload.name,
      psk: payload.psk,
      peerList: payload.peerList,
      sigChain:
        payload.sigChain != null
          ? Buffer.from(uint8arrays.fromString(payload.sigChain, 'hex'))
          : undefined,
    }
  }

  private entityToPayload(entity: CommunityEntity): Community {
    return {
      teamId: entity.id,
      name: entity.name,
      psk: entity.psk,
      peerList: entity.peerList,
      sigChain: uint8arrays.toString(Uint8Array.from(entity.sigChain), 'hex'),
    }
  }

  public async close(): Promise<void> {
    await this.postgresClient.close()
  }
}
