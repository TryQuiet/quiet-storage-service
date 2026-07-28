import { jest } from '@jest/globals'
import EventEmitter from 'node:events'
import * as uint8arrays from 'uint8arrays'
import { CommunitiesManagerService } from './communities-manager.service.js'
import { SigChain } from './auth/sigchain.js'
import {
  type SigChainPersistenceSnapshot,
  SigchainEvents,
} from './auth/types.js'
import type { CommunitiesStorageService } from './storage/communities.storage.service.js'
import type { ServerKeyManagerService } from '../encryption/server-key-manager.service.js'
import { Serializer } from '../utils/serialization/serializer.service.js'
import type { LogEntrySyncStorageService } from './storage/log-entry-sync.storage.service.js'
import { StoredKeyRingType } from '../encryption/types.js'

const TEAM_ID = 'team-id'

class FakeSigChain extends EventEmitter {
  public readonly team = { id: TEAM_ID }

  private graph: string
  private keyring: Uint8Array

  constructor(graph: string, keyring: Uint8Array) {
    super()
    this.graph = graph
    this.keyring = keyring
  }

  public update(graph: string, keyring: Uint8Array): void {
    this.graph = graph
    this.emit(SigchainEvents.UPDATED)
    // LFA changeKeys emits while dispatching the graph update, then installs
    // the new local context keys after the event handler returns.
    this.keyring = keyring
  }

  public serializeForPersistence(): SigChainPersistenceSnapshot {
    return {
      teamId: TEAM_ID,
      sigChain: this.graph,
      teamKeyring: this.keyring,
    }
  }

  public clearListeners(): void {
    // The real SigChain uses this to detach its underlying Team listener.
  }
}

describe('CommunitiesManagerService sigchain persistence', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('persists rapid graph/keyring snapshots in order and reloads the matching pair', async () => {
    const operations: string[] = []
    const failGraphOnce = new Set(['02', '04'])
    let storedGraph = '00'
    let storedTeamKeyring = serializeKeyring(0)
    const storedServerKeyring = uint8arrays.fromString('{}', 'utf8')

    const storage = {
      getCommunity: jest.fn(
        async () =>
          await resolveValue({
            teamId: TEAM_ID,
            sigChain: storedGraph,
          }),
      ),
      updateCommunity: jest.fn(
        async (
          teamId: string,
          updates: {
            sigChain?: string
          },
        ) => {
          expect(teamId).toBe(TEAM_ID)
          if (
            updates.sigChain != null &&
            failGraphOnce.delete(updates.sigChain)
          ) {
            operations.push(`graph-failed:${updates.sigChain}`)
            return await resolveValue(false)
          }
          storedGraph = updates.sigChain ?? storedGraph
          operations.push(`graph:${storedGraph}`)
          return await resolveValue(true)
        },
      ),
    } as unknown as CommunitiesStorageService

    const updateKeyring = jest.fn(
      async (teamId: string, keyring: Uint8Array, type: StoredKeyRingType) => {
        expect(teamId).toBe(TEAM_ID)
        expect(type).toBe(StoredKeyRingType.TEAM_KEYRING)
        storedTeamKeyring = Uint8Array.from(keyring)
        const parsedKeyring = JSON.parse(
          uint8arrays.toString(keyring, 'utf8'),
        ) as { current: { generation: number } }
        operations.push(`keyring:${parsedKeyring.current.generation}`)
        return await resolveValue({})
      },
    )
    const serverKeyManager = {
      retrieveKeyring: jest.fn(
        async (_teamId: string, type: StoredKeyRingType) =>
          await resolveValue(
            type === StoredKeyRingType.SERVER_KEYRING
              ? storedServerKeyring
              : storedTeamKeyring,
          ),
      ),
      updateKeyring,
    } as unknown as ServerKeyManagerService

    const createSigChain = jest
      .spyOn(SigChain, 'create')
      .mockImplementation(
        (serializedSigchain, _context, teamKeyring) =>
          new FakeSigChain(
            uint8arrays.toString(serializedSigchain, 'hex'),
            uint8arrays.fromString(JSON.stringify(teamKeyring), 'utf8'),
          ) as unknown as SigChain,
      )

    const firstManager = createManager(storage, serverKeyManager)
    const firstCommunity = await firstManager.get(TEAM_ID)
    const firstSigChain = firstCommunity?.sigChain as unknown as
      | FakeSigChain
      | undefined
    expect(firstSigChain).toBeDefined()

    firstSigChain!.update('01', serializeKeyring(0, true))
    await nextMicrotask()
    firstSigChain!.update('02', serializeKeyring(1))
    await nextMicrotask()
    firstSigChain!.update('03', serializeKeyring(1))
    await nextMicrotask()

    // Expiry removes the cache entry synchronously. A concurrent get must
    // drain the existing queue before reading the graph back from storage.
    firstCommunity!.expiryMs = 0
    getManagerInternals(firstManager).clearUnusedCommunitiesFromMemory()
    const firstReload = firstManager.get(TEAM_ID)
    const concurrentReload = firstManager.get(TEAM_ID)
    const [reloadedCommunity, concurrentlyReloadedCommunity] =
      await Promise.all([firstReload, concurrentReload])
    expect(concurrentlyReloadedCommunity).toBe(reloadedCommunity)
    expect(createSigChain).toHaveBeenCalledTimes(2)
    const reloadedSigChain =
      reloadedCommunity?.sigChain as unknown as FakeSigChain
    const reloadedSnapshot = reloadedSigChain.serializeForPersistence()

    expect(operations).toEqual([
      'graph:01',
      'keyring:1',
      'graph-failed:02',
      'graph:02',
      'graph:03',
    ])
    expect(updateKeyring).toHaveBeenCalledTimes(1)
    expect(reloadedSnapshot.sigChain).toBe('03')
    expect(reloadedSnapshot.teamKeyring).toEqual(serializeKeyring(1))

    // Shutdown must drain a newly queued snapshot before clearing state.
    reloadedSigChain.update('04', serializeKeyring(1))
    await firstManager.onModuleDestroy()
    expect(operations.at(-1)).toBe('graph:04')
    expect(operations.at(-2)).toBe('graph-failed:04')
    expect(updateKeyring).toHaveBeenCalledTimes(1)

    const restartedManager = createManager(storage, serverKeyManager)
    const restartedCommunity = await restartedManager.get(TEAM_ID)
    const restartedSnapshot = (
      restartedCommunity?.sigChain as unknown as FakeSigChain
    ).serializeForPersistence()

    expect(restartedSnapshot.sigChain).toBe('04')
    expect(restartedSnapshot.teamKeyring).toEqual(serializeKeyring(1))
    await restartedManager.onModuleDestroy()
  })

  it('bounds persistence retries while shutting down', async () => {
    const updateCommunity = jest.fn(async () => await resolveValue(false))
    const storage = {
      getCommunity: jest.fn(
        async () =>
          await resolveValue({
            teamId: TEAM_ID,
            sigChain: '00',
          }),
      ),
      updateCommunity,
    } as unknown as CommunitiesStorageService
    const storedServerKeyring = uint8arrays.fromString('{}', 'utf8')
    const serverKeyManager = {
      retrieveKeyring: jest.fn(
        async (_teamId: string, type: StoredKeyRingType) =>
          await resolveValue(
            type === StoredKeyRingType.SERVER_KEYRING
              ? storedServerKeyring
              : serializeKeyring(0),
          ),
      ),
      updateKeyring: jest.fn(),
    } as unknown as ServerKeyManagerService
    jest
      .spyOn(SigChain, 'create')
      .mockImplementation(
        (serializedSigchain, _context, teamKeyring) =>
          new FakeSigChain(
            uint8arrays.toString(serializedSigchain, 'hex'),
            uint8arrays.fromString(JSON.stringify(teamKeyring), 'utf8'),
          ) as unknown as SigChain,
      )

    const manager = createManager(storage, serverKeyManager)
    const community = await manager.get(TEAM_ID)
    const sigChain = community?.sigChain as unknown as FakeSigChain
    sigChain.update('01', serializeKeyring(0))

    const shutdown = manager.onModuleDestroy()
    await expect(manager.get(TEAM_ID)).rejects.toThrow('during shutdown')
    await shutdown

    expect(updateCommunity).toHaveBeenCalledTimes(2)

    sigChain.update('02', serializeKeyring(0))
    await nextMicrotask()
    expect(updateCommunity).toHaveBeenCalledTimes(2)
  })
})

interface ManagerInternals {
  clearUnusedCommunitiesFromMemory: () => void
}

const getManagerInternals = (
  manager: CommunitiesManagerService,
): ManagerInternals => {
  const internals = manager as unknown as {
    _clearUnusedCommunitiesFromMemory: () => void
  }
  return {
    clearUnusedCommunitiesFromMemory:
      internals._clearUnusedCommunitiesFromMemory,
  }
}

const serializeKeyring = (
  generation: number,
  reverseOrder = false,
): Uint8Array => {
  const stable = ['stable', { generation: 0 }] as const
  const current = ['current', { generation }] as const
  const entries = reverseOrder ? [stable, current] : [current, stable]
  return uint8arrays.fromString(
    JSON.stringify(Object.fromEntries(entries)),
    'utf8',
  )
}

const resolveValue = async <T>(value: T): Promise<T> =>
  await Promise.resolve(value)

const nextMicrotask = async (): Promise<void> => {
  await Promise.resolve()
}

const createManager = (
  storage: CommunitiesStorageService,
  serverKeyManager: ServerKeyManagerService,
): CommunitiesManagerService =>
  new CommunitiesManagerService(
    'test-host',
    new Serializer(),
    storage,
    Object.create(null) as LogEntrySyncStorageService,
    serverKeyManager,
  )
