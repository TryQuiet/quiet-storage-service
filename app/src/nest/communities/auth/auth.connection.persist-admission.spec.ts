/* eslint-disable max-lines -- driving a real invitee through the handshake needs a harness */
/**
 * QSS-006 (private#203): "Admission Acceptance Can Precede the Admitting Peer's Durable Sigchain
 * Write".
 *
 * QSS is the sole admitter when no community member is online. It validates the invitation and
 * possession proofs, appends a server-signed ADMIT_MEMBER, and sends the invitee an acceptance
 * carrying the team graph and the team keyring. Before this fix the acceptance went out in the same
 * synchronous action as the admission, while the PostgreSQL write was still in flight, so a QSS
 * crash in that window restarted a server with no ADMIT link facing an invitee that already held
 * the team keys — and rejected it forever as DEVICE_UNKNOWN.
 *
 * These tests drive a real localfirst/auth invitee against a real QSS server context over a fake
 * socket, with the PostgreSQL write under the test's control, and assert the ordering the fix is
 * supposed to guarantee.
 */
import { jest } from '@jest/globals'
import { Test, type TestingModule } from '@nestjs/testing'
import { unpack } from 'msgpackr'
import * as uint8arrays from 'uint8arrays'
import {
  Connection as LFAConnection,
  createFirstUseDevice,
  createUser,
  deriveUserId,
  type DeviceWithSecrets,
  type Hash,
  type InviteeMemberContext,
  type Keyring,
  type UserWithSecrets,
} from '@localfirst/auth'
import { randomUUID } from 'crypto'

import { CommunitiesManagerService } from '../communities-manager.service.js'
import { CommunitiesModule } from '../communities.module.js'
import { CommunitiesStorageService } from '../storage/communities.storage.service.js'
import { EncryptionModule } from '../../encryption/enc.module.js'
import { ServerKeyManagerService } from '../../encryption/server-key-manager.service.js'
import { StoredKeyRingType } from '../../encryption/types.js'
import { StorageModule } from '../../storage/storage.module.js'
import { RedisClient } from '../../storage/redis/redis.client.js'
import { UtilsModule } from '../../utils/utils.module.js'
import { TeamTestUtils } from '../../../../test/utils/team.utils.js'
import { waitFor } from '../../../../test/utils/waitFor.js'
import type { TestTeam } from '../../../../test/utils/types.js'
import type { CommunityUpdate, ManagedCommunity } from '../types.js'
import type { AuthConnection } from './auth.connection.js'
import { SigChain } from './sigchain.js'
import { SigchainEvents } from './types.js'
import type { QuietSocket } from '../../websocket/ws.types.js'
import { WebsocketEvents } from '../../websocket/ws.types.js'
import type { AuthSyncMessage } from '../../websocket/handlers/types/auth-sync.types.js'

/**
 * The library's error code for a refused admission. Compared as a literal because the auth package
 * exports its error constants as types only from the package root, and the wire carries the string.
 */
const ADMISSION_NOT_PERSISTED = 'ADMISSION_NOT_PERSISTED'

/**
 * The graph head a sigchain currently sits at. The pinned auth package's generated declarations
 * lose the concrete type of `graph`.
 */
const headOf = (sigChain: SigChain): string => {
  const graph = sigChain.team.graph as { head: Hash[] }
  return graph.head.join(',')
}

interface Gate {
  promise: Promise<undefined>
  open: () => void
}

const createGate = (): Gate => {
  let open!: () => void
  const promise = new Promise<undefined>(resolve => {
    open = () => {
      resolve(undefined)
    }
  })
  return { promise, open }
}

/**
 * Mint an identity the way localfirst/auth requires: a user's id is derived from its founding
 * device, so the device has to exist before the id is known.
 */
const mintInvitee = (
  userName: string,
): { user: UserWithSecrets; device: DeviceWithSecrets } => {
  const foundingDevice = createFirstUseDevice({ deviceName: randomUUID() })
  const userId = deriveUserId(foundingDevice.deviceId)
  const user = createUser(userName, userId) as UserWithSecrets
  const device: DeviceWithSecrets = { ...foundingDevice, userId }
  return { user, device }
}

describe('AuthConnection durable-admission gate (QSS-006 / private#203)', () => {
  let module: TestingModule
  let manager: CommunitiesManagerService
  let storage: CommunitiesStorageService
  let serverKeyManager: ServerKeyManagerService
  let redis: RedisClient
  let teamTestUtils: TeamTestUtils

  let inviteeConnection: LFAConnection | undefined
  let qssConnection: AuthConnection | undefined

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        UtilsModule,
        StorageModule,
        CommunitiesModule,
        EncryptionModule,
      ],
    }).compile()
    await module.init()

    manager = module.get(CommunitiesManagerService)
    storage = module.get(CommunitiesStorageService)
    serverKeyManager = module.get(ServerKeyManagerService)
    redis = module.get(RedisClient)
    teamTestUtils = new TeamTestUtils(serverKeyManager)
    inviteeConnection = undefined
    qssConnection = undefined
  })

  afterEach(async () => {
    inviteeConnection?.stop()
    qssConnection?.stop()
    jest.restoreAllMocks()
    await storage.clearRepository()
    await redis.flush()
    await module.close()
    jest.clearAllMocks()
  })

  /**
   * Rebuild a community's sigchain from the bytes in storage alone, the way a restarted process
   * would. Touches nothing the manager holds in memory.
   */
  const buildSigChainFromStorage = async (
    teamId: string,
    testTeam: TestTeam,
  ): Promise<SigChain> => {
    const community = await storage.getCommunity(teamId)
    expect(community).toBeDefined()
    const keyringBytes = await serverKeyManager.retrieveKeyring(
      teamId,
      StoredKeyRingType.TEAM_KEYRING,
    )
    expect(keyringBytes).toBeDefined()
    return SigChain.create(
      uint8arrays.fromString(community!.sigChain, 'hex'),
      { server: testTeam.serverWithSecrets! },
      JSON.parse(uint8arrays.toString(keyringBytes!, 'utf8')) as Keyring,
    )
  }

  /**
   * What the harness reports back about a run: the ordered log of interesting moments, the
   * connections, and the errors each side saw.
   */
  interface Harness {
    teamId: string
    events: string[]
    acceptanceCount: () => number
    joined: () => boolean
    localErrors: string[]
    remoteErrors: string[]
    /** Rebuild the community from the stored graph and stored keyring, as a restarted QSS would. */
    coldLoadFromStorage: () => Promise<SigChain>
    /** The sigchain the connection was built over, and appends its ADMIT_* link to. */
    admittingSigChain: SigChain
  }

  /**
   * Put a community into QSS the way a restarted server would find it — server identity and team
   * keyring in the secrets manager, graph in PostgreSQL, nothing in memory — then open an auth sync
   * connection for an invitee holding a live invitation, and wire a real localfirst/auth invitee to
   * the other end of the fake socket.
   *
   * `overrideUpdateCommunity` replaces the PostgreSQL write so a test can decide when, or whether,
   * the admission becomes durable. Omit it to let the real write run against the database.
   */
  const startAdmission = async (
    overrideUpdateCommunity?: (
      events: string[],
    ) => (teamId: string, payload: CommunityUpdate) => Promise<boolean>,
    onChainUpdated?: (context: {
      admittingSigChain: SigChain
      /** An independent sigchain for the same community, built from the pre-admission bytes. */
      rivalSigChain: SigChain
      replaceCachedSigChain: (replacement: SigChain) => void
    }) => void,
  ): Promise<Harness> => {
    const testTeam: TestTeam = await teamTestUtils.createTestTeam()
    const { id: teamId } = testTeam.team
    // A server cannot grant the member role itself, so the admin-authored invitation has to carry
    // the grant. The test team declares `member` self-assignable for exactly this.
    const invite = testTeam.team.inviteMember({ roleNames: ['member'] })

    await serverKeyManager.storeKeyring(
      teamId,
      uint8arrays.fromString(
        JSON.stringify(testTeam.serverWithSecrets),
        'utf8',
      ),
      StoredKeyRingType.SERVER_KEYRING,
    )
    await serverKeyManager.storeKeyring(
      teamId,
      uint8arrays.fromString(
        JSON.stringify(testTeam.team.teamKeyring() as Keyring),
        'utf8',
      ),
      StoredKeyRingType.TEAM_KEYRING,
    )
    const stored = await storage.addCommunity({
      teamId,
      sigChain: uint8arrays.toString(testTeam.team.save(), 'hex'),
    })
    expect(stored).toBe(true)

    const events: string[] = []
    const localErrors: string[] = []
    const remoteErrors: string[] = []
    let acceptanceCount = 0
    let joined = false

    // Put the community in memory the way a cold QSS does, from stored graph + stored keyring.
    const managedCommunity = await manager.get(teamId)
    expect(managedCommunity).toBeDefined()

    // Take over the PostgreSQL write when the test asks to. The team keyring is unchanged by an
    // admission, so this is the only write the persistence path performs here.
    if (overrideUpdateCommunity != null) {
      jest
        .spyOn(storage, 'updateCommunity')
        .mockImplementation(overrideUpdateCommunity(events))
    }

    const invitee = mintInvitee('invitee')

    const socket = {
      id: 'admission-test-socket',
      data: {},
      on: jest.fn().mockReturnThis(),
      join: jest.fn(async () => {
        /* no-op */
      }),
      emit: (event: WebsocketEvents, message: AuthSyncMessage): boolean => {
        if (event !== WebsocketEvents.AuthSync) {
          return true
        }
        const bytes = uint8arrays.fromString(message.payload.message, 'base64')
        // Handshake messages are msgpack, not yet encrypted, so the acceptance is visible here —
        // which is exactly the payload that must not go out before the write lands.
        const decoded = unpack(bytes) as { type?: string }
        if (decoded.type === 'ACCEPT_INVITATION') {
          acceptanceCount += 1
          events.push('acceptance-sent')
        }
        // hop the event loop the way a real socket would
        setImmediate(() => {
          inviteeConnection?.deliver(bytes)
        })
        return true
      },
    } as unknown as QuietSocket

    manager.startAuthSyncConnection(invitee.user.userId, teamId, {
      socket,
      communitiesManager: manager,
    })
    const openedCommunity = await manager.get(teamId)
    qssConnection = openedCommunity!.authConnections!.get(invitee.user.userId)
    expect(qssConnection).toBeDefined()

    const replaceCachedSigChain = (replacement: SigChain): void => {
      const cache = (
        manager as unknown as { communities: Map<string, ManagedCommunity> }
      ).communities
      cache.set(teamId, { ...cache.get(teamId)!, sigChain: replacement })
    }

    if (onChainUpdated != null) {
      // Built now, from the pre-admission bytes, so it genuinely lacks the ADMIT_* link.
      const rivalSigChain = await buildSigChainFromStorage(teamId, testTeam)
      const { sigChain: admittingSigChain } = openedCommunity!
      // Team.dispatch emits `updated` synchronously from admitMember, before the state machine
      // reaches the persistence gate, so this runs in exactly the window the race needs.
      admittingSigChain.once(SigchainEvents.UPDATED, () => {
        onChainUpdated({
          admittingSigChain,
          rivalSigChain,
          replaceCachedSigChain,
        })
      })
    }

    qssConnection!.lfaConnection.on('localError', error => {
      localErrors.push(error.type)
    })

    const inviteeContext: InviteeMemberContext = {
      user: invitee.user,
      device: invitee.device,
      invitationSeed: invite.seed,
      expectedTeamId: invite.teamId,
    }
    inviteeConnection = new LFAConnection({
      context: inviteeContext,
      sendMessage: (message: Uint8Array) => {
        setImmediate(() => {
          qssConnection?.lfaConnection.deliver(message)
        })
      },
    })
    inviteeConnection.on('joined', () => {
      joined = true
      events.push('invitee-joined')
    })
    inviteeConnection.on('remoteError', error => {
      remoteErrors.push(error.type)
    })
    inviteeConnection.start()

    return {
      teamId,
      events,
      acceptanceCount: () => acceptanceCount,
      joined: () => joined,
      localErrors,
      remoteErrors,
      admittingSigChain: openedCommunity!.sigChain,
      coldLoadFromStorage: async (): Promise<SigChain> =>
        await buildSigChainFromStorage(teamId, testTeam),
    }
  }

  it('holds the acceptance until the admission is durable, then releases it', async () => {
    const gate = createGate()
    const harness = await startAdmission(
      events => async (): Promise<boolean> => {
        events.push('write-started')
        await gate.promise
        events.push('write-committed')
        return true
      },
    )

    // Wait until the admission has been appended in memory and the connection is sitting on the
    // gate. Everything asserted below is true while QSS is in that window.
    await waitFor(() => {
      expect(harness.events).toContain('write-started')
    })

    expect(harness.acceptanceCount()).toBe(0)
    expect(harness.joined()).toBe(false)
    expect(harness.events).not.toContain('acceptance-sent')

    gate.open()

    await waitFor(
      () => {
        expect(harness.joined()).toBe(true)
      },
      { timeout: 20_000 },
    )

    // The acceptance carrying the graph and the team keyring went out strictly after the write
    // landed, which is the whole point of the fix.
    expect(harness.acceptanceCount()).toBe(1)
    expect(harness.events.indexOf('write-committed')).toBeGreaterThanOrEqual(0)
    expect(harness.events.indexOf('acceptance-sent')).toBeGreaterThan(
      harness.events.indexOf('write-committed'),
    )
    expect(harness.localErrors).toEqual([])
    expect(harness.remoteErrors).toEqual([])
  }, 30_000)

  it('records the admission in PostgreSQL before the invitee is let in', async () => {
    // no override: the admission takes the real path all the way into PostgreSQL
    const harness = await startAdmission()

    await waitFor(
      () => {
        expect(harness.joined()).toBe(true)
      },
      { timeout: 20_000 },
    )

    // Rebuild from the stored bytes alone, touching nothing this process holds in memory: this is
    // the state a restarted QSS would come up with. Reading it back through the manager's cache
    // would pass even if the admission had never reached PostgreSQL.
    const coldLoaded = await harness.coldLoadFromStorage()
    expect(coldLoaded.team.members().length).toBe(2)
  }, 30_000)

  it('fails closed when the cached sigchain is replaced mid-admission (M-2)', async () => {
    // The race: a concurrent or forced load builds a second sigchain for the same community and
    // installs it between ADMIT_* and the persistence gate. A gate that re-fetched the community by
    // id would persist that replacement, which does not contain the admission, and the connection
    // would release the graph and keyring anyway.
    const harness = await startAdmission(
      undefined,
      ({ rivalSigChain, replaceCachedSigChain }) => {
        replaceCachedSigChain(rivalSigChain)
      },
    )

    await waitFor(
      () => {
        expect(harness.localErrors.length).toBeGreaterThan(0)
      },
      { timeout: 20_000 },
    )

    expect(harness.localErrors).toContain(ADMISSION_NOT_PERSISTED)
    expect(harness.acceptanceCount()).toBe(0)
    expect(harness.joined()).toBe(false)

    // The invariant, stated independently of how the gate fails: an acceptance may only go out if
    // the graph durably stored is the one the connection admitted into.
    const durable = await harness.coldLoadFromStorage()
    const admittingHead = headOf(harness.admittingSigChain)
    const durableHead = headOf(durable)
    expect(
      harness.acceptanceCount() === 0 || durableHead === admittingHead,
    ).toBe(true)
  }, 30_000)

  it('fails closed with ADMISSION_NOT_PERSISTED when the write fails', async () => {
    const harness = await startAdmission(
      events => async (): Promise<boolean> => {
        events.push('write-started')
        // the storage layer reports a failed write by returning false
        return await Promise.resolve(false)
      },
    )

    await waitFor(
      () => {
        expect(harness.localErrors).toContain(ADMISSION_NOT_PERSISTED)
      },
      { timeout: 20_000 },
    )

    // Nothing was released: no acceptance on the wire, the invitee never joined, and it was told
    // why so it can present the same invitation again later.
    expect(harness.acceptanceCount()).toBe(0)
    expect(harness.joined()).toBe(false)
    expect(harness.events).not.toContain('acceptance-sent')
    await waitFor(
      () => {
        expect(harness.remoteErrors).toContain(ADMISSION_NOT_PERSISTED)
      },
      { timeout: 20_000 },
    )
  }, 30_000)
})
