import { Inject, Injectable } from '@nestjs/common'
import { CommunitiesStorageService } from './storage/communities.storage.service.js'
import { createLogger } from '../app/logger/logger.js'
import {
  AllowedServerKeyState,
  AuthConnectionMap,
  Community,
  CommunityUpdate,
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
import { StoredKeyRingType } from '../encryption/types.js'
import * as uint8arrays from 'uint8arrays'
import { CompoundError } from '../types.js'
import { HOSTNAME } from '../app/const.js'
import { SigChain } from './auth/sigchain.js'
import { AuthConnection } from './auth/auth.connection.js'
import { CommunitiesHandlerOptions } from './websocket/types/index.js'
import { NativeServerWebsocketEvents } from '../websocket/ws.types.js'
import { AuthConnectionOptions } from './auth/types.js'

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
    forceFetch = false,
  ): Promise<ManagedCommunity | undefined> {
    if (this.communities.has(teamId) && !forceFetch) {
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
    }
    this.communities.set(community.teamId, managedCommunity)
    return managedCommunity
  }

  public async create(
    userId: string,
    community: Community,
    teamKeyring: string,
    wsOptions: CommunitiesHandlerOptions,
  ): Promise<CreatedCommunity> {
    this.logger.log(`Adding new community for ID ${community.teamId}`)
    try {
      const serializedTeamKeyring = uint8arrays.fromString(
        teamKeyring,
        'base64',
      )
      const deserializedTeamKeyring: Keyring = JSON.parse(
        uint8arrays.toString(serializedTeamKeyring, 'utf8'),
      ) as Keyring
      this.logger.verbose(`Storing team keyset`)
      await this.serverKeyManager.storeKeyring(
        community.teamId,
        serializedTeamKeyring,
        StoredKeyRingType.TEAM_KEYRING,
      )
      this.logger.verbose(`Storing community metadata`)
      const stored = await this.storage.addCommunity(community)
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
      })

      this.startConnection(userId, community.teamId, {
        socket: wsOptions.socket,
        communitiesManager: this,
      })

      return {
        serverKeys: redactKeys(serverKeysWithSecrets) as Keyset,
        community,
      }
    } catch (e) {
      const reason = `Error while creating community`
      this.logger.error(reason, e)
      throw new CompoundError(reason, e as Error)
    }
  }

  public async update(
    teamId: string,
    updates: CommunityUpdate,
    forceFetch = false,
  ): Promise<ManagedCommunity> {
    this.logger.log(`Updating community for ID ${teamId}`)
    try {
      this.logger.log(`Storing updated community metadata`)
      const updated = await this.storage.updateCommunity(teamId, updates)
      if (!updated) {
        throw new Error(`Failed to update stored community!`)
      }

      const alreadyHaveLocally = this.communities.has(teamId)
      const managedCommunity = await this.get(teamId, forceFetch)
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
      const reason = `Error while updating community`
      this.logger.error(`Error while updating community`, e)
      throw new CompoundError(reason, e as Error)
    }
  }

  public startConnection(
    userId: string,
    teamId: string,
    options: AuthConnectionOptions,
  ): void {
    const managedCommunity = this.communities.get(teamId)
    if (managedCommunity == null) {
      throw new Error(`No community found for this team ID: ${teamId}`)
    }

    const authConnections: AuthConnectionMap =
      managedCommunity.authConnections ?? (new Map() as AuthConnectionMap)
    if (authConnections.get(userId) != null) {
      this.logger.debug(
        'Already had an auth connection for this user, reusing...',
      )
      return
    }

    const authConnection = new AuthConnection(
      userId,
      managedCommunity.sigChain,
      options,
    )
    authConnections.set(userId, authConnection)
    this.communities.set(teamId, {
      ...managedCommunity,
      authConnections,
    })

    authConnection.start()
    options.socket.on(NativeServerWebsocketEvents.Disconnect, () => {
      authConnection.stop()
      this.communities.get(teamId)!.authConnections?.delete(userId)
    })
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
}
