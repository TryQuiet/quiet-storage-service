import { Inject, Injectable } from '@nestjs/common'
import { CommunityStorageService } from './storage/communities.storage.service.js'
import { createLogger } from '../app/logger/logger.js'
import {
  AllowedServerKeyState,
  Community,
  CreatedCommunity,
  ManagedCommunity,
} from './types.js'
import {
  Keyring,
  LocalServerContext,
  createKeyset,
  redactKeys,
  Keyset,
  KeysetWithSecrets,
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
import { SigChain } from './auth/sigchain.js'
import { AuthConnection } from './auth/auth.connection.js'
import { CommunitiesHandlerOptions } from './websocket/types/index.js'

@Injectable()
export class CommunitiesManagerService {
  private readonly logger = createLogger(CommunitiesManagerService.name)
  private readonly communities = new Map<string, ManagedCommunity>()

  constructor(
    @Inject(HOSTNAME) private readonly hostname: string,
    private readonly storage: CommunityStorageService,
    private readonly serverKeyManager: ServerKeyManagerService,
  ) {}

  public async get(
    teamId: string,
    wsOptions: CommunitiesHandlerOptions,
  ): Promise<ManagedCommunity | undefined> {
    if (this.communities.has(teamId)) {
      return this.communities.get(teamId)
    }

    const community = await this.storage.getCommunity(teamId)
    if (community == null) {
      return undefined
    }

    let serverKeys: KeysetWithSecrets | undefined = undefined
    let teamKeys: Keyring | undefined = undefined
    try {
      serverKeys = await this.getServerKeys(
        teamId,
        AllowedServerKeyState.StoredOnly,
      )
      teamKeys = await this.getTeamKeys(teamId)
    } catch (e) {
      this.logger.error(
        `Error occurred while pulling keys from secrets manager`,
        e,
      )
      return undefined
    }

    const rawSigchain = uint8arrays.fromString(community.sigChain, 'hex')
    const localServerContext: LocalServerContext = {
      server: {
        host: this.hostname,
        keys: serverKeys,
      },
    }
    const sigChain: SigChain = SigChain.create(
      rawSigchain,
      localServerContext,
      teamKeys,
    )
    const managedCommunity: ManagedCommunity = {
      teamId: community.teamId,
      sigChain,
      wsOptions,
    }
    this.communities.set(community.teamId, managedCommunity)
    return managedCommunity
  }

  public async getServerKeys(
    teamId: string,
    allowedKeyState: AllowedServerKeyState,
  ): Promise<KeysetWithSecrets> {
    const existingKeyset = await this.serverKeyManager.retrieveKeyring(
      teamId,
      StoredKeyRingType.ServerKeyring,
    )
    if (existingKeyset != null) {
      if (allowedKeyState === AllowedServerKeyState.NotStored) {
        throw new Error(
          `Keys for this team were already stored but allowed state was set to ${AllowedServerKeyState.NotStored}`,
        )
      }
      return JSON.parse(
        uint8arrays.toString(existingKeyset, 'utf8'),
      ) as KeysetWithSecrets
    }

    if (allowedKeyState === AllowedServerKeyState.StoredOnly) {
      throw new Error(
        `Keys for this team were not stored locally or in the secrets manager but the allowed state was set to ${AllowedServerKeyState.StoredOnly}`,
      )
    }

    this.logger.log(`Initializing new server keyset for ${teamId}`)
    const serverKeysWithSecrets = createKeyset(
      { type: 'SERVER', name: this.hostname },
      this.serverKeyManager.generateRandomBytes(32, 'base64'),
    )
    await this.serverKeyManager.storeKeyring(
      teamId,
      uint8arrays.fromString(JSON.stringify(serverKeysWithSecrets), 'utf8'),
      StoredKeyRingType.ServerKeyring,
    )

    return serverKeysWithSecrets
  }

  public async getTeamKeys(teamId: string): Promise<Keyring> {
    const teamKeys = await this.serverKeyManager.retrieveKeyring(
      teamId,
      StoredKeyRingType.TeamKeyring,
    )

    if (teamKeys == null) {
      throw new Error(`Team keys for this team were not found`)
    }

    return JSON.parse(uint8arrays.toString(teamKeys, 'utf8')) as Keyring
  }

  public async create(
    community: Community,
    teamKeyring: string,
    wsOptions: CommunitiesHandlerOptions,
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
      this.logger.log(`Storing team keyset`)
      await this.serverKeyManager.storeKeyring(
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
      const serverKeysWithSecrets = await this.getServerKeys(
        community.teamId,
        AllowedServerKeyState.StoredOnly,
      )
      const rawSigchain = uint8arrays.fromString(community.sigChain, 'hex')
      const localServerContext: LocalServerContext = {
        server: {
          host: this.hostname,
          keys: serverKeysWithSecrets,
        },
      }

      const sigChain: SigChain = SigChain.create(
        rawSigchain,
        localServerContext,
        deserializedTeamKeyring,
      )
      this.communities.set(community.teamId, {
        teamId: community.teamId,
        sigChain,
        wsOptions,
      })

      this.startConnection(community.teamId, wsOptions)

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

  public startConnection(
    teamId: string,
    wsOptions: CommunitiesHandlerOptions,
  ): void {
    const managedCommunity = this.communities.get(teamId)
    if (managedCommunity == null) {
      throw new Error(`No community found for this team ID: ${teamId}`)
    }

    const authConnection = new AuthConnection(
      managedCommunity.sigChain,
      wsOptions,
    )
    this.communities.set(teamId, {
      ...managedCommunity,
      authConnection,
    })
    authConnection.start()
  }
}
