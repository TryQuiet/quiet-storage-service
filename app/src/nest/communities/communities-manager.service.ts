/* eslint-disable complexity -- will fix later*/
/* eslint-disable max-lines -- will fix later */
/**
 * Manages community-related operations
 */

import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common'
import { CommunitiesStorageService } from './storage/communities.storage.service.js'
import { createLogger } from '../app/logger/logger.js'
import {
  AllowedServerKeyState,
  AuthConnectionMap,
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
  CommunityNotFoundError,
  CompoundError,
  NoPopulatedCommunitiesError,
} from '../utils/errors.js'
import { HOSTNAME, SERIALIZER } from '../app/const.js'
import { SigChain } from './auth/sigchain.js'
import { AuthConnection } from './auth/auth.connection.js'
import {
  NativeServerWebsocketEvents,
  type QuietSocket,
} from '../websocket/ws.types.js'
import {
  AuthConnectionConfig,
  AuthStatus,
  type SigChainPersistenceSnapshot,
  SigchainEvents,
} from './auth/types.js'
import { AuthDisconnectedPayload, AuthEvents } from './auth/auth.events.js'
import { DateTime } from 'luxon'
import { LogEntrySyncStorageService } from './storage/log-entry-sync.storage.service.js'
import { Serializer } from '../utils/serialization/serializer.service.js'
import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'

const PERSISTENCE_RETRY_BASE_DELAY_MS = 100
const PERSISTENCE_RETRY_MAX_DELAY_MS = 5_000

@Injectable()
export class CommunitiesManagerService implements OnModuleDestroy {
  /**
   * Map of team IDs to sigchains and associated LFA auth sync connections
   */
  private readonly communities = new Map<string, ManagedCommunity>()

  /**
   * Per-team promise tails serialize graph/keyring persistence.
   */
  private readonly persistenceQueues = new Map<string, Promise<void>>()

  /**
   * Serialized keyrings already committed to secrets storage, by team ID.
   */
  private readonly lastPersistedKeyrings = new Map<string, string>()

  /**
   * Coalesced storage loads prevent multiple live SigChains for one cache miss.
   */
  private readonly communityLoads = new Map<
    string,
    Promise<ManagedCommunity | undefined>
  >()

  /**
   * Creates accepted before shutdown are allowed to finish before teardown.
   */
  private readonly communityCreates = new Set<Promise<CreatedCommunity>>()

  private shuttingDown = false

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
    // DB abstraction layer service for community log sync data (e.g. messages)
    private readonly logEntrySyncStorage: LogEntrySyncStorageService,
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

  public async onModuleDestroy(): Promise<void> {
    this.logger.info('Clearing CommunitesManagerService')
    this.shuttingDown = true
    clearTimeout(this._communityExpiryHandler)
    this._clearAllSigchainListeners()
    await Promise.allSettled([
      ...this.communityLoads.values(),
      ...this.communityCreates,
    ])
    // A load already in progress can attach a listener after the first pass.
    this._clearAllSigchainListeners()
    await Promise.allSettled(this.persistenceQueues.values())
    this.communities.clear()
    this.communityLoads.clear()
    this.communityCreates.clear()
    this.persistenceQueues.clear()
    this.lastPersistedKeyrings.clear()
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
    if (this.shuttingDown) {
      throw new Error(`Cannot load community ${teamId} during shutdown`)
    }

    const cachedCommunity = this.communities.get(teamId)
    if (cachedCommunity != null) {
      const activeConnectionCount = cachedCommunity.authConnections?.size ?? 0
      if (!forceFetchFromStorage || activeConnectionCount > 0) {
        if (forceFetchFromStorage && activeConnectionCount > 0) {
          this.logger.warn(
            `Skipping forced reload for ${teamId}; ${activeConnectionCount} auth connection(s) still use its sigchain`,
          )
        }
        return cachedCommunity
      }
    }

    const existingLoad = this.communityLoads.get(teamId)
    if (existingLoad != null) {
      return await existingLoad
    }

    const load = this._loadCommunity(teamId)
    this.communityLoads.set(teamId, load)
    try {
      return await load
    } finally {
      if (this.communityLoads.get(teamId) === load) {
        this.communityLoads.delete(teamId)
      }
    }
  }

  /**
   * Create a new community from a sigchain/key ring provided by the user, store in the database and start syncing
   * with the user over the websocket
   *
   * @param userId ID of the user creating the community
   * @param deviceId ID of the device creating the community
   * @param community Community metadata
   * @param teamKeyring LFA key ring
   * @param socket Socket connection with the user creating the community
   * @returns New community
   */
  // eslint-disable-next-line @typescript-eslint/max-params -- connection identity requires both user and device IDs
  public async create(
    userId: string,
    deviceId: string,
    community: Community,
    teamKeyring: string,
    socket: QuietSocket,
  ): Promise<CreatedCommunity> {
    if (this.shuttingDown) {
      throw new Error(
        `Cannot create community ${community.teamId} during shutdown`,
      )
    }

    const creation = this._create(
      userId,
      deviceId,
      community,
      teamKeyring,
      socket,
    )
    this.communityCreates.add(creation)
    try {
      return await creation
    } finally {
      this.communityCreates.delete(creation)
    }
  }

  // eslint-disable-next-line @typescript-eslint/max-params -- connection identity requires both user and device IDs
  private async _create(
    userId: string,
    deviceId: string,
    community: Community,
    teamKeyring: string,
    socket: QuietSocket,
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
      const userCount = sigChain.team.members().length
      if (userCount > 1) {
        throw new NoPopulatedCommunitiesError(community.teamId, userCount)
      }

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

      this._setLastPersistedKeyring(community.teamId, serializedTeamKeyring)
      const chainEventHandler = this.addSigchainListener(sigChain)
      this.communities.set(community.teamId, {
        teamId: community.teamId,
        sigChain,
        chainEventHandler,
      })

      // Prepare the server-side LFA connection before returning the create
      // response. The first validated client auth-sync frame starts it after
      // the client has received the response and initialized its connection.
      this.prepareAuthSyncConnection(userId, deviceId, community.teamId, {
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
   * Prepare an LFA auth sync connection over an existing websocket connection
   * with a user. The first validated client auth-sync frame starts the
   * connection.
   *
   * @param userId ID of the user we are connecting with
   * @param deviceId ID of the device we are connecting with
   * @param teamId Team ID of the community we are syncing
   * @param config Related metadata/config for this auth sync connection
   * @returns void
   */
  public prepareAuthSyncConnection(
    userId: string,
    deviceId: string,
    teamId: string,
    config: AuthConnectionConfig,
  ): void {
    // get the community from the local cache or storage
    const managedCommunity = this.communities.get(teamId)
    if (managedCommunity == null) {
      throw new CommunityNotFoundError(teamId)
    }

    // return an existing auth connection, if found and still valid for this socket
    const authConnections: AuthConnectionMap =
      managedCommunity.authConnections ?? (new Map() as AuthConnectionMap)
    const connectionContext = `teamId=${teamId} userId=${userId} deviceId=${deviceId} socketId=${config.socket.id}`
    this.logger.debug(
      `Preparing auth connection request: ${connectionContext} mappedConnections=${authConnections.size}`,
    )

    const existingConn = authConnections.get(deviceId)
    if (existingConn != null) {
      if (
        existingConn.socketId === config.socket.id &&
        existingConn.status !== AuthStatus.REJECTED_OR_CLOSED
      ) {
        this.logger.debug(
          `Reusing mapped auth connection: ${connectionContext} status=${existingConn.status} mappedConnections=${authConnections.size}`,
        )
        return
      }
      // Stale connection: belongs to a previous socket or is dead. Stop it before creating a new one.
      this.logger.debug(
        `Replacing mapped auth connection: teamId=${teamId} deviceId=${deviceId} requestedUserId=${userId} existingUserId=${existingConn.userId} oldSocketId=${existingConn.socketId} newSocketId=${config.socket.id} previousStatus=${existingConn.status} mappedConnections=${authConnections.size}`,
      )
      existingConn.stop()
      authConnections.delete(deviceId)
      this.logger.debug(
        `Removed previous auth connection mapping: ${connectionContext} remainingConnections=${authConnections.size}`,
      )
    }

    // Create and map a new LFA auth sync connection. Starting it here can emit
    // an auth-sync frame before the create/sign-in acknowledgement reaches the
    // client, so handleAuthSync starts it when the first client frame arrives.
    const authConnection = new AuthConnection(
      userId,
      deviceId,
      managedCommunity.sigChain,
      config,
    )
    authConnections.set(deviceId, authConnection)
    this.communities.set(teamId, {
      ...managedCommunity,
      authConnections,
    })
    this.logger.debug(
      `Mapped new auth connection: ${connectionContext} status=${authConnection.status} mappedConnections=${authConnections.size}`,
    )

    // handle auth disconnection events (emitted when the LFA connection dies or the socket connection dies)
    // and remove auth connection from map/set expiry on community data in memory if no open connections left
    authConnection.on(
      AuthEvents.AuthDisconnected,
      (payload: AuthDisconnectedPayload) => {
        const disconnectedContext = `teamId=${payload.teamId} userId=${payload.userId} deviceId=${payload.deviceId} socketId=${authConnection.socketId}`
        this.logger.debug(
          `Received auth disconnect: ${disconnectedContext} status=${authConnection.status}`,
        )
        const managedCommunity = this.communities.get(payload.teamId)
        if (managedCommunity == null) {
          this.logger.debug(
            `Ignoring auth disconnect because community is no longer mapped: ${disconnectedContext}`,
          )
          return
        }

        const storedConnection = managedCommunity.authConnections?.get(
          payload.deviceId,
        )
        if (storedConnection !== authConnection) {
          this.logger.debug(
            `Ignoring stale auth disconnect for replaced mapping: ${disconnectedContext} mappedSocketId=${storedConnection?.socketId ?? 'none'} mappedStatus=${storedConnection?.status ?? 'none'}`,
          )
          return
        }
        managedCommunity.authConnections?.delete(payload.deviceId)
        const remainingConnections = managedCommunity.authConnections?.size ?? 0
        this.logger.debug(
          `Unmapped auth connection after disconnect: ${disconnectedContext} remainingConnections=${remainingConnections}`,
        )
        if (remainingConnections === 0) {
          const communityExpiryMs =
            DateTime.utc().toMillis() + MANAGED_COMMUNITY_TTL_MS
          this.logger.debug(
            `Community has no mapped auth connections; setting expiry: teamId=${payload.teamId} expiryMs=${communityExpiryMs}`,
          )
          managedCommunity.expiryMs = communityExpiryMs
        }
      },
    )

    // handle websocket disconnects and stop the auth sync connection
    config.socket.on(NativeServerWebsocketEvents.Disconnect, () => {
      this.logger.debug(
        `Socket disconnected; stopping auth connection: ${connectionContext} status=${authConnection.status}`,
      )
      authConnection.stop()
    })

    // ensure we remove the expiry if it was set now that we have an open connection
    if (this.communities.has(teamId)) {
      this.communities.set(teamId, {
        ...this.communities.get(teamId)!,
        expiryMs: undefined,
      })
      this.logger.debug(
        `Cleared community expiry for mapped auth connection: ${connectionContext}`,
      )
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

    // Replacing a SigChain would strand AuthConnections that still reference
    // the current instance. Keep it until those connections have closed.
    const existingManagedCommunity = this.communities.get(teamId)
    if (
      existingManagedCommunity != null &&
      (existingManagedCommunity.authConnections?.size ?? 0) > 0
    ) {
      const activeConnectionCount =
        existingManagedCommunity.authConnections?.size ?? 0
      this.logger.warn(
        `Keeping cached community ${teamId}; ${activeConnectionCount} auth connection(s) still use its sigchain`,
      )
      return existingManagedCommunity
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
    if (existingManagedCommunity != null) {
      this.clearSigchainListeners(
        existingManagedCommunity.sigChain,
        existingManagedCommunity.chainEventHandler,
      )
    }
    this._setLastPersistedKeyring(
      teamId,
      uint8arrays.fromString(JSON.stringify(teamKeys), 'utf8'),
    )
    const chainEventHandler = this.addSigchainListener(sigChain)
    const managedCommunity: ManagedCommunity = {
      ...(existingManagedCommunity ?? {}),
      teamId: community.teamId,
      sigChain,
      chainEventHandler,
    }
    // put the new managed community into memory
    this.communities.set(community.teamId, managedCommunity)
    return managedCommunity
  }

  private async _loadCommunity(
    teamId: string,
  ): Promise<ManagedCommunity | undefined> {
    if (this.shuttingDown) {
      throw new Error(`Cannot load community ${teamId} during shutdown`)
    }

    // A cache miss can race expiry cleanup, which removes the in-memory
    // community before its final queued snapshot reaches storage.
    await this._drainPersistenceQueue(teamId)

    const community = await this.storage.getCommunity(teamId)
    if (community == null) {
      this.logger.warn('Community not found in local cache or storage', teamId)
      return undefined
    }

    return await this._processCommunityToManagedCommunity(teamId, community)
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
        this.clearSigchainListeners(
          community.sigChain,
          community.chainEventHandler,
        )
        this.communities.delete(community.teamId)
        void this._drainPersistenceQueue(community.teamId).then(() => {
          this.lastPersistedKeyrings.delete(community.teamId)
        })
      }
    }
  }

  private readonly addSigchainListener = (sigChain: SigChain): (() => void) => {
    this.logger.debug('Attaching chain update listener(s)', sigChain.team.id)
    const handler = this._updateDbOnChainUpdate(sigChain)
    sigChain.on(SigchainEvents.UPDATED, handler)
    return handler
  }

  private readonly clearSigchainListeners = (
    sigChain: SigChain,
    handler: () => void,
  ): void => {
    this.logger.debug('Clearing chain update listeners', sigChain.team.id)
    sigChain.clearListeners()
    sigChain.removeListener(SigchainEvents.UPDATED, handler)
  }

  private readonly _updateDbOnChainUpdate =
    (sigChain: SigChain): (() => void) =>
    (): void => {
      this._enqueueSigchainPersistence(sigChain)
    }

  private _enqueueSigchainPersistence(sigChain: SigChain): void {
    if (this.shuttingDown) {
      return
    }

    const teamId = sigChain.team.id
    const previous = this.persistenceQueues.get(teamId) ?? Promise.resolve()
    const previousSettled = previous.catch(() => {
      // The rejected snapshot was logged when its queue tail settled. Keep
      // later snapshots moving so the newest state can still converge.
    })
    const capturedSnapshot = Promise.resolve().then(() =>
      sigChain.serializeForPersistence(),
    )
    const queued = Promise.all([previousSettled, capturedSnapshot]).then(
      async ([, snapshot]) => {
        await this._persistSigchainSnapshotWithRetry(snapshot)
      },
    )

    this.persistenceQueues.set(teamId, queued)
    void queued.then(
      () => {
        this._removeSettledPersistenceQueue(teamId, queued)
      },
      (error: unknown) => {
        this.logger.error(
          `Failed to persist sigchain snapshot for ${teamId}`,
          error,
        )
        this._removeSettledPersistenceQueue(teamId, queued)
      },
    )
  }

  private async _persistSigchainSnapshot(
    snapshot: SigChainPersistenceSnapshot,
  ): Promise<void> {
    const keyringFingerprint = this._keyringFingerprint(snapshot.teamKeyring)
    if (
      this.lastPersistedKeyrings.get(snapshot.teamId) !== keyringFingerprint
    ) {
      await this.serverKeyManager.updateKeyring(
        snapshot.teamId,
        snapshot.teamKeyring,
        StoredKeyRingType.TEAM_KEYRING,
      )
      this.lastPersistedKeyrings.set(snapshot.teamId, keyringFingerprint)
    }

    await this.update(snapshot.teamId, {
      sigChain: snapshot.sigChain,
    })
  }

  private async _persistSigchainSnapshotWithRetry(
    snapshot: SigChainPersistenceSnapshot,
  ): Promise<void> {
    let attempt = 0
    let shutdownRetryAttempted = false
    while (true) {
      try {
        await this._persistSigchainSnapshot(snapshot)
        return
      } catch (error) {
        attempt += 1

        if (this.shuttingDown && shutdownRetryAttempted) {
          throw error
        }

        const retryingDuringShutdown = this.shuttingDown
        shutdownRetryAttempted ||= retryingDuringShutdown
        const delayMs = retryingDuringShutdown
          ? PERSISTENCE_RETRY_BASE_DELAY_MS
          : Math.min(
              PERSISTENCE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
              PERSISTENCE_RETRY_MAX_DELAY_MS,
            )
        this.logger.warn(
          `Retrying sigchain snapshot persistence for ${snapshot.teamId} after attempt ${attempt}`,
          error,
        )
        await sleep(delayMs)
      }
    }
  }

  private async _drainPersistenceQueue(teamId: string): Promise<void> {
    while (true) {
      const pending = this.persistenceQueues.get(teamId)
      if (pending == null) {
        return
      }
      await pending.catch(() => undefined)
      if (this.persistenceQueues.get(teamId) === pending) {
        return
      }
    }
  }

  private _setLastPersistedKeyring(
    teamId: string,
    serializedKeyring: Uint8Array,
  ): void {
    this.lastPersistedKeyrings.set(
      teamId,
      this._keyringFingerprint(serializedKeyring),
    )
  }

  private _keyringFingerprint(serializedKeyring: Uint8Array): string {
    const keyring = JSON.parse(
      uint8arrays.toString(serializedKeyring, 'utf8'),
    ) as Keyring
    const canonicalKeyring = Object.fromEntries(
      Object.entries(keyring).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    )
    return createHash('sha256')
      .update(JSON.stringify(canonicalKeyring))
      .digest('base64')
  }

  private _removeSettledPersistenceQueue(
    teamId: string,
    settled: Promise<void>,
  ): void {
    if (this.persistenceQueues.get(teamId) === settled) {
      this.persistenceQueues.delete(teamId)
    }
  }

  private _clearAllSigchainListeners(): void {
    for (const community of this.communities.values()) {
      this.clearSigchainListeners(
        community.sigChain,
        community.chainEventHandler,
      )
    }
  }
}
