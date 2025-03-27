import { Inject, Injectable } from '@nestjs/common'
import { CommunitiesStorageService } from './storage/communities.storage.service.js'
import { createLogger } from '../app/logger/logger.js'
import {
  AllowedServerKeyState,
  Community,
  CommunityUpdate,
  CreatedCommunity,
  EncryptedCommunity,
  EncryptedCommunityUpdate,
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
  EncryptedPayload,
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
    private readonly storage: CommunitiesStorageService,
    private readonly serverKeyManager: ServerKeyManagerService,
  ) {}

  public async get(
    teamId: string,
    wsOptions: CommunitiesHandlerOptions,
    forceFetch = false,
  ): Promise<ManagedCommunity | undefined> {
    if (this.communities.has(teamId) && !forceFetch) {
      return this.communities.get(teamId)
    }

    const encCommunity = await this.storage.getCommunity(teamId)
    if (encCommunity == null) {
      return undefined
    }

    const community = await this._decryptCommunity(encCommunity)
    let serverKeys: KeysetWithSecrets | undefined = undefined
    let teamKeys: Keyring | undefined = undefined
    try {
      serverKeys = await this.getServerKeys(
        teamId,
        AllowedServerKeyState.STORED_ONLY,
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
      community,
      sigChain,
      wsOptions,
    }
    this.communities.set(community.teamId, managedCommunity)
    return managedCommunity
  }

  public async create(
    community: Community,
    teamKeyring: string,
    wsOptions: CommunitiesHandlerOptions,
  ): Promise<CreatedCommunity> {
    this.logger.log(`Adding new community for ID ${community.teamId}`)
    try {
      const deserializedTeamKeyring: Keyring = JSON.parse(
        uint8arrays.toString(
          uint8arrays.fromString(teamKeyring, 'base64'),
          'utf8',
        ),
      ) as Keyring
      this.logger.verbose(`Storing team keyset`)
      await this.serverKeyManager.storeKeyring(
        community.teamId,
        uint8arrays.fromString(teamKeyring, 'base64'),
        StoredKeyRingType.TEAM_KEYRING,
      )
      this.logger.verbose(`Storing community metadata`)
      const encCommunity = (await this._encryptCommunity(
        community,
      )) as EncryptedCommunity
      const stored = await this.storage.addCommunity(encCommunity)
      if (!stored) {
        throw new Error(`Failed to store community!`)
      }

      this.logger.log(`Deserializing and joining team`)
      const serverKeysWithSecrets = await this.getServerKeys(
        community.teamId,
        AllowedServerKeyState.STORED_ONLY,
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
        community,
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

  public async update(
    teamId: string,
    updates: CommunityUpdate,
    wsOptions: CommunitiesHandlerOptions,
    forceFetch = false,
  ): Promise<ManagedCommunity> {
    this.logger.log(`Updating community for ID ${teamId}`)
    try {
      this.logger.log(`Storing updated community metadata`)
      const encUpdates = (await this._encryptCommunity(
        updates,
      )) as EncryptedCommunityUpdate
      const updated = await this.storage.updateCommunity(teamId, encUpdates)
      if (!updated) {
        throw new Error(`Failed to update stored community!`)
      }

      const alreadyHaveLocally = this.communities.has(teamId)
      const managedCommunity = await this.get(teamId, wsOptions, forceFetch)
      if (forceFetch || !alreadyHaveLocally) {
        return managedCommunity!
      }

      const updatedManagedCommunity: ManagedCommunity = {
        ...managedCommunity!,
        community: {
          ...managedCommunity!.community,
          ...updates,
        },
      }
      this.communities.set(teamId, updatedManagedCommunity)
      return updatedManagedCommunity
    } catch (e) {
      let reason: string | undefined = undefined
      if (
        e instanceof EncryptionBase64Error ||
        e instanceof EncryptionError ||
        e instanceof DecryptionError
      ) {
        reason = `Encryption error occurred while updating community`
      } else {
        reason = `Error while updating community`
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

  public async getServerKeys(
    teamId: string,
    allowedKeyState: AllowedServerKeyState,
  ): Promise<KeysetWithSecrets> {
    const existingKeyset = await this.serverKeyManager.retrieveKeyring(
      teamId,
      StoredKeyRingType.SERVER_KEYRING,
    )
    if (existingKeyset != null) {
      if (allowedKeyState === AllowedServerKeyState.NOT_STORED) {
        throw new Error(
          `Keys for this team were already stored but allowed state was set to ${AllowedServerKeyState.NOT_STORED}`,
        )
      }
      return JSON.parse(
        uint8arrays.toString(existingKeyset, 'utf8'),
      ) as KeysetWithSecrets
    }

    if (allowedKeyState === AllowedServerKeyState.STORED_ONLY) {
      throw new Error(
        `Keys for this team were not stored locally or in the secrets manager but the allowed state was set to ${AllowedServerKeyState.STORED_ONLY}`,
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
      StoredKeyRingType.SERVER_KEYRING,
    )

    return serverKeysWithSecrets
  }

  public async getTeamKeys(teamId: string): Promise<Keyring> {
    const teamKeys = await this.serverKeyManager.retrieveKeyring(
      teamId,
      StoredKeyRingType.TEAM_KEYRING,
    )

    if (teamKeys == null) {
      throw new Error(`Team keys for this team were not found`)
    }

    return JSON.parse(uint8arrays.toString(teamKeys, 'utf8')) as Keyring
  }

  private async _encryptCommunity(
    community: Community | CommunityUpdate,
  ): Promise<Partial<EncryptedCommunity>> {
    const encCommunity: Partial<EncryptedCommunity> = {
      teamId:
        (community as Community).teamId != null
          ? (community as Community).teamId
          : undefined,
      name: community.name,
      psk:
        community.psk != null
          ? await this.valueToEncryptedHex(community.psk)
          : undefined,
      peerList:
        community.peerList != null
          ? await this.valueToEncryptedHex(JSON.stringify(community.peerList))
          : undefined,
      sigChain: community.sigChain,
    }
    return Object.fromEntries(
      Object.entries(encCommunity).filter(([_, v]) => v != null),
    )
  }

  private async _decryptCommunity(
    encCommunity: EncryptedCommunity,
  ): Promise<Community> {
    return {
      teamId: encCommunity.teamId,
      name: encCommunity.name,
      psk: await this.encryptedHexToValue(encCommunity.psk),
      peerList: JSON.parse(
        await this.encryptedHexToValue(encCommunity.peerList),
      ) as string[],
      sigChain: encCommunity.sigChain,
    }
  }

  private async valueToEncryptedHex(value: string): Promise<string> {
    const encPayload = await this.serverKeyManager.encrypt(value)
    const encPayloadBytes = uint8arrays.fromString(
      JSON.stringify(encPayload),
      'utf8',
    )
    return uint8arrays.toString(encPayloadBytes, 'hex')
  }

  private async encryptedHexToValue(
    encHex: string,
    finalEncoding: 'utf8' | 'base64' | 'hex' = 'utf8',
  ): Promise<string> {
    const encPayloadBytes = uint8arrays.fromString(encHex, 'hex')
    const encPayload = JSON.parse(
      uint8arrays.toString(encPayloadBytes, 'utf8'),
    ) as EncryptedPayload
    const decryptedBytes = await this.serverKeyManager.decrypt(encPayload)
    return uint8arrays.toString(
      Uint8Array.from(Buffer.from(decryptedBytes)),
      finalEncoding,
    )
  }
}
