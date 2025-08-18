/**
 * Manages community-related operations
 */

import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common'
import { CommunitiesStorageService } from './storage/communities.storage.service.js'
import { createLogger } from '../app/logger/logger.js'
import {
  AllowedServerKeyState,
  AuthConnectionMap,
  CommunitiesData,
  Community,
  CommunityUpdate,
  CreatedCommunity,
  MANAGED_COMMUNITY_TTL_MS,
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
import {
  AuthenticationError,
  CommunityNotFoundError,
  CompoundError,
  SignatureMismatchError,
} from '../utils/errors.js'
import { HOSTNAME, SERIALIZER } from '../app/const.js'
import { SigChain } from './auth/sigchain.js'
import { AuthConnection } from './auth/auth.connection.js'
import { NativeServerWebsocketEvents } from '../websocket/ws.types.js'
import { AuthConnectionConfig, AuthStatus } from './auth/types.js'
import { Socket } from 'socket.io'
import { AuthDisconnectedPayload, AuthEvents } from './auth/auth.events.js'
import { DateTime } from 'luxon'
import { CommunitiesDataStorageService } from './storage/communities-data.storage.service.js'
import { DataSyncPayload } from './websocket/types/data-sync.types.js'
import { Serializer } from '../utils/serialization/serializer.service.js'

@Injectable()
export class CommunitiesManagerService implements OnModuleDestroy {
  /**
   * Map of team IDs to sigchains and associated LFA auth sync connections
   */
  private readonly communities = new Map<string, ManagedCommunity>()

  /**
   * Interval for checking for clearable locally stored communities
   */
  private readonly _communityExpiryHandler: NodeJS.Timeout

  private readonly logger = createLogger(CommunitiesManagerService.name)

  /* eslint-disable-next-line @typescript-eslint/max-params --  we can't do much about this */
  constructor(
    // hostname of the QSS server to provide to LFA
    @Inject(HOSTNAME) private readonly hostname: string,
    // serializer for converting between objects and buffers/uint8arrays and back to objects
    @Inject(SERIALIZER) private readonly serializer: Serializer,
    // DB abstraction layer service for community metadata (e.g. sigchains)
    private readonly storage: CommunitiesStorageService,
    // DB abstraction layer service for community sync data (e.g. messages)
    private readonly dataSyncStorage: CommunitiesDataStorageService,
    // service for managing creation/storage of server-owned LFA keys and user-generated keyrings
    private readonly serverKeyManager: ServerKeyManagerService,
  ) {
    // Setup community expiration handler to run once a minute
    this._clearUnusedCommunitiesFromMemory =
      this._clearUnusedCommunitiesFromMemory.bind(
        this,
      ) as typeof this._clearUnusedCommunitiesFromMemory
    this._communityExpiryHandler = setInterval(() => {
      this._clearUnusedCommunitiesFromMemory()
    }, 60_000)
  }

  public onModuleDestroy(): void {
    this.logger.info('Clearing CommunitesManagerService')
    clearTimeout(this._communityExpiryHandler)
    this.communities.clear()
  }

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
      throw new CommunityNotFoundError(teamId)
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

    // handle auth disconnection events (emitted when the LFA connection dies or the socket connection dies)
    // and remove auth connection from map/set expiry on community data in memory if no open connections left
    authConnection.on(
      AuthEvents.AuthDisconnected,
      (payload: AuthDisconnectedPayload) => {
        this.logger.verbose(`Got an ${AuthEvents.AuthDisconnected} event`)
        const managedCommunity = this.communities.get(payload.teamId)
        if (managedCommunity == null) {
          return
        }

        managedCommunity.authConnections?.delete(payload.userId)
        if ((managedCommunity.authConnections?.size ?? 0) === 0) {
          const communityExpiryMs =
            DateTime.utc().toMillis() + MANAGED_COMMUNITY_TTL_MS
          this.logger.verbose(
            'Community has no open auth connections, setting expiry',
            communityExpiryMs,
          )
          managedCommunity.expiryMs = communityExpiryMs
        }
      },
    )

    // handle websocket disconnects and stop the auth sync connection
    config.socket.on(NativeServerWebsocketEvents.Disconnect, () => {
      authConnection.stop()
    })

    authConnection.start()

    // ensure we remove the expiry if it was set now that we have an open connection
    if (this.communities.has(teamId)) {
      this.communities.set(teamId, {
        ...this.communities.get(teamId)!,
        expiryMs: undefined,
      })
      this.logger.verbose(this.communities.get(teamId))
    }
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
   * Validate that a user has permissions on a given community and then write the entry to postgres
   *
   * @param payload Data sync payload containing the encrypted oplog entry we are writing to the DB
   * @returns True if written, false if not written
   */
  public async processIncomingSyncMessage(
    payload: DataSyncPayload,
  ): Promise<boolean> {
    const managedCommunity = await this.get(payload.teamId)
    this._validateIncomingSyncMessage(payload, managedCommunity)

    // convert the message payload to a form writable to the DB
    // NOTE: the entry field is a binary column in postgres so we must losslessly serialize
    //       the object to a buffer
    const dbPayload: CommunitiesData = {
      communityId: payload.teamId,
      cid: payload.hashedDbId,
      entry: this.serializer.serialize(payload.encEntry),
      receivedAt: DateTime.utc(),
    }
    const written = await this.dataSyncStorage.addCommunitiesData(dbPayload)
    if (written) {
      this.logger.debug(
        'Data sync successfully written to the DB',
        dbPayload.cid,
      )
      // TODO: add fanout logic
    } else {
      this.logger.error('Data sync write to DB was unsuccessful', dbPayload.cid)
    }

    return written
  }

  /**
   * Validate that this user can write a sync entry to this community
   *
   * @param payload Data sync payload containing the encrypted oplog entry we are writing to the DB
   * @param managedCommunity Community this data sync is associated with
   */
  private _validateIncomingSyncMessage(
    payload: DataSyncPayload,
    managedCommunity: ManagedCommunity | undefined,
  ): void {
    if (managedCommunity == null) {
      throw new CommunityNotFoundError(payload.teamId)
    }

    // check if we have an auth connection for this user before anything else to make sure
    // they have signed in already
    if (
      managedCommunity.authConnections == null ||
      !managedCommunity.authConnections.has(payload.encEntry!.userId)
    ) {
      throw new AuthenticationError(`User hasn't signed in to this community`)
    }

    const authConnection = managedCommunity.authConnections.get(
      payload.encEntry!.userId,
    )!

    // validate that the user has successfully authenticated on this community
    switch (authConnection.status) {
      // if the user has just attempted to sign in we may not have validated that they are part of the community
      // NOTE: it is on the client to reattempt the sync later
      case AuthStatus.PENDING:
      case AuthStatus.JOINING:
        this.logger.warn(
          `Waiting for user to be authenticated before processing sync message`,
        )
        throw new AuthenticationError('User authentication pending')
      // if the user's auth connection instance is present but has disconnected we don't know if this is due to auth failure or
      // some other disconnect but we can't proceed
      case AuthStatus.REJECTED_OR_CLOSED:
        this.logger.warn(
          `User has either disconnected or was unable to authenticate against the sigchain, skipping sync message processing`,
        )
        throw new AuthenticationError('User not authenticated')
      // this is the only success state for auth status
      case AuthStatus.JOINED:
        this.logger.debug(
          'User is authenticated, continuing with processing sync message',
        )
        break
    }

    // validate that the user ID on the signature matches the one on the entry
    if (payload.encEntry?.userId !== payload.encEntry?.signature.author.name) {
      const entryUserId = payload.encEntry?.userId ?? 'USER_ID_UNDEFINED'
      const signatureUserId =
        payload.encEntry?.signature.author.name ?? 'USER_ID_UNDEFINED'
      throw new SignatureMismatchError(entryUserId, signatureUserId)
    }
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

    sigChain.on('update', async () => {
      await this.update(sigChain.team.id, {
        sigChain: sigChain.serialize(true),
      })
    })

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

  /**
   * Check for expired/stale communities in memory and delete if necessary (or remove expiry if there are
   * open connections)
   *
   * NOTE: This is run in an interval (see top of class)
   */
  private _clearUnusedCommunitiesFromMemory(): void {
    this.logger.debug('Checking for unused/stale communities in memory')
    for (const community of this.communities.values()) {
      if (community.expiryMs == null) {
        continue
      }

      if ((community.authConnections?.size ?? 0) > 0) {
        this.communities.set(community.teamId, {
          ...community,
          expiryMs: undefined,
        })
        continue
      }

      if (
        community.expiryMs != null &&
        community.expiryMs <= DateTime.utc().toMillis()
      ) {
        this.logger.verbose('Removing stale community', community.teamId)
        this.communities.delete(community.teamId)
      }
    }
  }
}
