/* eslint-disable max-lines -- there's a lot to test here */
import { jest } from '@jest/globals'
import { Test, type TestingModule } from '@nestjs/testing'
import { CommunitiesManagerService } from '../communities-manager.service.js'
import { StorageModule } from '../../storage/storage.module.js'
import { CommunitiesModule } from '../communities.module.js'
import { EncryptionModule } from '../../encryption/enc.module.js'
import { TeamTestUtils } from '../../../../test/utils/team.utils.js'
import { ServerKeyManagerService } from '../../encryption/server-key-manager.service.js'
import {
  EncryptionScopeType,
  type ManagedCommunity,
  type EncryptedAndSignedPayload,
} from '../types.js'

import type { LogEntrySyncHandlerConfig } from '../../websocket/handlers/types/common.types.js'
import { CommunitiesStorageService } from '../storage/communities.storage.service.js'
import type { Socket } from 'socket.io'
import { RedisClient } from '../../storage/redis/redis.client.js'
import { LogEntrySyncStorageService } from '../storage/log-entry-sync.storage.service.js'
import type { LogEntrySyncPayload } from '../../websocket/handlers/types/log-entry-sync.types.js'
import type { TestTeam } from '../../../../test/utils/types.js'
import { DateTime } from 'luxon'
import { SodiumHelper } from '../../encryption/sodium.helper.js'
import { type AuthConnectionConfig, AuthStatus } from '../auth/types.js'
import { AuthConnection } from '../auth/auth.connection.js'
import { UtilsModule } from '../../utils/utils.module.js'
import type { Serializer } from '../../utils/serialization/serializer.service.js'
import { SERIALIZER } from '../../app/const.js'
import type { QuietSocket } from '../../websocket/ws.types.js'
import { createLogger } from '../../app/logger/logger.js'
import { LogEntrySyncManager } from './log-entry-sync.service.js'

const logger = createLogger('Test:LogEntrySyncManager')
describe('LogEntrySyncManager', () => {
  let module: TestingModule | undefined = undefined
  let communitiesManager: CommunitiesManagerService | undefined = undefined
  let testTeamUtils: TeamTestUtils | undefined = undefined
  let serverKeyManager: ServerKeyManagerService | undefined = undefined
  let logEntrySyncManager: LogEntrySyncManager | undefined = undefined
  let storage: CommunitiesStorageService | undefined = undefined
  let dataSyncStorage: LogEntrySyncStorageService | undefined = undefined
  let redis: RedisClient | undefined = undefined
  let sodiumHelper: SodiumHelper | undefined = undefined
  let serializer: Serializer | undefined = undefined
  let wsConfig: LogEntrySyncHandlerConfig | undefined = undefined
  let mockedSocket: QuietSocket | undefined = undefined

  beforeEach(async () => {
    jest.mock('../src/nest/communities/auth/auth.connection.js')
    module = await Test.createTestingModule({
      imports: [
        UtilsModule,
        StorageModule,
        CommunitiesModule,
        EncryptionModule,
      ],
    }).compile()
    await module.init()

    communitiesManager = module.get<CommunitiesManagerService>(
      CommunitiesManagerService,
    )
    logEntrySyncManager = module.get<LogEntrySyncManager>(LogEntrySyncManager)
    serverKeyManager = module.get<ServerKeyManagerService>(
      ServerKeyManagerService,
    )
    storage = module.get<CommunitiesStorageService>(CommunitiesStorageService)
    dataSyncStorage = module.get<LogEntrySyncStorageService>(
      LogEntrySyncStorageService,
    )
    redis = module.get<RedisClient>(RedisClient)
    sodiumHelper = module.get<SodiumHelper>(SodiumHelper)
    serializer = module.get<Serializer>(SERIALIZER)
    testTeamUtils = new TeamTestUtils(serverKeyManager)
    mockedSocket = {
      id: 'test-socket',
      data: {},
      on: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      join: jest.fn(async (room: string) => {
        /* empty */
      }),
    } as unknown as QuietSocket
    wsConfig = {
      syncManager: logEntrySyncManager,
      socket: mockedSocket,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- test mock is safe here
      socketServer: {} as any,
    }
  })

  afterEach(async () => {
    await storage?.clearRepository()
    await redis?.flush()
    await module?.close()
    jest.clearAllMocks()
  })

  const generateDataSyncPayload = (
    testTeam: TestTeam,
    overrides?: {
      hash?: string
      hashedDbId?: string
      ts?: number
      contents?: Uint8Array
    },
  ): LogEntrySyncPayload => {
    const rawMessage = 'this is a message'
    const encryptedMessage = testTeam.team.encrypt(rawMessage, 'member')
    const signature = testTeam.team.sign(rawMessage)
    const dataSyncPayload: LogEntrySyncPayload = {
      teamId: testTeam.team.id,
      hash: sodiumHelper!.sodium.crypto_hash(rawMessage, 'base64'),
      hashedDbId: sodiumHelper!.sodium.crypto_hash(
        sodiumHelper!.sodium.randombytes_buf(32),
        'base64',
      ),
      encEntry: {
        userId: testTeam.testUserContext.user.userId,
        ts: DateTime.utc().toMillis(),
        teamId: testTeam.team.id,
        signature,
        encrypted: {
          contents: encryptedMessage.contents,
          scope: {
            name: 'member',
            type: EncryptionScopeType.ROLE,
            generation: encryptedMessage.recipient.generation,
          },
        },
      },
    }
    if (overrides?.hash != null) {
      dataSyncPayload.hash = overrides.hash
    }
    if (overrides?.hashedDbId != null) {
      dataSyncPayload.hashedDbId = overrides.hashedDbId
    }
    if (overrides?.ts != null) {
      dataSyncPayload.encEntry.ts = overrides.ts
    }
    if (overrides?.contents != null) {
      dataSyncPayload.encEntry.encrypted.contents = overrides.contents
    }
    return dataSyncPayload
  }

  const setupAuth = async (
    testTeam: TestTeam,
    status: AuthStatus,
  ): Promise<void> => {
    const sigChain = await testTeamUtils!.createSigchainFromTestTeam(testTeam)
    const authConnection = new AuthConnection(
      testTeam.testUserContext.user.userId,
      sigChain.sigchain,
      {
        communitiesManager: communitiesManager!,
        socket: wsConfig!.socket as Socket,
      },
    )

    Object.defineProperty(authConnection, '_status', {
      get: jest.fn((): AuthStatus => status),
      configurable: true,
    })

    communitiesManager!.get = async (
      teamId: string,
      forceFetchFromStorage = false,
      // eslint-disable-next-line @typescript-eslint/require-await -- just matching the real function
    ): Promise<ManagedCommunity> => {
      const authConnections = new Map<string, AuthConnection>()
      authConnections.set(testTeam.testUserContext.user.userId, authConnection)
      return {
        teamId,
        sigChain: sigChain.sigchain,
        authConnections,
      }
    }
  }

  const addLogEntries = async (options: {
    testTeam: TestTeam
    hashedDbId: string
    startMs: number
    count: number
    size?: number
    cidPrefix: string
  }): Promise<
    Array<{
      cid: string
      entry: Buffer
      receivedAtMs: number
      hashedDbId: string
    }>
  > => {
    const {
      testTeam,
      hashedDbId,
      startMs,
      count,
      size = 32,
      cidPrefix,
    } = options
    const teamId = testTeam.team.id
    const entries = []
    for (let i = 0; i < count; i += 1) {
      const receivedAtMs = startMs + i * 1000
      const cid = `${cidPrefix}-${i}`
      const contents =
        size > 0 ? new Uint8Array(size).fill(i) : new Uint8Array()
      const payload = generateDataSyncPayload(testTeam, {
        hash: cid,
        hashedDbId,
        contents,
      })
      const entry = serializer!.serialize(payload.encEntry)
      await dataSyncStorage!.addLogEntry({
        cid: payload.hash,
        hashedDbId: payload.hashedDbId,
        communityId: teamId,
        entry,
        receivedAt: DateTime.fromMillis(receivedAtMs).toUTC(),
      })
      entries.push({
        cid,
        entry,
        receivedAtMs,
        hashedDbId,
      })
    }
    return entries
  }

  describe('processIncomingSyncMessage', () => {
    it('should write a sync message to the database', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      const sigChain = await testTeamUtils!.createSigchainFromTestTeam(testTeam)
      const payload = generateDataSyncPayload(testTeam)

      const authConnection = new AuthConnection(
        testTeam.testUserContext.user.userId,
        sigChain.sigchain,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- this is ok
        {
          communitiesManager: communitiesManager!,
          socket: wsConfig!.socket as Socket,
        } satisfies AuthConnectionConfig,
      )

      Object.defineProperty(authConnection, '_status', {
        get: jest.fn((): AuthStatus => AuthStatus.JOINED), // Define a getter that returns your mocked value
        configurable: true, // Allow the property to be redefined later if needed
      })

      communitiesManager!.get = async (
        teamId: string,
        forceFetchFromStorage = false,
        // eslint-disable-next-line @typescript-eslint/require-await -- just matching the real function
      ): Promise<ManagedCommunity> => {
        const authConnections = new Map<string, AuthConnection>()
        authConnections.set(
          testTeam.testUserContext.user.userId,
          authConnection,
        )
        const managedCommunity: ManagedCommunity = {
          teamId,
          sigChain: sigChain.sigchain,
          authConnections,
        }
        return managedCommunity
      }

      let error: Error | undefined = undefined
      let written = false
      try {
        written = await logEntrySyncManager!.processIncomingLogEntrySyncMessage(
          payload,
          wsConfig!.socket,
        )
      } catch (e) {
        error = e as Error
      }

      expect(error).toBeUndefined()
      expect(written).toBe(true)

      const storedSyncContents =
        await dataSyncStorage!.getLogEntriesForCommunity(
          testTeam.team.id,
          payload.encEntry.ts - 10_000,
        )
      expect(storedSyncContents).toBeDefined()
      expect(storedSyncContents!.length).toBe(1)
      const contents = storedSyncContents![0]
      expect(contents.cid).toBe(payload.hash)
      expect(contents.communityId).toBe(testTeam.team.id)
      const deserializedContents = serializer!.deserialize(
        contents.entry,
      ) as EncryptedAndSignedPayload
      expect(deserializedContents).toEqual(
        expect.objectContaining({
          userId: payload.encEntry.userId,
          ts: payload.encEntry.ts,
          teamId: payload.encEntry.teamId,
          signature: payload.encEntry.signature,
          encrypted: {
            contents: payload.encEntry.encrypted.contents,
            scope: {
              name: payload.encEntry.encrypted.scope.name,
              type: payload.encEntry.encrypted.scope.type,
              generation: payload.encEntry.encrypted.scope.generation,
            },
          },
        }),
      )
    })

    it(`should fail to write a sync message to the database when the user hasn't started signing in`, async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      const sigChain = await testTeamUtils!.createSigchainFromTestTeam(testTeam)
      const payload = generateDataSyncPayload(testTeam)

      const authConnection = new AuthConnection(
        testTeam.testUserContext.user.userId,
        sigChain.sigchain,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- this is ok
        {
          communitiesManager: communitiesManager!,
          socket: wsConfig!.socket as Socket,
        },
      )

      Object.defineProperty(authConnection, '_status', {
        get: jest.fn((): AuthStatus => AuthStatus.PENDING), // Define a getter that returns your mocked value
        configurable: true, // Allow the property to be redefined later if needed
      })

      communitiesManager!.get = async (
        teamId: string,
        forceFetchFromStorage = false,
        // eslint-disable-next-line @typescript-eslint/require-await -- just matching the real function
      ): Promise<ManagedCommunity> => {
        const authConnections = new Map<string, AuthConnection>()
        authConnections.set(
          testTeam.testUserContext.user.userId,
          authConnection,
        )
        const managedCommunity: ManagedCommunity = {
          teamId,
          sigChain: sigChain.sigchain,
          authConnections,
        }
        return managedCommunity
      }

      let error: Error | undefined = undefined
      let written = false
      try {
        written = await logEntrySyncManager!.processIncomingLogEntrySyncMessage(
          payload,
          wsConfig!.socket,
        )
      } catch (e) {
        error = e as Error
      }

      expect(error).toBeDefined()
      expect(error?.message).toBe(
        'User does not have permissions on this community or has not signed in',
      )
      expect(written).toBe(false)

      const storedSyncContents =
        await dataSyncStorage!.getLogEntriesForCommunity(
          testTeam.team.id,
          payload.encEntry.ts - 10_000,
        )
      expect(storedSyncContents).toBeDefined()
      expect(storedSyncContents!.length).toBe(0)
    })

    it(`should fail to write a sync message to the database when the user hasn't finished signing in`, async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      const sigChain = await testTeamUtils!.createSigchainFromTestTeam(testTeam)
      const payload = generateDataSyncPayload(testTeam)

      const authConnection = new AuthConnection(
        testTeam.testUserContext.user.userId,
        sigChain.sigchain,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- this is ok
        {
          communitiesManager: communitiesManager!,
          socket: wsConfig!.socket as Socket,
        },
      )

      Object.defineProperty(authConnection, '_status', {
        get: jest.fn((): AuthStatus => AuthStatus.JOINING), // Define a getter that returns your mocked value
        configurable: true, // Allow the property to be redefined later if needed
      })

      communitiesManager!.get = async (
        teamId: string,
        forceFetchFromStorage = false,
        // eslint-disable-next-line @typescript-eslint/require-await -- just matching the real function
      ): Promise<ManagedCommunity> => {
        const authConnections = new Map<string, AuthConnection>()
        authConnections.set(
          testTeam.testUserContext.user.userId,
          authConnection,
        )
        const managedCommunity: ManagedCommunity = {
          teamId,
          sigChain: sigChain.sigchain,
          authConnections,
        }
        return managedCommunity
      }

      let error: Error | undefined = undefined
      let written = false
      try {
        written = await logEntrySyncManager!.processIncomingLogEntrySyncMessage(
          payload,
          wsConfig!.socket,
        )
      } catch (e) {
        error = e as Error
      }

      expect(error).toBeDefined()
      expect(error?.message).toBe(
        'User does not have permissions on this community or has not signed in',
      )
      expect(written).toBe(false)

      const storedSyncContents =
        await dataSyncStorage!.getLogEntriesForCommunity(
          testTeam.team.id,
          payload.encEntry.ts - 10_000,
        )
      expect(storedSyncContents).toBeDefined()
      expect(storedSyncContents!.length).toBe(0)
    })

    it(`should fail to write a sync message to the database when the user doesn't have permissions on a community`, async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      const sigChain = await testTeamUtils!.createSigchainFromTestTeam(testTeam)
      const payload = generateDataSyncPayload(testTeam)

      const authConnection = new AuthConnection(
        testTeam.testUserContext.user.userId,
        sigChain.sigchain,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- this is ok
        {
          communitiesManager: communitiesManager!,
          socket: wsConfig!.socket as Socket,
        },
      )

      Object.defineProperty(authConnection, '_status', {
        get: jest.fn((): AuthStatus => AuthStatus.REJECTED_OR_CLOSED), // Define a getter that returns your mocked value
        configurable: true, // Allow the property to be redefined later if needed
      })

      communitiesManager!.get = async (
        teamId: string,
        forceFetchFromStorage = false,
        // eslint-disable-next-line @typescript-eslint/require-await -- just matching the real function
      ): Promise<ManagedCommunity> => {
        const authConnections = new Map<string, AuthConnection>()
        authConnections.set(
          testTeam.testUserContext.user.userId,
          authConnection,
        )
        const managedCommunity: ManagedCommunity = {
          teamId,
          sigChain: sigChain.sigchain,
          authConnections,
        }
        return managedCommunity
      }

      let error: Error | undefined = undefined
      let written = false
      try {
        written = await logEntrySyncManager!.processIncomingLogEntrySyncMessage(
          payload,
          wsConfig!.socket,
        )
      } catch (e) {
        error = e as Error
      }

      expect(error).toBeDefined()
      expect(error?.message).toBe(
        'User does not have permissions on this community or has not signed in',
      )
      expect(written).toBe(false)

      const storedSyncContents =
        await dataSyncStorage!.getLogEntriesForCommunity(
          testTeam.team.id,
          payload.encEntry.ts - 10_000,
        )
      expect(storedSyncContents).toBeDefined()
      expect(storedSyncContents!.length).toBe(0)
    })

    it(`should fail to write a sync message to the database when the community isn't stored`, async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      const payload = generateDataSyncPayload(testTeam)

      communitiesManager!.get = async (
        teamId: string,
        forceFetchFromStorage = false,
        // eslint-disable-next-line @typescript-eslint/require-await -- just matching the real function
      ): Promise<ManagedCommunity | undefined> => undefined

      let error: Error | undefined = undefined
      let written = false
      try {
        written = await logEntrySyncManager!.processIncomingLogEntrySyncMessage(
          payload,
          wsConfig!.socket,
        )
      } catch (e) {
        error = e as Error
      }

      expect(error).toBeDefined()
      expect(error?.message).toMatch(
        'No community found for this community ID:',
      )
      expect(written).toBe(false)

      const storedSyncContents =
        await dataSyncStorage!.getLogEntriesForCommunity(
          testTeam.team.id,
          payload.encEntry.ts - 10_000,
        )
      expect(storedSyncContents).toBeDefined()
      expect(storedSyncContents!.length).toBe(0)
    })

    it(`should fail to write a sync message to the database when the user ID on the entry doesn't match the user ID on the signature`, async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      const sigChain = await testTeamUtils!.createSigchainFromTestTeam(testTeam)
      const payload = generateDataSyncPayload(testTeam)
      payload.encEntry.signature.author.name = 'foobar'

      const authConnection = new AuthConnection(
        testTeam.testUserContext.user.userId,
        sigChain.sigchain,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- this is ok
        {
          communitiesManager: communitiesManager!,
          socket: wsConfig!.socket as Socket,
        },
      )

      Object.defineProperty(authConnection, '_status', {
        get: jest.fn((): AuthStatus => AuthStatus.JOINED), // Define a getter that returns your mocked value
        configurable: true, // Allow the property to be redefined later if needed
      })

      communitiesManager!.get = async (
        teamId: string,
        forceFetchFromStorage = false,
        // eslint-disable-next-line @typescript-eslint/require-await -- just matching the real function
      ): Promise<ManagedCommunity> => {
        const authConnections = new Map<string, AuthConnection>()
        authConnections.set(
          testTeam.testUserContext.user.userId,
          authConnection,
        )
        const managedCommunity: ManagedCommunity = {
          teamId,
          sigChain: sigChain.sigchain,
          authConnections,
        }
        return managedCommunity
      }

      let error: Error | undefined = undefined
      let written = false
      try {
        written = await logEntrySyncManager!.processIncomingLogEntrySyncMessage(
          payload,
          wsConfig!.socket,
        )
      } catch (e) {
        error = e as Error
      }

      expect(error).toBeDefined()
      expect(error?.message).toBe(`User ID on entry doesn't match signature`)
      expect(written).toBe(false)

      const storedSyncContents =
        await dataSyncStorage!.getLogEntriesForCommunity(
          testTeam.team.id,
          payload.encEntry.ts - 10_000,
        )
      expect(storedSyncContents).toBeDefined()
      expect(storedSyncContents!.length).toBe(0)
    })
  })

  describe('getPaginatedLogEntries', () => {
    it('paginates large entries and continues with cursor', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      await setupAuth(testTeam, AuthStatus.JOINED)
      const startMs = DateTime.utc().toMillis()
      const entries = await addLogEntries({
        testTeam,
        hashedDbId: 'hashed-db-large',
        startMs,
        count: 3,
        size: 500_000,
        cidPrefix: 'large-entry',
      })

      const basePayload = {
        teamId: testTeam.team.id,
        userId: testTeam.testUserContext.user.userId,
        startTs: startMs - 1000,
      }

      const firstPage = await logEntrySyncManager!.getPaginatedLogEntries(
        basePayload,
        wsConfig!.socket as Socket,
      )
      expect(firstPage.entries).toHaveLength(1)
      expect(firstPage.entries[0]).toEqual(entries[0].entry)
      expect(firstPage.cursor).toBeDefined()
      expect(firstPage.hasNextPage).toBe(true)

      const secondPage = await logEntrySyncManager!.getPaginatedLogEntries(
        { ...basePayload, cursor: firstPage.cursor },
        wsConfig!.socket as Socket,
      )
      expect(secondPage.entries).toHaveLength(1)
      expect(secondPage.entries[0]).toEqual(entries[1].entry)
      expect(secondPage.cursor).toBeDefined()
      expect(secondPage.hasNextPage).toBe(true)

      const thirdPage = await logEntrySyncManager!.getPaginatedLogEntries(
        { ...basePayload, cursor: secondPage.cursor },
        wsConfig!.socket as Socket,
      )
      expect(thirdPage.entries).toHaveLength(1)
      expect(thirdPage.entries[0]).toEqual(entries[2].entry)
      expect(thirdPage.hasNextPage).toBe(false)
    })

    it('filters entries by time range', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      await setupAuth(testTeam, AuthStatus.JOINED)
      const startMs = DateTime.utc().toMillis()
      const entries = await addLogEntries({
        testTeam,
        hashedDbId: 'hashed-db-time',
        startMs,
        count: 3,
        cidPrefix: 'time-entry',
      })

      const result = await logEntrySyncManager!.getPaginatedLogEntries(
        {
          teamId: testTeam.team.id,
          userId: testTeam.testUserContext.user.userId,
          startTs: startMs + 500,
          endTs: startMs + 1500,
        },
        wsConfig!.socket as Socket,
      )

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]).toEqual(entries[1].entry)
      expect(result.hasNextPage).toBe(false)
    })

    it('filters entries by hashedDbId', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      await setupAuth(testTeam, AuthStatus.JOINED)
      const startMs = DateTime.utc().toMillis()
      const hashedEntries = await addLogEntries({
        testTeam,
        hashedDbId: 'hashed-db-a',
        startMs,
        count: 2,
        cidPrefix: 'hash-db-a',
      })
      await addLogEntries({
        testTeam,
        hashedDbId: 'hashed-db-b',
        startMs: startMs + 5000,
        count: 1,
        cidPrefix: 'hash-db-b',
      })

      const result = await logEntrySyncManager!.getPaginatedLogEntries(
        {
          teamId: testTeam.team.id,
          userId: testTeam.testUserContext.user.userId,
          startTs: startMs,
          hashedDbId: 'hashed-db-a',
        },
        wsConfig!.socket as Socket,
      )

      expect(result.entries).toHaveLength(2)
      expect(result.entries[0]).toEqual(hashedEntries[0].entry)
      expect(result.entries[1]).toEqual(hashedEntries[1].entry)
    })

    it('fetches a single entry by hash', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      await setupAuth(testTeam, AuthStatus.JOINED)
      const startMs = DateTime.utc().toMillis()
      const entries = await addLogEntries({
        testTeam,
        hashedDbId: 'hashed-db-single',
        startMs,
        count: 3,
        cidPrefix: 'single-hash',
      })

      const result = await logEntrySyncManager!.getPaginatedLogEntries(
        {
          teamId: testTeam.team.id,
          userId: testTeam.testUserContext.user.userId,
          startTs: startMs,
          hash: entries[1].cid,
        },
        wsConfig!.socket as Socket,
      )

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]).toEqual(entries[1].entry)
      expect(result.hasNextPage).toBe(false)
    })

    it('returns up to the requested limit from a single page', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      await setupAuth(testTeam, AuthStatus.JOINED)
      const startMs = DateTime.utc().toMillis()
      const entries = await addLogEntries({
        testTeam,
        hashedDbId: 'hashed-db-limit',
        startMs,
        count: 3,
        cidPrefix: 'limit-entry',
      })

      const result = await logEntrySyncManager!.getPaginatedLogEntries(
        {
          teamId: testTeam.team.id,
          userId: testTeam.testUserContext.user.userId,
          startTs: startMs,
          limit: 2,
        },
        wsConfig!.socket as Socket,
      )

      expect(result.entries).toHaveLength(2)
      expect(result.entries[0]).toEqual(entries[0].entry)
      expect(result.entries[1]).toEqual(entries[1].entry)
      expect(result.hasNextPage).toBe(true)
    })

    it('saturates a given socket message with max size', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      await setupAuth(testTeam, AuthStatus.JOINED)
      const startMs = DateTime.utc().toMillis()
      // add enough entries to exceed max socket size of 1MB
      const entries = await addLogEntries({
        testTeam,
        hashedDbId: 'hashed-db-saturate',
        startMs,
        count: 100,
        size: 20_000,
        cidPrefix: 'saturate-entry',
      })
      const result = await logEntrySyncManager!.getPaginatedLogEntries(
        {
          teamId: testTeam.team.id,
          userId: testTeam.testUserContext.user.userId,
          startTs: startMs,
        },
        wsConfig!.socket as Socket,
      )
      expect(result.entries.length).toBeLessThan(entries.length)
      expect(result.hasNextPage).toBe(true)
      // verify that the total size is less than or equal to MAX_SOCKET_MESSAGE_SIZE
      const totalSize = result.entries.reduce(
        (acc, entry) => acc + entry.length,
        0,
      )
      logger.info(`Total size of entries sent: ${totalSize} bytes`)
      expect(totalSize).toBeLessThanOrEqual(1000 * 1000)
    })
  })
})
