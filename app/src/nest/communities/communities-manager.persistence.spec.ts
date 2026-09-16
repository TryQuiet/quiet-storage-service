/* eslint-disable max-lines -- the durability contract needs a lot of setup */
/**
 * Durable-persistence coverage for the community manager.
 *
 * Two audit findings meet here:
 *
 * - QSS-006 (private#203): QSS is the sole admitter when no community member is online. It has to
 *   have the admission on disk before it releases the graph and team keyring to the invitee,
 *   otherwise a crash in the window leaves the invitee holding keys for an admission the server has
 *   forgotten. `persistCommunity` is the write that has to complete first.
 * - GLOBAL-QSS-002 (private#192): the team keyring was stored once, at community creation, and
 *   never again. After team keys rotated, the graph QSS kept writing contained links encrypted
 *   under a generation that existed nowhere durable, so a cold reload failed with "Can't decrypt
 *   link".
 */
import { jest } from '@jest/globals'
import { Test, type TestingModule } from '@nestjs/testing'
import * as uint8arrays from 'uint8arrays'
import type { Keyring, Team } from '@localfirst/auth'

import { CommunitiesManagerService } from './communities-manager.service.js'
import { CommunitiesModule } from './communities.module.js'
import { CommunitiesStorageService } from './storage/communities.storage.service.js'
import { SigChain } from './auth/sigchain.js'
import { SigchainEvents } from './auth/types.js'
import { EncryptionModule } from '../encryption/enc.module.js'
import { ServerKeyManagerService } from '../encryption/server-key-manager.service.js'
import { StoredKeyRingType, type StoredKeyring } from '../encryption/types.js'
import { StorageModule } from '../storage/storage.module.js'
import { RedisClient } from '../storage/redis/redis.client.js'
import { UtilsModule } from '../utils/utils.module.js'
import { TeamTestUtils } from '../../../test/utils/team.utils.js'
import { waitFor } from '../../../test/utils/waitFor.js'
import type { TestTeam } from '../../../test/utils/types.js'
import type { Community, ManagedCommunity } from './types.js'
import type { QuietSocket } from '../websocket/ws.types.js'
import { getDeviceId } from './auth/device-id.js'

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

const storedKeyringStub = (type: StoredKeyRingType): StoredKeyring => ({
  nonce: 'test-nonce',
  payload: 'test-payload',
  type,
})

describe('CommunitiesManagerService durable persistence', () => {
  let module: TestingModule
  let manager: CommunitiesManagerService
  let storage: CommunitiesStorageService
  let serverKeyManager: ServerKeyManagerService
  let redis: RedisClient
  let teamTestUtils: TeamTestUtils
  let socket: QuietSocket

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
    socket = {
      id: 'persistence-test-socket',
      data: {},
      on: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      join: jest.fn(async () => {
        /* no-op */
      }),
    } as unknown as QuietSocket
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await storage.clearRepository()
    await redis.flush()
    await module.close()
    jest.clearAllMocks()
  })

  /**
   * Stand up a community in the manager the way the create handler does: server identity in the
   * secrets manager, founder-signed graph and team keyring handed over by the creating client.
   */
  const createCommunity = async (): Promise<{
    testTeam: TestTeam
    teamId: string
    keyringAtCreation: Keyring
  }> => {
    const testTeam = await teamTestUtils.createTestTeam()
    const { id: teamId } = testTeam.team
    await serverKeyManager.storeKeyring(
      teamId,
      uint8arrays.fromString(
        JSON.stringify(testTeam.serverWithSecrets),
        'utf8',
      ),
      StoredKeyRingType.SERVER_KEYRING,
    )

    const keyringAtCreation = testTeam.team.teamKeyring() as Keyring
    const community: Community = {
      teamId,
      sigChain: uint8arrays.toString(testTeam.team.save(), 'hex'),
    }
    await manager.create(
      testTeam.testUserContext.user.userId,
      getDeviceId(testTeam.testUserContext.device),
      community,
      uint8arrays.toString(
        uint8arrays.fromString(JSON.stringify(keyringAtCreation), 'utf8'),
        'base64',
      ),
      socket,
    )

    return { testTeam, teamId, keyringAtCreation }
  }

  /**
   * Rotate the team keys on the founder's copy of the team and sync the result into the copy QSS
   * holds.
   *
   * Removing a member rotates the team keyset, and the invitation written afterwards is the first
   * link encrypted under the new generation — that link is what a stale keyring cannot open. This
   * is the audit's reproduction, driven through the graph QSS actually receives: `merge` is the
   * same call the auth connection makes for a peer's graph, and it emits the `updated` event QSS
   * persists on.
   */
  const rotateAndSyncToServer = async (testTeam: TestTeam): Promise<void> => {
    await teamTestUtils.addUserToTeam(testTeam, 'rotation-trigger')
    const rotationTrigger = testTeam.otherUsers.at(-1)!
    testTeam.team.remove(rotationTrigger.user.userId)
    testTeam.team.inviteMember()

    const managedCommunity = await manager.get(testTeam.team.id)
    expect(managedCommunity).toBeDefined()
    managedCommunity!.sigChain.team.merge(testTeam.team.graph)
  }

  const readStoredKeyring = async (teamId: string): Promise<Keyring> => {
    const raw = await serverKeyManager.retrieveKeyring(
      teamId,
      StoredKeyRingType.TEAM_KEYRING,
    )
    expect(raw).toBeDefined()
    return JSON.parse(uint8arrays.toString(raw!, 'utf8')) as Keyring
  }

  const readStoredGraph = async (teamId: string): Promise<Uint8Array> => {
    const stored = await storage.getCommunity(teamId)
    expect(stored).toBeDefined()
    return uint8arrays.fromString(stored!.sigChain, 'hex')
  }

  it('is defined', () => {
    expect(manager).toBeDefined()
    expect(teamTestUtils).toBeDefined()
  })

  describe('persistCommunity', () => {
    it('writes the team keyring before the graph', async () => {
      const { testTeam, teamId } = await createCommunity()
      const order: string[] = []

      jest
        .spyOn(serverKeyManager, 'storeKeyring')
        .mockImplementation(
          async (
            _id: string,
            _keyring: Uint8Array,
            type: StoredKeyRingType,
          ): Promise<StoredKeyring> => {
            order.push('keyring')
            return await Promise.resolve(storedKeyringStub(type))
          },
        )
      jest
        .spyOn(storage, 'updateCommunity')
        .mockImplementation(async (): Promise<boolean> => {
          order.push('graph')
          return await Promise.resolve(true)
        })

      await rotateAndSyncToServer(testTeam)
      await manager.persistCommunity(teamId)

      // A crash between the two writes has to leave a stored keyring that is a superset of what the
      // stored graph needs, so the keyring goes first.
      expect(order.indexOf('keyring')).toBe(0)
      expect(order.indexOf('graph')).toBeGreaterThan(order.indexOf('keyring'))
    })

    it('skips re-storing the team keyring when it has not changed', async () => {
      const { teamId } = await createCommunity()

      const storeKeyringSpy = jest.spyOn(serverKeyManager, 'storeKeyring')
      const updateSpy = jest.spyOn(storage, 'updateCommunity')

      await manager.persistCommunity(teamId)
      await manager.persistCommunity(teamId)

      expect(storeKeyringSpy).not.toHaveBeenCalled()
      expect(updateSpy).toHaveBeenCalledTimes(2)
    })

    it('serializes writes per team so a later persist cannot commit older state', async () => {
      const { teamId } = await createCommunity()

      const gate = createGate()
      const started: string[] = []
      let call = 0

      jest
        .spyOn(storage, 'updateCommunity')
        .mockImplementation(async (): Promise<boolean> => {
          call += 1
          started.push(`update-${call}`)
          if (call === 1) {
            await gate.promise
          }
          return true
        })

      const first = manager.persistCommunity(teamId)
      const second = manager.persistCommunity(teamId)

      // The second persist must not have touched storage while the first is still in flight.
      await new Promise(resolve => {
        setImmediate(resolve)
      })
      expect(started).toEqual(['update-1'])

      gate.open()
      await Promise.all([first, second])
      expect(started).toEqual(['update-1', 'update-2'])
    })

    it('rejects when the graph write fails', async () => {
      const { teamId } = await createCommunity()

      jest.spyOn(storage, 'updateCommunity').mockResolvedValue(false)

      await expect(manager.persistCommunity(teamId)).rejects.toThrow(
        'Error while updating community',
      )
    })

    it('rejects when the keyring write fails, and does not write the graph', async () => {
      const { testTeam, teamId } = await createCommunity()

      jest
        .spyOn(serverKeyManager, 'storeKeyring')
        .mockRejectedValue(new Error('secrets manager unavailable'))
      const updateSpy = jest.spyOn(storage, 'updateCommunity')

      await rotateAndSyncToServer(testTeam)

      await expect(manager.persistCommunity(teamId)).rejects.toThrow(
        'secrets manager unavailable',
      )
      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('does not wedge the queue after a failed write', async () => {
      const { teamId } = await createCommunity()

      // spyOn keeps the real implementation for every call the one-time override doesn't cover
      jest.spyOn(storage, 'updateCommunity').mockResolvedValueOnce(false)

      await expect(manager.persistCommunity(teamId)).rejects.toThrow(
        'Error while updating community',
      )
      await expect(manager.persistCommunity(teamId)).resolves.toBeUndefined()
    })

    it('throws for a community that is not loaded', async () => {
      await expect(manager.persistCommunity('not-a-team')).rejects.toThrow(
        'No community found for this community ID: not-a-team',
      )
    })
  })

  describe('sigchain instance identity (M-2)', () => {
    it('rejects a persist bound to a team the manager no longer holds', async () => {
      const { testTeam, teamId } = await createCommunity()
      const admittingTeam = (await manager.get(teamId))!.sigChain.team

      // stand in for a concurrent load winning the cache
      const rival = SigChain.create(
        await readStoredGraph(teamId),
        { server: testTeam.serverWithSecrets! },
        await readStoredKeyring(teamId),
      )
      const cache = (
        manager as unknown as { communities: Map<string, ManagedCommunity> }
      ).communities
      cache.set(teamId, { ...cache.get(teamId)!, sigChain: rival })

      await expect(manager.persistAdmittedTeam(admittingTeam)).rejects.toThrow(
        'was replaced while an admission was in flight',
      )
    })

    it('accepts a persist bound to the team it does hold', async () => {
      const { teamId } = await createCommunity()
      const { team } = (await manager.get(teamId))!.sigChain
      await expect(manager.persistAdmittedTeam(team)).resolves.toBeUndefined()
    })

    it('serves concurrent cache misses from a single load', async () => {
      const { teamId } = await createCommunity()

      // drop the community from memory so the next reads have to go to storage
      const cache = (
        manager as unknown as { communities: Map<string, ManagedCommunity> }
      ).communities
      cache.delete(teamId)

      const getCommunitySpy = jest.spyOn(storage, 'getCommunity')
      const [first, second, third] = await Promise.all([
        manager.get(teamId),
        manager.get(teamId),
        manager.get(teamId),
      ])

      // one read, one sigchain, and every caller holding the same instance
      expect(getCommunitySpy).toHaveBeenCalledTimes(1)
      expect(first).toBeDefined()
      expect(second!.sigChain).toBe(first!.sigChain)
      expect(third!.sigChain).toBe(first!.sigChain)
    })

    it('will not replace a sigchain that an auth connection is holding', async () => {
      const { teamId } = await createCommunity()
      const before = (await manager.get(teamId))!.sigChain
      expect(
        (await manager.get(teamId))!.authConnections!.size,
      ).toBeGreaterThan(0)

      const reloaded = await manager.get(teamId, true)

      expect(reloaded!.sigChain).toBe(before)
    })

    it('will not replace a sigchain while a write is still in flight', async () => {
      const { teamId } = await createCommunity()
      const before = (await manager.get(teamId))!.sigChain

      // close the auth connection so only the pending write can hold the instance
      const managedCommunity = (await manager.get(teamId))!
      for (const connection of managedCommunity.authConnections!.values()) {
        connection.stop()
      }
      expect(managedCommunity.authConnections!.size).toBe(0)

      const gate = createGate()
      jest
        .spyOn(storage, 'updateCommunity')
        .mockImplementation(async (): Promise<boolean> => {
          await gate.promise
          return true
        })

      const persisting = manager.persistCommunity(teamId)
      const reloaded = await manager.get(teamId, true)
      expect(reloaded!.sigChain).toBe(before)

      gate.open()
      await persisting
    })
  })

  describe('crash consistency (M-3)', () => {
    /**
     * Drop the manager's memory of what it last wrote, so the next persist writes the keyring. A
     * freshly started process is in exactly this state.
     */
    const forgetPersistedKeyringDigest = (teamId: string): void => {
      ;(
        manager as unknown as {
          persistedTeamKeyringDigests: Map<string, string>
        }
      ).persistedTeamKeyringDigests.delete(teamId)
    }

    /**
     * Record the exact pair each queued task commits, without letting either write reach a real
     * store. What matters is that the keyring handed to the secrets manager and the graph handed to
     * PostgreSQL in the same task are the same instant of the same team.
     */
    const capturePairs = (): {
      keyrings: Uint8Array[]
      graphs: string[]
      digests: Array<string | undefined>
      gate: ReturnType<typeof createGate>
    } => {
      const keyrings: Uint8Array[] = []
      const graphs: string[] = []
      const digests: Array<string | undefined> = []
      const gate = createGate()

      jest
        .spyOn(serverKeyManager, 'storeKeyring')
        .mockImplementation(
          async (
            _id: string,
            keyring: Uint8Array,
            type: StoredKeyRingType,
          ): Promise<StoredKeyring> => {
            keyrings.push(keyring)
            await gate.promise
            return storedKeyringStub(type)
          },
        )
      jest
        .spyOn(storage, 'updateCommunity')
        .mockImplementation(
          async (_teamId: string, payload): Promise<boolean> => {
            graphs.push(payload.sigChain!)
            digests.push(payload.teamKeyringDigest)
            return await Promise.resolve(true)
          },
        )

      return { keyrings, graphs, digests, gate }
    }

    it('commits the keyring and graph of one instant, even if the team moves on mid-write', async () => {
      const { testTeam, teamId } = await createCommunity()
      await rotateAndSyncToServer(testTeam)
      await manager.persistCommunity(teamId)
      forgetPersistedKeyringDigest(teamId)

      const captured = capturePairs()
      const persisting = manager.persistCommunity(teamId)

      // wait until the task is parked inside the secrets write
      await waitFor(() => {
        expect(captured.keyrings.length).toBe(1)
      })

      // the team moves on while the secrets write is in flight: another rotation, another link
      await rotateAndSyncToServer(testTeam)

      captured.gate.open()
      await persisting
      await manager.persistCommunity(teamId)

      // The pair committed first must be a matched pair. Under the old code the graph was
      // serialized after the await and carried links the stored keyring could not open.
      const pairedKeyring = JSON.parse(
        uint8arrays.toString(captured.keyrings[0], 'utf8'),
      ) as Keyring
      const committedGraph = uint8arrays.fromString(captured.graphs[0], 'hex')
      expect(() =>
        SigChain.create(
          committedGraph,
          { server: testTeam.serverWithSecrets! },
          pairedKeyring,
        ),
      ).not.toThrow()
    })

    it('records the digest of the keyring the graph was committed with', async () => {
      const { testTeam, teamId } = await createCommunity()
      // no mocked write here: the point is what actually lands in the row
      await manager.persistCommunity(teamId)
      const firstDigest = (await storage.getCommunity(teamId))!
        .teamKeyringDigest
      expect(firstDigest).toBeDefined()

      // the same keyring is recorded as the same digest
      await manager.persistCommunity(teamId)
      expect((await storage.getCommunity(teamId))!.teamKeyringDigest).toEqual(
        firstDigest,
      )

      // and a rotation is recorded as a different one, so a cold load can tell which keyring the
      // graph beside it was committed with
      await rotateAndSyncToServer(testTeam)
      await manager.persistCommunity(teamId)
      const rotatedDigest = (await storage.getCommunity(teamId))!
        .teamKeyringDigest
      expect(rotatedDigest).toBeDefined()
      expect(rotatedDigest).not.toEqual(firstDigest)
    })

    it('fails before the keyring reaches storage, leaving the graph untouched', async () => {
      const { testTeam, teamId } = await createCommunity()
      await rotateAndSyncToServer(testTeam)
      await manager.persistCommunity(teamId)
      forgetPersistedKeyringDigest(teamId)
      const graphBefore = await readStoredGraph(teamId)

      jest
        .spyOn(serverKeyManager, 'storeKeyring')
        .mockRejectedValue(new Error('secrets manager unavailable'))
      const updateSpy = jest.spyOn(storage, 'updateCommunity')

      await expect(manager.persistCommunity(teamId)).rejects.toThrow(
        'secrets manager unavailable',
      )
      expect(updateSpy).not.toHaveBeenCalled()
      expect(await readStoredGraph(teamId)).toEqual(graphBefore)
    })

    it('fails after the keyring is stored, leaving a keyring that still loads the older graph', async () => {
      const { testTeam, teamId } = await createCommunity()
      const graphBefore = await readStoredGraph(teamId)

      // rotate so the keyring write is real, then fail the graph write
      await rotateAndSyncToServer(testTeam)
      jest.spyOn(storage, 'updateCommunity').mockResolvedValue(false)

      await expect(manager.persistCommunity(teamId)).rejects.toThrow(
        'Error while updating community',
      )

      // This is the window keyring-first ordering exists to make safe: the durable keyring is now
      // ahead of the durable graph, and a superset keyring still opens the older graph.
      const keyringNow = await readStoredKeyring(teamId)
      expect(() =>
        SigChain.create(
          graphBefore,
          { server: testTeam.serverWithSecrets! },
          keyringNow,
        ),
      ).not.toThrow()
    })

    it('leaves a loadable pair once the graph is committed', async () => {
      const { testTeam, teamId } = await createCommunity()
      await rotateAndSyncToServer(testTeam)
      await manager.persistCommunity(teamId)

      // a crash here, after the graph commit and before anything acknowledges it, still leaves both
      // halves on disk and consistent
      const graph = await readStoredGraph(teamId)
      const keyring = await readStoredKeyring(teamId)
      expect(() =>
        SigChain.create(
          graph,
          { server: testTeam.serverWithSecrets! },
          keyring,
        ),
      ).not.toThrow()
    })
  })

  describe('bounded persistence work (M-4)', () => {
    /** The manager's private queue for a team, for asserting depth and coalescing. */
    const queueOf = (
      teamId: string,
    ):
      | {
          pending: number
          coalescedUpdate?: unknown
          durableHeads: Set<string>
        }
      | undefined =>
      (
        manager as unknown as {
          persistQueues: Map<
            string,
            {
              pending: number
              coalescedUpdate?: unknown
              durableHeads: Set<string>
            }
          >
        }
      ).persistQueues.get(teamId)

    /** Count writes without letting them reach PostgreSQL, optionally holding them open. */
    const countWrites = (
      gate?: ReturnType<typeof createGate>,
    ): { count: () => number } => {
      let writes = 0
      jest
        .spyOn(storage, 'updateCommunity')
        .mockImplementation(async (): Promise<boolean> => {
          writes += 1
          if (gate != null) {
            await gate.promise
          }
          return true
        })
      return { count: () => writes }
    }

    it('re-persisting an already durable admission does no new work', async () => {
      const { teamId } = await createCommunity()
      const { team } = (await manager.get(teamId))!.sigChain
      const writes = countWrites()

      await manager.persistAdmittedTeam(team)
      expect(writes.count()).toBe(1)

      // A peer that re-runs the handshake for an admission we have committed must not make us
      // serialize and store the same state again.
      await manager.persistAdmittedTeam(team)
      await manager.persistAdmittedTeam(team)
      expect(writes.count()).toBe(1)
    })

    it('joins an in-flight admission write instead of queueing another', async () => {
      const { teamId } = await createCommunity()
      const { team } = (await manager.get(teamId))!.sigChain
      const gate = createGate()
      const writes = countWrites(gate)

      const first = manager.persistAdmittedTeam(team)
      await waitFor(() => {
        expect(writes.count()).toBe(1)
      })

      const second = manager.persistAdmittedTeam(team)
      expect(queueOf(teamId)!.pending).toBe(1)

      gate.open()
      await Promise.all([first, second])
      expect(writes.count()).toBe(1)
    })

    it('coalesces chain updates into a single pending write', async () => {
      const { testTeam, teamId } = await createCommunity()
      const gate = createGate()
      const writes = countWrites(gate)

      const holding = manager.persistCommunity(teamId)
      await waitFor(() => {
        expect(writes.count()).toBe(1)
      })

      // five chain updates arrive while that write is held
      for (let i = 0; i < 5; i++) {
        await rotateAndSyncToServer(testTeam)
      }

      // the running write plus one coalesced slot, never one task per update
      expect(queueOf(teamId)!.pending).toBeLessThanOrEqual(2)

      gate.open()
      await holding
      await manager.persistCommunity(teamId)

      // one held write, one coalesced write covering all five updates, one final drain
      expect(writes.count()).toBe(3)
    })

    it('fails the admission gate closed once the backlog is at its limit', async () => {
      const { teamId } = await createCommunity()
      const { team } = (await manager.get(teamId))!.sigChain
      const gate = createGate()
      const writes = countWrites(gate)

      const backlog: Array<Promise<void>> = []
      for (let i = 0; i < 8; i++) {
        backlog.push(manager.persistCommunity(teamId))
      }
      expect(queueOf(teamId)!.pending).toBe(8)

      // One invitation holder must not be able to grow this without bound, so past the limit the
      // gate refuses rather than queueing more work.
      await expect(manager.persistAdmittedTeam(team)).rejects.toThrow(
        'durable writes pending',
      )

      // Refusing an admission also rolls the community back: the ADMIT link is in memory and did
      // not reach disk, so the work queued behind it is abandoned rather than committed.
      expect(queueOf(teamId)).toBeUndefined()

      gate.open()
      const settled = await Promise.allSettled(backlog)
      const discarded = settled.filter(result => result.status === 'rejected')
      // the one already running finishes; the seven still queued are discarded
      expect(discarded.length).toBe(7)
      expect(writes.count()).toBe(1)
    })
  })

  describe('rollback to durable state on a failed admission (M-1 fallout)', () => {
    const cacheOf = (): Map<string, ManagedCommunity> =>
      (manager as unknown as { communities: Map<string, ManagedCommunity> })
        .communities

    const queueOf = (teamId: string): unknown =>
      (
        manager as unknown as { persistQueues: Map<string, unknown> }
      ).persistQueues.get(teamId)

    /** Drive a failing admission persist against the community's current team. */
    const failAnAdmission = async (
      teamId: string,
    ): Promise<{ taintedTeam: Team }> => {
      const managedCommunity = (await manager.get(teamId))!
      const taintedTeam = managedCommunity.sigChain.team
      jest.spyOn(storage, 'updateCommunity').mockResolvedValue(false)
      await expect(manager.persistAdmittedTeam(taintedTeam)).rejects.toThrow(
        'Error while updating community',
      )
      return { taintedTeam }
    }

    it('evicts the community and abandons its queue', async () => {
      const { teamId } = await createCommunity()

      await failAnAdmission(teamId)

      expect(cacheOf().has(teamId)).toBe(false)
      expect(queueOf(teamId)).toBeUndefined()
    })

    it('does not let a later chain update commit the un-persisted admission', async () => {
      const { testTeam, teamId } = await createCommunity()
      const graphBefore = await readStoredGraph(teamId)
      const { taintedTeam } = await failAnAdmission(teamId)

      // Let the real write path work again, then move the tainted instance the way a sync would.
      jest.restoreAllMocks()
      const writeSpy = jest.spyOn(storage, 'updateCommunity')
      await teamTestUtils.addUserToTeam(testTeam, 'later-update')
      taintedTeam.merge(testTeam.team.graph)
      await new Promise(resolve => {
        setImmediate(resolve)
      })

      // The tainted instance is unhooked from the listener, so nothing it does reaches storage.
      expect(writeSpy).not.toHaveBeenCalled()
      expect(await readStoredGraph(teamId)).toEqual(graphBefore)
    })

    it('drops every auth connection and reloads an instance matching PostgreSQL', async () => {
      const { testTeam, teamId } = await createCommunity()
      const managedCommunity = (await manager.get(teamId))!
      const connections = [...managedCommunity.authConnections!.values()]
      expect(connections.length).toBeGreaterThan(0)
      const stopSpies = connections.map(connection =>
        jest.spyOn(connection, 'stop'),
      )

      const { taintedTeam } = await failAnAdmission(teamId)
      // connections are stopped on the next tick, after the library has reported the failure
      await waitFor(() => {
        for (const stopSpy of stopSpies) {
          expect(stopSpy).toHaveBeenCalled()
        }
      })

      jest.restoreAllMocks()
      const reloaded = await manager.get(teamId)
      expect(reloaded).toBeDefined()
      expect(reloaded!.sigChain.team).not.toBe(taintedTeam)
      expect(reloaded!.sigChain.serialize(true)).toEqual(
        uint8arrays.toString(await readStoredGraph(teamId), 'hex'),
      )
      expect(reloaded!.sigChain.team.members().length).toBe(
        // the un-persisted admission is gone; durable state is the truth again
        SigChain.create(
          await readStoredGraph(teamId),
          { server: testTeam.serverWithSecrets! },
          await readStoredKeyring(teamId),
        ).team.members().length,
      )
    })

    it('reloads once, through the single-flight path, and keeps no stale instance', async () => {
      const { teamId } = await createCommunity()
      const { taintedTeam } = await failAnAdmission(teamId)
      jest.restoreAllMocks()

      const getCommunitySpy = jest.spyOn(storage, 'getCommunity')
      const [first, second, third] = await Promise.all([
        manager.get(teamId),
        manager.get(teamId),
        manager.get(teamId),
      ])

      // eviction plus single-flight means exactly one reload, shared by every caller
      expect(getCommunitySpy).toHaveBeenCalledTimes(1)
      expect(second!.sigChain).toBe(first!.sigChain)
      expect(third!.sigChain).toBe(first!.sigChain)
      expect(first!.sigChain.team).not.toBe(taintedTeam)
      // and the M-2 guard does not block the reload, because the rollback drained the references
      expect(cacheOf().get(teamId)!.sigChain).toBe(first!.sigChain)
    })
  })

  describe('chain update listener', () => {
    it('persists the graph when the chain changes', async () => {
      const { testTeam, teamId } = await createCommunity()
      const graphBefore = await readStoredGraph(teamId)

      await rotateAndSyncToServer(testTeam)
      // queue behind the listener's own persist so both have settled
      await manager.persistCommunity(teamId)

      const graphAfter = await readStoredGraph(teamId)
      expect(graphAfter).not.toEqual(graphBefore)

      const managedCommunity = await manager.get(teamId)
      expect(graphAfter).toEqual(managedCommunity!.sigChain.serialize())
    })

    it('surfaces a failed write on the sigchain instead of swallowing it', async () => {
      const { testTeam, teamId } = await createCommunity()
      const managedCommunity = await manager.get(teamId)
      expect(managedCommunity).toBeDefined()

      jest.spyOn(storage, 'updateCommunity').mockResolvedValue(false)

      const persistFailed = new Promise<{ teamId: string }>(resolve => {
        managedCommunity!.sigChain.once(
          SigchainEvents.PERSIST_FAILED,
          (payload: { teamId: string }) => {
            resolve(payload)
          },
        )
      })

      // LFA emits `updated` synchronously and drops what the listener returns, so the only way a
      // failed write is visible is if the manager reports it.
      await rotateAndSyncToServer(testTeam)

      await expect(persistFailed).resolves.toMatchObject({ teamId })
    })
  })

  describe('team key rotation (GLOBAL-QSS-002 / private#192)', () => {
    it('re-stores the team keyring so a cold reload of a rotated graph succeeds', async () => {
      const { testTeam, teamId, keyringAtCreation } = await createCommunity()

      await rotateAndSyncToServer(testTeam)
      await manager.persistCommunity(teamId)

      const graph = await readStoredGraph(teamId)
      const context = { server: testTeam.serverWithSecrets! }

      // The hazard: the keyring QSS was handed at creation cannot open the rotated graph. This is
      // exactly the keyring that used to stay in the secrets manager forever.
      expect(() => SigChain.create(graph, context, keyringAtCreation)).toThrow(
        `Can't decrypt link`,
      )

      // The fix: what is in the secrets manager now is the rotated keyring, and it loads.
      const keyringNow = await readStoredKeyring(teamId)
      expect(Object.keys(keyringNow).length).toBeGreaterThan(
        Object.keys(keyringAtCreation).length,
      )
      expect(() => SigChain.create(graph, context, keyringNow)).not.toThrow()
    })

    it('leaves a durable pair a restarted process can load', async () => {
      const { testTeam, teamId } = await createCommunity()

      await rotateAndSyncToServer(testTeam)
      await manager.persistCommunity(teamId)

      // Rebuild from the stored bytes alone, touching nothing this process holds in memory. This is
      // what a restarted QSS comes up with, and asserting it through the manager's cache instead
      // would pass even if nothing had been written.
      const graph = await readStoredGraph(teamId)
      const keyring = await readStoredKeyring(teamId)
      const coldLoaded = SigChain.create(
        graph,
        { server: testTeam.serverWithSecrets! },
        keyring,
      )
      expect(coldLoaded.serialize(true)).toEqual(
        uint8arrays.toString(graph, 'hex'),
      )
      expect(coldLoaded.team.members().length).toBe(
        (await manager.get(teamId))!.sigChain.team.members().length,
      )
    })
  })
})
