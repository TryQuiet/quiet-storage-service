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
  createServer,
  redactKeys,
  Keyset,
  ServerWithSecrets,
  Team,
} from '@localfirst/auth'
import { ServerKeyManagerService } from '../encryption/server-key-manager.service.js'
import { StoredKeyRingType } from '../encryption/types.js'
import * as uint8arrays from 'uint8arrays'
import {
  AdmittingSigChainReplacedError,
  CommunityNotFoundError,
  CompoundError,
  NoPopulatedCommunitiesError,
} from '../utils/errors.js'
import { HOSTNAME, SERIALIZER } from '../app/const.js'
import { SigChain } from './auth/sigchain.js'
import { AuthConnection } from './auth/auth.connection.js'
import { NativeServerWebsocketEvents } from '../websocket/ws.types.js'
import {
  AuthConnectionConfig,
  AuthStatus,
  SigchainEvents,
} from './auth/types.js'
import { Socket } from 'socket.io'
import { AuthDisconnectedPayload, AuthEvents } from './auth/auth.events.js'
import { DateTime } from 'luxon'
import { LogEntrySyncStorageService } from './storage/log-entry-sync.storage.service.js'
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

  /**
   * Per-team tail of the durable-persistence queue.
   *
   * Every write of a team's keyring and graph is chained onto this promise, so two persists that
   * overlap can't interleave their writes and leave an older serialization committed on top of a
   * newer one. `pending` counts writes that have been queued but haven't settled; the expiry sweep
   * uses it to avoid dropping a team's queue out from under an in-flight write.
   */
  private readonly persistQueues = new Map<
    string,
    { tail: Promise<void>; pending: number }
  >()

  /**
   * Fingerprint of the team keyring most recently written to the secrets manager, per team.
   *
   * QSS used to store the team keyring only at community creation, so once team keys rotated the
   * newest generation existed nowhere durable: a cold reload of the stored graph failed with
   * "Can't decrypt link" (GLOBAL-QSS-002 / private#192). Remembering what we last wrote lets us
   * re-store the keyring exactly when it has changed, and skip the write when it hasn't.
   */
  private readonly persistedTeamKeyringFingerprints = new Map<string, string>()

  /**
   * In-flight community load per team.
   *
   * Two concurrent cache misses used to build two `SigChain` instances for the same community and
   * race to install them. A connection holds the instance it was constructed over, so the loser's
   * graph could be persisted in place of the one that actually admitted an invitee. Loads are
   * single-flight per team: everyone waits on the same load and gets the same instance.
   */
  private readonly communityLoads = new Map<
    string,
    Promise<ManagedCommunity | undefined>
  >()

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

  public onModuleDestroy(): void {
    this.logger.info('Clearing CommunitesManagerService')
    clearTimeout(this._communityExpiryHandler)
    this.communities.clear()
    this.persistQueues.clear()
    this.persistedTeamKeyringFingerprints.clear()
    this.communityLoads.clear()
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

    // Join a load that is already running for this team rather than starting a second one; two
    // loads would build two sigchains for the same community and one would replace the other.
    const inFlight = this.communityLoads.get(teamId)
    if (inFlight != null) {
      this.logger.verbose('Joining an in-flight community load', teamId)
      return await inFlight
    }

    const load = this.loadCommunityFromStorage(teamId)
    this.communityLoads.set(teamId, load)
    try {
      return await load
    } finally {
      this.communityLoads.delete(teamId)
    }
  }

  /**
   * Read a community out of storage and turn it into a managed community
   *
   * @param teamId Team ID of the community we are loading
   * @returns Managed community, if one is stored
   */
  private async loadCommunityFromStorage(
    teamId: string,
  ): Promise<ManagedCommunity | undefined> {
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

      this.logger.log(`Deserializing and joining team`)
      // get the previously created server identity from the AWS secrets manager
      const serverWithSecrets = await this.getServerKeys(
        community.teamId,
        AllowedServerKeyState.STORED_ONLY,
      )
      const rawSigchain = uint8arrays.fromString(community.sigChain, 'hex')
      const localServerContext: LocalServerContext = {
        server: serverWithSecrets,
      }

      const sigChain: SigChain = SigChain.create(
        rawSigchain,
        localServerContext,
        deserializedTeamKeyring,
      )
      const chainEventHandler = this.addSigchainListener(sigChain)

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
      // record what we just wrote so the next persist only re-stores the keyring if it changed
      this.persistedTeamKeyringFingerprints.set(
        community.teamId,
        CommunitiesManagerService.fingerprintTeamKeyring(
          deserializedTeamKeyring,
        ),
      )
      this.logger.verbose(`Storing community metadata`)
      // put the community metadata into the database
      const stored = await this.storage.addCommunity(community)
      if (!stored) {
        throw new Error(`Failed to store community!`)
      }

      this.communities.set(community.teamId, {
        teamId: community.teamId,
        sigChain,
        chainEventHandler,
      })

      // start the LFA sync connection over the existing websocket
      this.startAuthSyncConnection(userId, community.teamId, {
        socket,
        communitiesManager: this,
      })

      return {
        serverKeys: redactKeys(serverWithSecrets.keys) as Keyset,
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
   * Durably persist a community's current LFA state before anything is allowed to depend on it.
   *
   * The team keyring is written first and the serialized graph second. That order is the whole
   * point: a crash between the two writes then leaves a stored keyring that is a superset of what
   * the stored graph needs, which reloads cleanly. The reverse order can store a graph whose links
   * are encrypted under a keyset that was never written down, which is unrecoverable.
   *
   * Writes are serialized per team, and the graph is serialized inside the queued task rather than
   * at call time, so a persist that starts later always commits state at least as new as one that
   * started earlier.
   *
   * @param teamId Team ID of the community to persist
   * @throws CommunityNotFoundError if the community isn't loaded, or the underlying error if
   *   either write fails
   */
  public async persistCommunity(teamId: string): Promise<void> {
    const managedCommunity = this.communities.get(teamId)
    if (managedCommunity == null) {
      throw new CommunityNotFoundError(teamId)
    }

    await this.persistTeamState(teamId, managedCommunity.sigChain.team)
  }

  /**
   * Durably persist the exact team an LFA connection has just admitted someone into.
   *
   * This is the durable-admission gate. localfirst/auth hands us the `Team` object it appended the
   * ADMIT_* link to, and that object — not "whatever this community currently maps to" — is what
   * has to reach storage before the acceptance is released. Looking the community up by id instead
   * would let a cache replacement commit a different graph, one without the admission, and the
   * connection would then release the graph and keyring anyway.
   *
   * Fails closed if the manager no longer holds this instance for the community, which the caller
   * turns into ADMISSION_NOT_PERSISTED with nothing sent to the invitee.
   *
   * @param team Team the connection admitted into
   * @throws CommunityNotFoundError if the community isn't loaded, AdmittingSigChainReplacedError if
   *   it is no longer the instance we hold, or the underlying error if either write fails
   */
  public async persistAdmittedTeam(team: Team): Promise<void> {
    const teamId = team.id
    const managedCommunity = this.communities.get(teamId)
    if (managedCommunity == null) {
      throw new CommunityNotFoundError(teamId)
    }
    if (managedCommunity.sigChain.team !== team) {
      throw new AdmittingSigChainReplacedError(teamId)
    }

    await this.persistTeamState(teamId, team)
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

    // return an existing auth connection, if found and still valid for this socket
    const authConnections: AuthConnectionMap =
      managedCommunity.authConnections ?? (new Map() as AuthConnectionMap)
    const existingConn = authConnections.get(userId)
    if (existingConn != null) {
      if (
        existingConn.socketId === config.socket.id &&
        existingConn.status !== AuthStatus.REJECTED_OR_CLOSED
      ) {
        this.logger.debug(
          'Already had an active auth connection for this user on the same socket, reusing...',
        )
        return
      }
      // Stale connection: belongs to a previous socket or is dead. Stop it before creating a new one.
      this.logger.log(
        `Replacing stale auth connection; previousStatus=${existingConn.status}`,
      )
      this.logger.debug(
        `Replacing stale auth connection for user ${userId} (oldSocket=${existingConn.socketId}, newSocket=${config.socket.id}, status=${existingConn.status})`,
      )
      existingConn.stop()
      authConnections.delete(userId)
    }

    // create and start a new LFA auth sync connection with this user. The connection is handed the
    // callback that makes an admission durable; localfirst/auth invokes it before releasing an
    // acceptance to an invitee.
    const authConnection = new AuthConnection(
      userId,
      managedCommunity.sigChain,
      {
        ...config,
        persistAdmission: async (team: Team): Promise<void> => {
          await this.persistAdmittedTeam(team)
        },
      },
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
  ): Promise<ServerWithSecrets> {
    // fetch the existing server identity from the AWS secrets manager
    const existingServer = await this.serverKeyManager.retrieveKeyring(
      teamId,
      StoredKeyRingType.SERVER_KEYRING,
    )
    if (existingServer != null) {
      // if we require that a server identity must be newly generated throw an error when one is already stored
      if (allowedKeyState === AllowedServerKeyState.NOT_STORED) {
        throw new Error(
          `Keys for this team were already stored but allowed state was set to ${AllowedServerKeyState.NOT_STORED}`,
        )
      }
      return JSON.parse(
        uint8arrays.toString(existingServer, 'utf8'),
      ) as ServerWithSecrets
    }

    // if we require that a server identity must be already stored throw an error when not found in the secrets manager
    if (allowedKeyState === AllowedServerKeyState.STORED_ONLY) {
      throw new Error(
        `Keys for this team were not stored locally or in the secrets manager but the allowed state was set to ${AllowedServerKeyState.STORED_ONLY}`,
      )
    }

    // Create a new self-certifying server identity for this team and store it. A server now has two
    // keysets: an immutable signing identity (`identityKeys`, whose fingerprint is the stable
    // `serverId`) and a rotatable member keyset (`keys`). We persist the whole ServerWithSecrets, so
    // every later retrieval returns the same identity — `serverId` is stable per team, which is what
    // the client's `hasServer(serverId)` dedupe relies on.
    this.logger.log(`Initializing new server identity for ${teamId}`)
    const serverWithSecrets = createServer({
      host: this.hostname,
      seed: this.serverKeyManager.generateRandomBytes(32, 'base64'),
    })
    await this.serverKeyManager.storeKeyring(
      teamId,
      uint8arrays.fromString(JSON.stringify(serverWithSecrets), 'utf8'),
      StoredKeyRingType.SERVER_KEYRING,
    )

    return serverWithSecrets
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
    // Never swap the sigchain out from under work that is already using it. An auth connection
    // appends ADMIT_* to the specific instance it was built over, and a queued write serializes a
    // specific instance; replacing either would let QSS commit a graph that is missing an admission
    // whose acceptance is about to go out (QSS-006 / private#203).
    const liveManagedCommunity = this.communities.get(teamId)
    if (liveManagedCommunity != null && this.communityIsLive(teamId)) {
      this.logger.warn(
        'Community has live auth connections or pending writes, keeping the in-memory sigchain instead of reloading it',
        teamId,
      )
      return liveManagedCommunity
    }

    // server's self-certifying identity created when joining this LFA sigchain
    let server: ServerWithSecrets | undefined = undefined
    // team key ring owned by this LFA sigchain
    let teamKeys: Keyring | undefined = undefined
    try {
      // get the server identity from the AWS secrets manager and require that it already exists
      server = await this.getServerKeys(
        teamId,
        AllowedServerKeyState.STORED_ONLY,
      )
      // get the team key ring from the AWS secrets manager
      teamKeys = await this.getTeamKeys(teamId)
      // this is the keyring currently in durable storage, so treat it as the last thing persisted
      this.persistedTeamKeyringFingerprints.set(
        teamId,
        CommunitiesManagerService.fingerprintTeamKeyring(teamKeys),
      )
    } catch (e) {
      this.logger.error(
        `Error occurred while pulling keys from secrets manager`,
        e,
      )
      return undefined
    }

    const rawSigchain = uint8arrays.fromString(community.sigChain, 'hex')
    const localServerContext: LocalServerContext = {
      server,
    }
    const sigChain: SigChain = SigChain.create(
      rawSigchain,
      localServerContext,
      teamKeys,
    )

    const chainEventHandler = this.addSigchainListener(sigChain)

    // if we already have a managed community for this team merge it with the new data
    const existingManagedCommunity = this.communities.get(teamId)
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

  /**
   * Persist a specific team, keyring first and graph second, on that team's queue.
   *
   * Takes the team object explicitly rather than looking the community up by id, so that what
   * reaches storage is always the graph the caller is holding — the one an admission was appended
   * to, or the one a chain-update listener is attached to — even if the cache has moved on.
   *
   * @param teamId Team ID of the community we are persisting
   * @param team Team whose state we are persisting
   */
  private async persistTeamState(teamId: string, team: Team): Promise<void> {
    await this.enqueuePersist(teamId, async () => {
      await this.persistTeamKeyringIfChanged(teamId, team)
      await this.update(teamId, {
        sigChain: uint8arrays.toString(team.save(), 'hex'),
      })
    })
  }

  /**
   * Is anything currently depending on this community's in-memory sigchain instance?
   *
   * @param teamId Team ID to check
   * @returns True if an auth connection holds it or a queued write still refers to it
   */
  private communityIsLive(teamId: string): boolean {
    const managedCommunity = this.communities.get(teamId)
    const openConnections = managedCommunity?.authConnections?.size ?? 0
    const pendingWrites = this.persistQueues.get(teamId)?.pending ?? 0
    return openConnections > 0 || pendingWrites > 0
  }

  /**
   * Run a persistence task after every task already queued for this team has settled
   *
   * @param teamId Team ID whose queue we are joining
   * @param task Work to run once the queue drains
   */
  private async enqueuePersist(
    teamId: string,
    task: () => Promise<void>,
  ): Promise<void> {
    const queue = this.persistQueues.get(teamId) ?? {
      tail: Promise.resolve(),
      pending: 0,
    }
    queue.pending += 1
    this.persistQueues.set(teamId, queue)

    // Wait for the previous write to settle either way — a failed persist orders later writes but
    // must never wedge the queue.
    const current = queue.tail.then(task, task)
    // The stored tail must not be a rejected promise nobody handles; the caller gets `current`.
    queue.tail = current.then(
      () => {
        queue.pending -= 1
      },
      () => {
        queue.pending -= 1
      },
    )

    await current
  }

  /**
   * Write the team's current keyring to the secrets manager if it differs from the one we last
   * stored for this team
   *
   * @param teamId Team ID of the community we are persisting
   * @param team Team holding the keyring
   */
  private async persistTeamKeyringIfChanged(
    teamId: string,
    team: Team,
  ): Promise<void> {
    // the pinned auth package's generated declarations lose the concrete keyring type
    const teamKeyring = team.teamKeyring() as Keyring
    const fingerprint =
      CommunitiesManagerService.fingerprintTeamKeyring(teamKeyring)
    if (fingerprint === this.persistedTeamKeyringFingerprints.get(teamId)) {
      this.logger.verbose(
        `Team keyring is unchanged since the last persist, skipping`,
        teamId,
      )
      return
    }

    this.logger.log(`Storing updated team keyring`, teamId)
    await this.serverKeyManager.storeKeyring(
      teamId,
      uint8arrays.fromString(JSON.stringify(teamKeyring), 'utf8'),
      StoredKeyRingType.TEAM_KEYRING,
      // the team keyring is rotatable, so re-storing it has to replace what is already there
      true,
    )
    this.persistedTeamKeyringFingerprints.set(teamId, fingerprint)
  }

  /**
   * Identify a keyring by the public part of every keyset it holds.
   *
   * A keyring is a map of keysets indexed by their public encryption key, so the sorted set of
   * those ids and the generation each belongs to changes exactly when the keyring gains or rotates
   * a keyset. No secret material goes into the fingerprint.
   *
   * @param keyring Keyring to fingerprint
   * @returns Stable string identifying the keyring's contents
   */
  private static fingerprintTeamKeyring(keyring: Keyring): string {
    return Object.entries(keyring)
      .map(([id, keys]) => `${id}:${keys.type}:${keys.name}:${keys.generation}`)
      .sort()
      .join('|')
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
        // don't tear a community down while one of its writes is still in flight
        const persistQueue = this.persistQueues.get(community.teamId)
        if (persistQueue != null && persistQueue.pending > 0) {
          this.logger.verbose(
            'Community has a persist in flight, deferring removal',
            community.teamId,
          )
          continue
        }

        this.logger.verbose('Removing stale community', community.teamId)
        this.clearSigchainListeners(
          community.sigChain,
          community.chainEventHandler,
        )
        this.communities.delete(community.teamId)
        this.persistQueues.delete(community.teamId)
        this.persistedTeamKeyringFingerprints.delete(community.teamId)
      }
    }
  }

  private readonly addSigchainListener = (
    sigChain: SigChain,
  ): (() => Promise<void>) => {
    this.logger.debug('Attaching chain update listener(s)', sigChain.team.id)
    const handler = this._updateDbOnChainUpdate(sigChain)
    sigChain.on(SigchainEvents.UPDATED, handler)
    return handler
  }

  private readonly clearSigchainListeners = (
    sigChain: SigChain,
    handler: () => Promise<void>,
  ): void => {
    this.logger.debug('Clearing chain update listeners', sigChain.team.id)
    sigChain.clearListeners()
    sigChain.removeListener(SigchainEvents.UPDATED, handler)
  }

  /**
   * Persist the chain whenever LFA reports that it changed.
   *
   * This listener still covers every dispatch that isn't an admission — removals, rotations,
   * role changes — and admissions reach durable storage through the connection's
   * `persistAdmission` hook before any acceptance is released. LFA emits `updated` synchronously
   * from `Team.dispatch` and drops the promise we return, so a failure here has to be reported
   * rather than propagated.
   */
  private readonly _updateDbOnChainUpdate =
    (sigChain: SigChain): (() => Promise<void>) =>
    async (): Promise<void> => {
      try {
        await this.persistTeamState(sigChain.team.id, sigChain.team)
      } catch (e) {
        this.logger.error(
          `Failed to persist chain update for team ${sigChain.team.id}`,
          e,
        )
        sigChain.notifyPersistFailed(e)
      }
    }
}
