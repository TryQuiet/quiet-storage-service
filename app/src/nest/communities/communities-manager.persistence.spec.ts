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
import type { Keyring } from '@localfirst/auth'

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
import type { TestTeam } from '../../../test/utils/types.js'
import type { Community } from './types.js'
import type { QuietSocket } from '../websocket/ws.types.js'

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

    it('reloads the community from storage after a rotation', async () => {
      const { testTeam, teamId } = await createCommunity()

      await rotateAndSyncToServer(testTeam)
      await manager.persistCommunity(teamId)

      // forceFetchFromStorage rebuilds the sigchain from the stored graph and the stored keyring,
      // which is what a restarted QSS process does.
      const reloaded = await manager.get(teamId, true)
      expect(reloaded).toBeDefined()
      expect(reloaded!.sigChain.serialize()).toEqual(
        await readStoredGraph(teamId),
      )
    })
  })
})
