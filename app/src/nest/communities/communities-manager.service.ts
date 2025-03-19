import { Inject, Injectable } from '@nestjs/common'
import { CommunityStorageService } from './storage/communities.storage.service.js'
import { createLogger } from '../app/logger/logger.js'
import { Community, CreatedCommunity, ManagedCommunity } from './types.js'
import {
  Keyring,
  LocalServerContext,
  ServerContext,
  Team,
  createKeyset,
  loadTeam,
  redactKeys,
  Keyset,
} from '@localfirst/auth'
import { ServerKeyManagerService } from '../encryption/server-key-manager.service.js'
import {
  DecryptionError,
  EncryptionBase64Error,
  EncryptionError,
  StoredKeyRingType,
} from '../encryption/types.js'
import * as uint8arrays from 'uint8arrays'
import { CompoundError } from '../types.js'
import { HOSTNAME } from '../app/const.js'

@Injectable()
export class CommunitiesManagerService {
  private readonly logger = createLogger(CommunitiesManagerService.name)
  private readonly communities = new Map<string, ManagedCommunity>()

  constructor(
    @Inject(HOSTNAME) private readonly hostname: string,
    private readonly storage: CommunityStorageService,
    private readonly serverKeyManager: ServerKeyManagerService,
  ) {}

  public async create(
    community: Community,
    teamKeyring: string,
  ): Promise<CreatedCommunity> {
    this.logger.log(`Adding new community for ID ${community.teamId}`)
    try {
      this.logger.warn(
        uint8arrays.toString(
          uint8arrays.fromString(teamKeyring, 'base64'),
          'utf8',
        ),
      )
      const deserializedTeamKeyring: Keyring = JSON.parse(
        uint8arrays.toString(
          uint8arrays.fromString(teamKeyring, 'base64'),
          'utf8',
        ),
      ) as Keyring
      this.logger.log(`Initializing server keyset`)
      const serverKeysWithSecrets = createKeyset(
        { type: 'SERVER', name: 'QSS' },
        this.serverKeyManager.generateRandomBytes(32, 'base64'),
      )
      await this.serverKeyManager.encryptAndStoreKeyring(
        community.teamId,
        uint8arrays.fromString(JSON.stringify(serverKeysWithSecrets), 'utf8'),
        StoredKeyRingType.ServerKeyring,
      )
      this.logger.log(`Storing team keyset`)
      await this.serverKeyManager.encryptAndStoreKeyring(
        community.teamId,
        uint8arrays.fromString(teamKeyring, 'base64'),
        StoredKeyRingType.TeamKeyring,
      )
      this.logger.log(`Storing community metadata`)
      const stored = await this.storage.addCommunity(community)
      if (!stored) {
        throw new Error(`Failed to store community!`)
      }

      this.logger.log(`Deserializing and joining team`)
      const rawSigchain = uint8arrays.fromString(community.sigChain, 'hex')
      const localServerContext: LocalServerContext = {
        server: {
          host: this.hostname,
          keys: serverKeysWithSecrets,
        },
      }
      const deserializedTeam: Team = loadTeam(
        rawSigchain,
        localServerContext,
        deserializedTeamKeyring,
      ) as Team
      const context: ServerContext = {
        ...localServerContext,
        team: deserializedTeam,
      }

      this.communities.set(community.teamId, {
        teamId: community.teamId,
        serverContext: context,
        localServerContext,
      })

      return {
        serverKeys: redactKeys(serverKeysWithSecrets) as Keyset,
        community,
      }
    } catch (e) {
      let reason: string | undefined = undefined
      if (
        e instanceof EncryptionBase64Error ||
        e instanceof EncryptionError ||
        e instanceof DecryptionError
      ) {
        reason = `Encryption error occurred while creating community`
      } else {
        reason = `Error while creating community`
      }
      this.logger.error(reason, e)
      throw new CompoundError(reason, e as Error)
    }
  }
}
