import { Injectable, OnModuleInit } from '@nestjs/common'
import { createLogger } from '../../app/logger/nest.logger.js'
import { Community } from './types.js'
import { ConfigService } from '../../utils/config/config.service.js'
import { PostgresClient } from '../storage-clients/postgres/postgres.client.js'
import { Community as CommunityEntity } from './entities/community.entity.js'

@Injectable()
export class CommunityStorageService implements OnModuleInit {
  private readonly logger = createLogger('Storage:Communities')

  constructor(
    private readonly configService: ConfigService,
    private readonly rdsClient: PostgresClient,
  ) {}

  onModuleInit(): void {
    this.logger.log(`${CommunityStorageService.name} initialized!`)
  }

  public async addCommunity(payload: Community): Promise<boolean> {
    try {
      this.logger.log(`Adding new community with ID ${payload.teamId}`)
      await this.rdsClient.add(this.payloadToEntity(payload))
      return true
    } catch (e) {
      this.logger.error(`Error while writing community to storage`, e)
      return false
    }
  }

  public async getCommunity(
    teamId: string,
    filterAttributes?: Array<keyof Community>,
  ): Promise<Partial<Community> | undefined> {
    this.logger.log(`Getting community with ID ${teamId}`)
    if (filterAttributes != null) {
      this.logger.log(`Filtering ${teamId} attributes:`, filterAttributes)
    }

    const result = await this.rdsClient.findOne<CommunityEntity>(
      CommunityEntity,
      teamId,
    )
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
      sigChain: payload.sigChain,
    })
    return entity
  }

  private entityToPayload(entity: CommunityEntity): Community {
    this.logger.log('ff', entity.sigChain)
    return {
      teamId: entity.id,
      name: entity.name,
      psk: entity.psk,
      peerList: entity.peerList,
      sigChain: entity.sigChain.toString(),
    }
  }

  public async close(): Promise<void> {
    await this.rdsClient.close()
  }
}
