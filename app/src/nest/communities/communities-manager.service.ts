/**
 * Manages community-related operations
 */

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
import { NativeServerWebsocketEvents } from '../websocket/ws.types.js'
import { AuthConnectionConfig } from './auth/types.js'
import { Socket } from 'socket.io'

@Injectable()
export class CommunitiesManagerService {
  /**
   * Map of team IDs to communities with related metadata and services
   */
  private readonly communities = new Map<string, ManagedCommunity>()

  private readonly logger = createLogger(CommunitiesManagerService.name)

  constructor(
    // hostname of the QSS server to provide to LFA
    @Inject(HOSTNAME) private readonly hostname: string,
    // DB abstraction layer service for community data
    private readonly storage: CommunitiesStorageService,
    // service for managing creation/storage of server-owned LFA keys and user-generated keyrings
    private readonly serverKeyManager: ServerKeyManagerService,
  ) {}

  /**
   * Get a community and its related metadata from storage or in-memory cache, if available
   *
   * @param teamId LFA team ID of the community we are retrieving
   * @param forceFetchFromStorage Force getting the community from storage even if we have it stored in-memory
   * @returns ManagedCommunity, if found
   */
  public async get(
    teamId: string,
    forceFetchFromStorage = false,
  ): Promise<ManagedCommunity | undefined> {
    if (this.communities.has(teamId) && !forceFetchFromStorage) {
      return this.communities.get(teamId)
    }

    const community = await this.storage.getCommunity(teamId)
    if (community == null) {
      this.logger.warn('Community not found in local cache or storage', teamId)
      return undefined
    }

    return await this._processCommunityToManagedCommunity(teamId, community)
  }

  /**
   * Create a new community from a sigchain/key ring provided by the user, store in the database and start syncing
   * with the user over the websocket
   *
   * @param userId ID of the user creating the community
   * @param community Community metadata
   * @param teamKeyring LFA key ring
   * @param socket Socket connection with the user creating the community
   * @returns New community
   */
  public async create(
    userId: string,
    community: Community,
    teamKeyring: string,
    socket: Socket,
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
      // store the team keyring in the AWS secrets manager
      await this.serverKeyManager.storeKeyring(
        community.teamId,
        serializedTeamKeyring,
        StoredKeyRingType.TEAM_KEYRING,
      )
      this.logger.verbose(`Storing community metadata`)
      // put the community metadata into the database
      const stored = await this.storage.addCommunity(community)
      if (!stored) {
        throw new Error(`Failed to store community!`)
      }

      this.logger.log(`Deserializing and joining team`)
      // get the previously created server LFA keys from the AWS secrets manager
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
        sigChain,
      })

      // start the LFA sync connection over the existing websocket
      this.startAuthSyncConnection(userId, community.teamId, {
        socket,
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

  /**
   * Update a community in storage and update our locally cached copy of the community
   *
   * @param teamId Team ID of the community we are updating
   * @param updates Fields to update
   */
  public async update(teamId: string, updates: CommunityUpdate): Promise<void> {
    this.logger.log(`Updating community for ID ${teamId}`)
    try {
      this.logger.log(`Storing updated community metadata`)
      const updated = await this.storage.updateCommunity(teamId, updates)
      if (!updated) {
        throw new Error(`Failed to update stored community!`)
      }
    } catch (e) {
      const reason = `Error while updating community`
      this.logger.error(`Error while updating community`, e)
      throw new CompoundError(reason, e as Error)
    }
  }

  /**
   * Start an LFA auth sync connection over an existing websocket connection with a user
   *
   * @param userId ID of the user we are connecting with
   * @param teamId Team ID of the community we are syncing
   * @param config Related metadata/config for this auth sync connection
   * @returns void
   */
  public startAuthSyncConnection(
    userId: string,
    teamId: string,
    config: AuthConnectionConfig,
  ): void {
    // get the community from the local cache or storage
    const managedCommunity = this.communities.get(teamId)
    if (managedCommunity == null) {
      throw new Error(`No community found for this team ID: ${teamId}`)
    }

    // return an existing auth connection, if found
    const authConnections: AuthConnectionMap =
      managedCommunity.authConnections ?? (new Map() as AuthConnectionMap)
    if (authConnections.get(userId) != null) {
      this.logger.debug(
        'Already had an auth connection for this user, reusing...',
      )
      return
    }

    // create and start a new LFA auth sync connection with this user
    const authConnection = new AuthConnection(
      userId,
      managedCommunity.sigChain,
      config,
    )
    authConnections.set(userId, authConnection)
    this.communities.set(teamId, {
      ...managedCommunity,
      authConnections,
    })

    authConnection.start()
    // handle websocket disconnects and stop the auth sync connection
    config.socket.on(NativeServerWebsocketEvents.Disconnect, () => {
      authConnection.stop()
      this.communities.get(teamId)!.authConnections?.delete(userId)
    })
  }

  /**
   * Get or generate an LFA keyset for a given team
   *
   * @param teamId ID of the team we are getting keys for
   * @param allowedKeyState Determines whether we require keys to exist or if they can be created ad-hoc
   * @returns LFA keyset
   */
  public async getServerKeys(
    teamId: string,
    allowedKeyState: AllowedServerKeyState,
  ): Promise<KeysetWithSecrets> {
    // fetch the existing keyset from the AWS secrets manager
    const existingKeyset = await this.serverKeyManager.retrieveKeyring(
      teamId,
      StoredKeyRingType.SERVER_KEYRING,
    )
    if (existingKeyset != null) {
      // if we require that a keyset must be newly generated throw an error when keys are already stored
      if (allowedKeyState === AllowedServerKeyState.NOT_STORED) {
        throw new Error(
          `Keys for this team were already stored but allowed state was set to ${AllowedServerKeyState.NOT_STORED}`,
        )
      }
      return JSON.parse(
        uint8arrays.toString(existingKeyset, 'utf8'),
      ) as KeysetWithSecrets
    }

    // if we require that a keyset must be already stored throw an error when not found in the secrets manager
    if (allowedKeyState === AllowedServerKeyState.STORED_ONLY) {
      throw new Error(
        `Keys for this team were not stored locally or in the secrets manager but the allowed state was set to ${AllowedServerKeyState.STORED_ONLY}`,
      )
    }

    // create a new LFA keyset for this team and store in the AWS secrets manager
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

  /**
   * Fetch and return the stored LFA team keyring for this community
   *
   * @param teamId ID of the team we are fetching the team keyring for
   * @returns Team keyring stored in the secrets manager
   */
  public async getTeamKeys(teamId: string): Promise<Keyring> {
    // get the team keyring from the AWS secrets manager
    const teamKeys = await this.serverKeyManager.retrieveKeyring(
      teamId,
      StoredKeyRingType.TEAM_KEYRING,
    )

    if (teamKeys == null) {
      throw new Error(`Team keys for this team were not found`)
    }

    return JSON.parse(uint8arrays.toString(teamKeys, 'utf8')) as Keyring
  }

  /**
   * Process a community into a managed community object
   *
   * @param teamId Team ID of the community we are turning into a managed community object
   * @param community Community metadata
   * @returns Managed community object that merges new data with existing managed community data
   */
  private async _processCommunityToManagedCommunity(
    teamId: string,
    community: Community,
  ): Promise<ManagedCommunity | undefined> {
    // server's personal keys created when joing this LFA sigchain
    let serverKeys: KeysetWithSecrets | undefined = undefined
    // team key ring owned by this LFA sigchain
    let teamKeys: Keyring | undefined = undefined
    try {
      // get the server keys from the AWS secrets manager and require that the keys already exist
      serverKeys = await this.getServerKeys(
        teamId,
        AllowedServerKeyState.STORED_ONLY,
      )
      // get the team key ring from the AWS secrets manager
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

    // if we already have a managed community for this team merge it with the new data
    const existingManagedCommunity = this.communities.get(teamId)
    const managedCommunity: ManagedCommunity = {
      ...(existingManagedCommunity ?? {}),
      teamId: community.teamId,
      sigChain,
    }
    // put the new managed community into memory
    this.communities.set(community.teamId, managedCommunity)
    return managedCommunity
  }
}
