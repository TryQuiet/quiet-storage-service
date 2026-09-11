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
  TeamStateSnapshot,
} from './types.js'
import {
  Keyring,
  LocalServerContext,
  createServer,
  redactKeys,
  Keyset,
  ServerWithSecrets,
  Team,
  Hash,
} from '@localfirst/auth'
import { ServerKeyManagerService } from '../encryption/server-key-manager.service.js'
import { StoredKeyRingType } from '../encryption/types.js'
import * as uint8arrays from 'uint8arrays'
import { createHash } from 'crypto'
import {
  AdmittingSigChainReplacedError,
  CommunityNotFoundError,
  CompoundError,
  NoPopulatedCommunitiesError,
  PersistenceBacklogError,
  PersistenceRolledBackError,
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
  SigchainEvents,
} from './auth/types.js'
import { AuthDisconnectedPayload, AuthEvents } from './auth/auth.events.js'
import { DateTime } from 'luxon'
import { LogEntrySyncStorageService } from './storage/log-entry-sync.storage.service.js'
import { Serializer } from '../utils/serialization/serializer.service.js'

/**
 * Most durable writes a single team may have queued at once.
 *
 * Awaiting durability before releasing an acceptance turns handshake traffic into write work, so
 * this is what stops one invitation holder from making that queue grow without bound. Ordinary
 * chain updates coalesce into one slot, so reaching this means many distinct admission heads.
 */
const MAX_PENDING_PERSISTS_PER_TEAM = 8

/** Backlog depth worth complaining about before the hard limit is reached. */
const PERSIST_QUEUE_WARN_DEPTH = 4

/** How many recently committed heads a team remembers, so a repeated admission is a no-op. */
const DURABLE_HEAD_MEMORY = 64

/**
 * A team's durable-write queue, and everything that keeps its work bounded.
 */
interface PersistQueue {
  /** Tail of the serialized write chain */
  tail: Promise<void>
  /** Writes queued but not yet settled */
  pending: number
  /** Recently committed graph heads, so re-persisting one is free */
  durableHeads: Set<string>
  /** Admission writes currently in flight, by the head they were requested for */
  admissionsInFlight: Map<string, Promise<void>>
  /** The single slot ordinary chain updates coalesce into */
  coalescedUpdate?: { team: Team; promise: Promise<void> }
  /**
   * Bumped when the community is rolled back. A task queued under an earlier generation holds a
   * graph that never reached disk, so it must not be allowed to commit it.
   */
  generation: number
}

@Injectable()
export class CommunitiesManagerService implements OnModuleDestroy {
  /**
   * Map of team IDs to sigchains and associated LFA auth sync connections
   */
  private readonly communities = new Map<string, ManagedCommunity>()

  /**
   * Creates accepted before shutdown are allowed to finish before teardown.
   */
  private readonly communityCreates = new Set<Promise<CreatedCommunity>>()

  private shuttingDown = false

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
   *
   * The queue also carries what keeps that work bounded: which heads are already durable, which
   * admission writes are in flight, and the single coalesced slot ordinary chain updates share.
   */
  private readonly persistQueues = new Map<string, PersistQueue>()

  /**
   * Digest of the team keyring most recently written to the secrets manager, per team.
   *
   * QSS used to store the team keyring only at community creation, so once team keys rotated the
   * newest generation existed nowhere durable: a cold reload of the stored graph failed with
   * "Can't decrypt link" (GLOBAL-QSS-002 / private#192). Remembering what we last wrote lets us
   * re-store the keyring exactly when it has changed, and skip the write when it hasn't.
   */
  private readonly persistedTeamKeyringDigests = new Map<string, string>()

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
    await Promise.allSettled(
      [...this.persistQueues.values()].map(async queue => {
        await queue.tail
      }),
    )
    this.communities.clear()
    this.persistQueues.clear()
    this.persistedTeamKeyringDigests.clear()
    this.communityLoads.clear()
    this.communityCreates.clear()
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
      const communityIsLive = this.communityIsLive(teamId)
      if (!forceFetchFromStorage || communityIsLive) {
        if (forceFetchFromStorage && communityIsLive) {
          const pendingWriteCount = this.persistQueues.get(teamId)?.pending ?? 0
          this.logger.warn(
            `Skipping forced reload for ${teamId}; ${activeConnectionCount} auth connection(s) and ${pendingWriteCount} pending write(s) still use its sigchain`,
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
      this.persistedTeamKeyringDigests.set(
        community.teamId,
        CommunitiesManagerService.digestTeamKeyring(deserializedTeamKeyring),
      )
      this.logger.verbose(`Storing community metadata`)
      // put the community metadata into the database
      const stored = await this.storage.addCommunity(community)
      if (!stored) {
        throw new Error(`Failed to store community!`)
      }

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
    try {
      await this.writeAdmittedTeam(team)
    } catch (e) {
      // The ADMIT link is in memory and did not reach disk. Nothing may be built on it: the invitee
      // will redial and must be admitted afresh, against a graph loaded from storage, with the new
      // handshake's proof. Leaving the link in memory would serve a retry the stale admission from
      // the idempotent path, and the invitee would reject that proof forever.
      this.rollbackToDurableState(teamId)
      throw e
    }
  }

  /**
   * Write the admitting team, with the checks that keep the gate honest but no rollback handling
   *
   * @param team Team the connection admitted into
   */
  private async writeAdmittedTeam(team: Team): Promise<void> {
    const teamId = team.id
    const managedCommunity = this.communities.get(teamId)
    if (managedCommunity == null) {
      throw new CommunityNotFoundError(teamId)
    }
    if (managedCommunity.sigChain.team !== team) {
      throw new AdmittingSigChainReplacedError(teamId)
    }

    const queue = this.queueFor(teamId)
    const head = CommunitiesManagerService.headKey(team)

    // Already on disk. A peer that re-runs the handshake for an admission we have committed gets
    // the same answer without any new work.
    if (queue.durableHeads.has(head)) {
      this.logger.verbose(
        `Admission for team ${teamId} at head ${head} is already durable`,
        teamId,
      )
      return
    }

    // The same head is already being written. Wait for that write rather than queueing a second
    // serialize-and-store of identical state.
    const inFlight = queue.admissionsInFlight.get(head)
    if (inFlight != null) {
      this.logger.verbose(
        `Joining the in-flight admission write for team ${teamId}`,
        teamId,
      )
      await inFlight
      return
    }

    if (queue.pending >= MAX_PENDING_PERSISTS_PER_TEAM) {
      throw new PersistenceBacklogError(teamId, queue.pending)
    }

    const write = this.persistTeamState(teamId, team, head)
    queue.admissionsInFlight.set(head, write)
    try {
      await write
    } finally {
      queue.admissionsInFlight.delete(head)
    }
  }

  /**
   * Discard everything this process holds for a community and fall back to what is on disk.
   *
   * Called when an admission could not be persisted. The in-memory team carries an ADMIT link that
   * never reached storage, and durable state has to become the truth again: an invitee that redials
   * must be admitted afresh, with the new handshake's proof, against a graph loaded from PostgreSQL
   * and the secrets manager. If the tainted instance survived, a retry would find that admission
   * already present, take the idempotent path, and be served a link carrying the first handshake's
   * proof — which the invitee rejects, permanently.
   *
   * Order matters. The listener is detached and the queue abandoned before anything else, so from
   * this point nothing can commit the tainted graph. Eviction then makes the next access reload
   * from storage through the single-flight path. Connections are stopped last, on the next tick, so
   * the library can still deliver ADMISSION_NOT_PERSISTED to the invitee before its transport goes
   * away; they cannot cause a write in the meantime, because the gate now finds no community.
   *
   * @param teamId Team ID of the community to roll back
   */
  private rollbackToDurableState(teamId: string): void {
    const managedCommunity = this.communities.get(teamId)
    const queue = this.persistQueues.get(teamId)

    // Abandon queued work first: every task holds the tainted graph.
    if (queue != null) {
      queue.generation += 1
      queue.coalescedUpdate = undefined
      queue.admissionsInFlight.clear()
      queue.durableHeads.clear()
      this.persistQueues.delete(teamId)
    }

    if (managedCommunity == null) {
      return
    }

    this.logger.warn(
      `Rolling community ${teamId} back to its last durable state after a failed admission write`,
    )

    // Unhook the tainted sigchain so no later chain update can schedule a write of it.
    this.clearSigchainListeners(
      managedCommunity.sigChain,
      managedCommunity.chainEventHandler,
    )

    // Evict, so the next access reloads graph and keyring from durable storage.
    this.communities.delete(teamId)
    this.persistedTeamKeyringDigests.delete(teamId)

    // Every connection was built over the tainted instance, so none of them may continue. The
    // invitee redials and is admitted afresh; existing members reconnect and re-sync.
    const connections = [...(managedCommunity.authConnections?.values() ?? [])]
    managedCommunity.authConnections?.clear()
    setImmediate(() => {
      for (const connection of connections) {
        try {
          connection.stop()
        } catch (e) {
          this.logger.error(
            `Error while stopping an auth connection during rollback of ${teamId}`,
            e,
          )
        }
      }
    })
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
      {
        ...config,
        persistAdmission: async (team: Team): Promise<void> => {
          await this.persistAdmittedTeam(team)
        },
      },
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
      this.persistedTeamKeyringDigests.set(
        teamId,
        CommunitiesManagerService.digestTeamKeyring(teamKeys),
      )
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
      server,
    }

    // The graph and the keyring live in different stores with no shared transaction. The row
    // records which keyring its graph was committed with, so a drift between the two is named here
    // rather than surfacing later as an opaque "Can't decrypt link".
    const durableKeyringDigest =
      CommunitiesManagerService.digestTeamKeyring(teamKeys)
    const committedKeyringDigest = community.teamKeyringDigest
    const keyringsDiffer =
      committedKeyringDigest != null &&
      committedKeyringDigest !== durableKeyringDigest
    if (keyringsDiffer) {
      // Not fatal on its own: keyring-first ordering means a crash between the two writes leaves a
      // stored keyring that is a superset of what the stored graph needs, and that still loads.
      this.logger.warn(
        `Stored graph for team ${teamId} was committed with team keyring digest ${committedKeyringDigest} but the durable keyring digests to ${durableKeyringDigest}`,
      )
    }

    let sigChain: SigChain
    try {
      sigChain = SigChain.create(rawSigchain, localServerContext, teamKeys)
    } catch (e) {
      if (keyringsDiffer) {
        const reason = `Durable state for team ${teamId} is an inconsistent pair: the graph was committed with team keyring digest ${committedKeyringDigest}, the stored keyring digests to ${durableKeyringDigest}, and it cannot load the graph`
        this.logger.error(reason, e)
        throw new CompoundError(reason, e as Error)
      }
      throw e
    }

    // if we already have a managed community for this team merge it with the new data
    if (existingManagedCommunity != null) {
      this.clearSigchainListeners(
        existingManagedCommunity.sigChain,
        existingManagedCommunity.chainEventHandler,
      )
    }
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
    await this.persistQueues.get(teamId)?.tail

    const community = await this.storage.getCommunity(teamId)
    if (community == null) {
      this.logger.warn('Community not found in local cache or storage', teamId)
      return undefined
    }

    return await this._processCommunityToManagedCommunity(teamId, community)
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
  private async persistTeamState(
    teamId: string,
    team: Team,
    requestedHead?: string,
  ): Promise<void> {
    await this.enqueuePersist(teamId, async () => {
      // Take both halves at one instant, before the first await. The graph and the keyring written
      // below are then the same moment of the same team. Sampling the keyring, awaiting the secrets
      // write, and only then serializing the graph lets a rotation land in between and commit a
      // graph whose links need a keyset that was never stored (audit finding M-3).
      const snapshot = CommunitiesManagerService.snapshotTeamState(team)
      await this.persistSnapshot(teamId, snapshot)

      // The graph just committed contains everything the caller asked us to persist: the team only
      // grows, and the snapshot was taken at or after the request.
      const queue = this.queueFor(teamId)
      const committedHead = [...snapshot.head].sort().join(',')
      CommunitiesManagerService.rememberDurableHead(queue, committedHead)
      if (requestedHead != null) {
        CommunitiesManagerService.rememberDurableHead(queue, requestedHead)
      }
      this.logger.verbose(
        `Persisted team ${teamId} at head ${committedHead}: ${snapshot.serializedGraph.length / 2} graph bytes, ${snapshot.serializedKeyring.length} keyring bytes, ${queue.pending - 1} still queued`,
      )
    })
  }

  /**
   * Persist a chain update, coalescing into at most one pending write per team.
   *
   * Ordinary updates only ever need the newest state, and the queued task snapshots when it runs,
   * so a single pending task already covers every update that arrived while it was waiting. Extra
   * triggers join it instead of queueing more work.
   *
   * @param teamId Team ID of the community we are persisting
   * @param team Team whose state we are persisting
   */
  private async schedulePersist(teamId: string, team: Team): Promise<void> {
    const queue = this.queueFor(teamId)
    const coalesced = queue.coalescedUpdate
    if (coalesced != null) {
      // point the waiting task at the newest team object and share its result
      coalesced.team = team
      this.logger.verbose(
        `Coalescing a chain update into the pending write for team ${teamId}`,
        teamId,
      )
      await coalesced.promise
      return
    }

    const entry: { team: Team; promise: Promise<void> } = {
      team,
      promise: Promise.resolve(),
    }
    entry.promise = this.enqueuePersist(teamId, async () => {
      // Release the slot as this task starts: updates arriving from here on need a later snapshot
      // than the one about to be taken, so they get their own pending task.
      queue.coalescedUpdate = undefined
      const snapshot = CommunitiesManagerService.snapshotTeamState(entry.team)
      await this.persistSnapshot(teamId, snapshot)
      CommunitiesManagerService.rememberDurableHead(
        queue,
        [...snapshot.head].sort().join(','),
      )
    })
    queue.coalescedUpdate = entry
    await entry.promise
  }

  /**
   * Capture a team's durable state at one instant.
   *
   * Every read here is synchronous, so nothing can mutate the team between them.
   *
   * @param team Team to snapshot
   * @returns The graph, the keyring, that keyring's digest and the head, all from the same moment
   */
  private static snapshotTeamState(team: Team): TeamStateSnapshot {
    const serializedGraph = team.save()
    // the pinned auth package's generated declarations lose these concrete types
    const teamKeyring = team.teamKeyring() as Keyring
    const graph = team.graph as { head: Hash[] }

    return {
      serializedGraph: uint8arrays.toString(serializedGraph, 'hex'),
      serializedKeyring: uint8arrays.fromString(
        JSON.stringify(teamKeyring),
        'utf8',
      ),
      keyringDigest: CommunitiesManagerService.digestTeamKeyring(teamKeyring),
      head: [...graph.head],
    }
  }

  /**
   * Write one snapshot: the keyring it names first, then the graph it names.
   *
   * Keyring first means a crash between the two writes leaves a stored keyring that is a superset
   * of what the stored graph needs, which still loads. The graph row also records the digest of the
   * keyring it was committed with, so a later load can say when the two have drifted apart.
   *
   * @param teamId Team ID of the community we are persisting
   * @param snapshot State to commit
   */
  private async persistSnapshot(
    teamId: string,
    snapshot: TeamStateSnapshot,
  ): Promise<void> {
    if (
      snapshot.keyringDigest === this.persistedTeamKeyringDigests.get(teamId)
    ) {
      this.logger.verbose(
        `Team keyring is unchanged since the last persist, skipping`,
        teamId,
      )
    } else {
      this.logger.log(`Storing updated team keyring`, teamId)
      await this.serverKeyManager.storeKeyring(
        teamId,
        snapshot.serializedKeyring,
        StoredKeyRingType.TEAM_KEYRING,
        // the team keyring is rotatable, so re-storing it has to replace what is already there
        true,
      )
      this.persistedTeamKeyringDigests.set(teamId, snapshot.keyringDigest)
    }

    await this.update(teamId, {
      sigChain: snapshot.serializedGraph,
      teamKeyringDigest: snapshot.keyringDigest,
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
   * Get this team's persistence queue, creating it if this is the first write for the team
   *
   * @param teamId Team ID whose queue we want
   * @returns The queue
   */
  private queueFor(teamId: string): PersistQueue {
    const existing = this.persistQueues.get(teamId)
    if (existing != null) {
      return existing
    }

    const queue: PersistQueue = {
      tail: Promise.resolve(),
      pending: 0,
      durableHeads: new Set<string>(),
      admissionsInFlight: new Map<string, Promise<void>>(),
      coalescedUpdate: undefined,
      generation: 0,
    }
    this.persistQueues.set(teamId, queue)
    return queue
  }

  /**
   * Stable key for a team's current graph head.
   *
   * Sorted, because the head is a set of hashes and its order carries no meaning.
   *
   * @param team Team to read
   * @returns Key identifying that head
   */
  private static headKey(team: Team): string {
    // the pinned auth package's generated declarations lose the concrete graph type
    const graph = team.graph as { head: Hash[] }
    return [...graph.head].sort().join(',')
  }

  /**
   * Remember that a head is durable, keeping the record bounded
   *
   * @param queue Queue to record against
   * @param head Head that has been committed
   */
  private static rememberDurableHead(queue: PersistQueue, head: string): void {
    queue.durableHeads.add(head)
    while (queue.durableHeads.size > DURABLE_HEAD_MEMORY) {
      const oldest = queue.durableHeads.values().next().value
      if (oldest == null) {
        break
      }
      queue.durableHeads.delete(oldest)
    }
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
    const queue = this.queueFor(teamId)
    queue.pending += 1
    if (queue.pending > PERSIST_QUEUE_WARN_DEPTH) {
      this.logger.warn(
        `Durable write backlog for team ${teamId} is ${queue.pending} deep`,
      )
    }

    // A rollback abandons everything queued for this team: those tasks hold a graph that never
    // reached disk, and running one would commit the very link the rollback is discarding.
    const generation = queue.generation
    const guarded = async (): Promise<void> => {
      if (queue.generation !== generation) {
        this.logger.warn(
          `Discarding a durable write for team ${teamId} queued before a rollback`,
        )
        throw new PersistenceRolledBackError(teamId)
      }
      await task()
    }

    // Wait for the previous write to settle either way — a failed persist orders later writes but
    // must never wedge the queue.
    const current = queue.tail.then(guarded, guarded)
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
   * Canonical digest of a keyring's public half.
   *
   * A keyring is a map of keysets indexed by their public encryption key. Hashing a canonical
   * projection — sorted by key id, fixed field order, public keys only — changes exactly when the
   * keyring gains or rotates a keyset, and gives a fixed-width value that can be written next to
   * the graph in PostgreSQL. No secret material enters the digest.
   *
   * @param keyring Keyring to digest
   * @returns Base64 SHA-256 of the canonical public projection
   */
  private static digestTeamKeyring(keyring: Keyring): string {
    const canonical = Object.keys(keyring)
      .sort()
      .map(id => {
        const keys = keyring[id]
        return [
          id,
          keys.type,
          keys.name,
          keys.generation,
          keys.encryption.publicKey,
          keys.signature.publicKey,
        ]
      })

    return createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('base64')
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
        this.persistedTeamKeyringDigests.delete(community.teamId)
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
        await this.schedulePersist(sigChain.team.id, sigChain.team)
      } catch (e) {
        this.logger.error(
          `Failed to persist chain update for team ${sigChain.team.id}`,
          e,
        )
        sigChain.notifyPersistFailed(e)
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
