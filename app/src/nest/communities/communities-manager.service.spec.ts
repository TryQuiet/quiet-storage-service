/* eslint-disable max-lines -- there's a lot to test here */
import { jest } from '@jest/globals'
import { Test, type TestingModule } from '@nestjs/testing'
import { CommunitiesManagerService } from './communities-manager.service.js'
import { StorageModule } from '../storage/storage.module.js'
import { CommunitiesModule } from './communities.module.js'
import { EncryptionModule } from '../encryption/enc.module.js'
import { TeamTestUtils } from '../../../test/utils/team.utils.js'
import { ServerKeyManagerService } from '../encryption/server-key-manager.service.js'
import {
  AllowedServerKeyState,
  EncryptionScopeType,
  type ManagedCommunity,
  type Community,
  type CreatedCommunity,
  type EncryptedAndSignedPayload,
} from './types.js'

import * as uint8arrays from 'uint8arrays'
import type { CommunitiesHandlerConfig } from './websocket/types/common.types.js'
import _ from 'lodash'
import { StoredKeyRingType } from '../encryption/types.js'
import { CommunitiesStorageService } from './storage/communities.storage.service.js'
// @ts-expect-error -- no types
import MockedSocket from 'socket.io-mock'
import type { Socket } from 'socket.io'
import type { KeysetWithSecrets } from '@localfirst/crdx'
import type { CompoundError } from '../utils/errors.js'
import { RedisClient } from '../storage/redis/redis.client.js'
import { LogEntrySyncStorageService } from './storage/log-entry-sync.storage.service.js'
import type { LogEntrySyncPayload } from './websocket/types/log-entry-sync.types.js'
import type { TestTeam } from '../../../test/utils/types.js'
import { DateTime } from 'luxon'
import { SodiumHelper } from '../encryption/sodium.helper.js'
import { AuthStatus } from './auth/types.js'
import { AuthConnection } from './auth/auth.connection.js'
import { UtilsModule } from '../utils/utils.module.js'
import type { Serializer } from '../utils/serialization/serializer.service.js'
import { SERIALIZER } from '../app/const.js'
import type { QuietSocket } from '../websocket/ws.types.js'
import { createLogger } from '../app/logger/logger.js'

const logger = createLogger('Test:CommunitiesManagerService')

describe('CommunitiesManagerService', () => {
  let module: TestingModule | undefined = undefined
  let manager: CommunitiesManagerService | undefined = undefined
  let testTeamUtils: TeamTestUtils | undefined = undefined
  let serverKeyManager: ServerKeyManagerService | undefined = undefined
  let storage: CommunitiesStorageService | undefined = undefined
  let dataSyncStorage: LogEntrySyncStorageService | undefined = undefined
  let redis: RedisClient | undefined = undefined
  let sodiumHelper: SodiumHelper | undefined = undefined
  let serializer: Serializer | undefined = undefined
  let wsConfig: CommunitiesHandlerConfig | undefined = undefined

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

    manager = module.get<CommunitiesManagerService>(CommunitiesManagerService)
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
    wsConfig = {
      communitiesManager: manager,
      storage,
      dataSyncStorage,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- this is ok
      socket: new MockedSocket() as QuietSocket,
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

  it('should be defined', () => {
    expect(module).toBeDefined()
    expect(manager).toBeDefined()
    expect(testTeamUtils).toBeDefined()
    expect(serverKeyManager).toBeDefined()
  })

  describe('create', () => {
    it('should create a new managed community', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      const serializedTeamKeyring = uint8arrays.fromString(
        JSON.stringify(testTeam.team.teamKeyring()),
        'utf8',
      )
      const serializedServerKeyring = uint8arrays.fromString(
        JSON.stringify(testTeam.serverKeys),
        'utf8',
      )
      await serverKeyManager!.storeKeyring(
        testTeam.team.id,
        serializedServerKeyring,
        StoredKeyRingType.SERVER_KEYRING,
      )
      const community: Community = {
        teamId: testTeam.team.id,
        sigChain: uint8arrays.toString(testTeam.team.save(), 'hex'),
      }
      const b64Keyring = uint8arrays.toString(serializedTeamKeyring, 'base64')
      const createdCommunity = await manager!.create(
        testTeam.testUserContext.user.userId,
        community,
        b64Keyring,
        wsConfig!.socket,
      )
      expect(_.isEqual(createdCommunity.community, community)).toBe(true)
    })

    it('should fail to create a new managed community when server keys are not stored', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      const serializedTeamKeyring = uint8arrays.fromString(
        JSON.stringify(testTeam.team.teamKeyring()),
        'utf8',
      )
      const community: Community = {
        teamId: testTeam.team.id,
        sigChain: uint8arrays.toString(testTeam.team.save(), 'hex'),
      }
      const b64Keyring = uint8arrays.toString(serializedTeamKeyring, 'base64')
      let createdCommunity: CreatedCommunity | undefined = undefined
      let error: Error | undefined = undefined
      try {
        createdCommunity = await manager!.create(
          testTeam.testUserContext.user.userId,
          community,
          b64Keyring,
          wsConfig!.socket,
        )
      } catch (e) {
        error = e as Error
      }
      expect(createdCommunity).toBeUndefined()
      expect(error).toBeDefined()
      expect(error?.message).toBe('Error while creating community')
      expect(
        (
          error as CompoundError<Error> | undefined
        )?.original?.message.startsWith(
          'Keys for this team were not stored locally',
        ),
      ).toBe(true)
    })

    it('should fail to create a new managed community when team is not in hex', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      const serializedTeamKeyring = uint8arrays.fromString(
        JSON.stringify(testTeam.team.teamKeyring()),
        'utf8',
      )
      const serializedServerKeyring = uint8arrays.fromString(
        JSON.stringify(testTeam.serverKeys),
        'utf8',
      )
      await serverKeyManager!.storeKeyring(
        testTeam.team.id,
        serializedServerKeyring,
        StoredKeyRingType.SERVER_KEYRING,
      )
      const community: Community = {
        teamId: testTeam.team.id,
        sigChain: uint8arrays.toString(testTeam.team.save(), 'base64'),
      }
      const b64Keyring = uint8arrays.toString(serializedTeamKeyring, 'base64')
      let createdCommunity: CreatedCommunity | undefined = undefined
      let error: Error | undefined = undefined
      try {
        createdCommunity = await manager!.create(
          testTeam.testUserContext.user.userId,
          community,
          b64Keyring,
          wsConfig!.socket,
        )
      } catch (e) {
        error = e as Error
      }
      expect(createdCommunity).toBeUndefined()
      expect(error).toBeDefined()
      expect(error?.message).toBe('Error while creating community')
      expect(
        (error as CompoundError<Error> | undefined)?.original?.message,
      ).toBe('Non-base16 character')
    })

    it('should fail to create a new managed community when team keyring is not in base64', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      const serializedTeamKeyring = uint8arrays.fromString(
        JSON.stringify(testTeam.team.teamKeyring()),
        'utf8',
      )
      const serializedServerKeyring = uint8arrays.fromString(
        JSON.stringify(testTeam.serverKeys),
        'utf8',
      )
      await serverKeyManager!.storeKeyring(
        testTeam.team.id,
        serializedServerKeyring,
        StoredKeyRingType.SERVER_KEYRING,
      )
      const community: Community = {
        teamId: testTeam.team.id,
        sigChain: uint8arrays.toString(testTeam.team.save(), 'hex'),
      }
      const invalidKeyring = uint8arrays.toString(serializedTeamKeyring, 'hex')
      let createdCommunity: CreatedCommunity | undefined = undefined
      let error: Error | undefined = undefined
      try {
        createdCommunity = await manager!.create(
          testTeam.testUserContext.user.userId,
          community,
          invalidKeyring,
          wsConfig!.socket,
        )
      } catch (e) {
        error = e as Error
      }
      expect(createdCommunity).toBeUndefined()
      expect(error).toBeDefined()
      expect(error?.message).toBe('Error while creating community')
      expect(
        (error as CompoundError<Error> | undefined)?.original?.message.match(
          /\bUnexpected end of data\b|\bUnexpected token\b.*/,
        ),
      ).toBeDefined()
    })

    it('should fail to create a new managed community sigchain has more than 1 user', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      await testTeamUtils?.addUserToTeam(testTeam, 'second-user')
      const serializedTeamKeyring = uint8arrays.fromString(
        JSON.stringify(testTeam.team.teamKeyring()),
        'utf8',
      )
      const serializedServerKeyring = uint8arrays.fromString(
        JSON.stringify(testTeam.serverKeys),
        'utf8',
      )

      await serverKeyManager!.storeKeyring(
        testTeam.team.id,
        serializedServerKeyring,
        StoredKeyRingType.SERVER_KEYRING,
      )
      const community: Community = {
        teamId: testTeam.team.id,
        sigChain: uint8arrays.toString(testTeam.team.save(), 'hex'),
      }
      const b64Keyring = uint8arrays.toString(serializedTeamKeyring, 'base64')
      let createdCommunity: CreatedCommunity | undefined = undefined
      let error: Error | undefined = undefined
      try {
        createdCommunity = await manager!.create(
          testTeam.testUserContext.user.userId,
          community,
          b64Keyring,
          wsConfig!.socket,
        )
      } catch (e) {
        error = e as Error
      }
      expect(createdCommunity).toBeUndefined()
      expect(error).toBeDefined()
      expect(error?.message).toBe('Error while creating community')
      expect(
        (error as CompoundError<Error> | undefined)?.original?.message,
      ).toBe(
        `QSS can't join community with more than 1 user!  Community with team ID ${testTeam.team.id} has 2 users!`,
      )
    })
  })

  describe('getServerKeys', () => {
    it('should create new server keys when no keys are stored', async () => {
      const newKeys = await manager!.getServerKeys(
        'foobar',
        AllowedServerKeyState.NOT_STORED,
      )
      expect(newKeys).toBeDefined()
    })

    it('should create new server keys and fetch from storage', async () => {
      const teamId = 'foobar'
      const newKeys = await manager!.getServerKeys(
        teamId,
        AllowedServerKeyState.NOT_STORED,
      )
      expect(newKeys).toBeDefined()
      const fetchedKeys = await manager!.getServerKeys(
        teamId,
        AllowedServerKeyState.STORED_ONLY,
      )
      expect(_.isEqual(fetchedKeys, newKeys)).toBe(true)
    })

    it('should throw an error when fetching stored server keys when no keys are stored', async () => {
      let fetchedKeys: KeysetWithSecrets | undefined = undefined
      let error: Error | undefined = undefined
      try {
        fetchedKeys = await manager!.getServerKeys(
          'foobar',
          AllowedServerKeyState.STORED_ONLY,
        )
      } catch (e) {
        error = e as Error
      }
      expect(fetchedKeys).toBeUndefined()
      expect(error).toBeDefined()
      expect(
        error?.message.startsWith('Keys for this team were not stored locally'),
      ).toBe(true)
    })

    it('should throw an error when creating new server keys but keys are already stored', async () => {
      const teamId = 'foobar'
      const newKeys = await manager!.getServerKeys(
        teamId,
        AllowedServerKeyState.NOT_STORED,
      )
      expect(newKeys).toBeDefined()
      let fetchedKeys: KeysetWithSecrets | undefined = undefined
      let error: Error | undefined = undefined
      try {
        fetchedKeys = await manager!.getServerKeys(
          teamId,
          AllowedServerKeyState.NOT_STORED,
        )
      } catch (e) {
        error = e as Error
      }
      expect(fetchedKeys).toBeUndefined()
      expect(error).toBeDefined()
      expect(
        error?.message.startsWith('Keys for this team were already stored'),
      ).toBe(true)
    })
  })

  describe('processIncomingSyncMessage', () => {
    const generateDataSyncPayload = (
      testTeam: TestTeam,
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
      return dataSyncPayload
    }

    it('should write a sync message to the database', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      const sigChain = await testTeamUtils!.createSigchainFromTestTeam(testTeam)
      const payload = generateDataSyncPayload(testTeam)

      const authConnection = new AuthConnection(
        testTeam.testUserContext.user.userId,
        sigChain.sigchain,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- this is ok
        { communitiesManager: manager!, socket: new MockedSocket() as Socket },
      )

      Object.defineProperty(authConnection, '_status', {
        get: jest.fn((): AuthStatus => AuthStatus.JOINED), // Define a getter that returns your mocked value
        configurable: true, // Allow the property to be redefined later if needed
      })

      manager!.get = async (
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
        // TOOD: fix the error below. In production, we require the client socket to ensure the connected user has permissions, add the socket reference matching the socket used in the auth connection above
        written = await manager!.processIncomingLogEntrySyncMessage(
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
        { communitiesManager: manager!, socket: new MockedSocket() as Socket },
      )

      Object.defineProperty(authConnection, '_status', {
        get: jest.fn((): AuthStatus => AuthStatus.PENDING), // Define a getter that returns your mocked value
        configurable: true, // Allow the property to be redefined later if needed
      })

      manager!.get = async (
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
        written = await manager!.processIncomingLogEntrySyncMessage(
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
        { communitiesManager: manager!, socket: new MockedSocket() as Socket },
      )

      Object.defineProperty(authConnection, '_status', {
        get: jest.fn((): AuthStatus => AuthStatus.JOINING), // Define a getter that returns your mocked value
        configurable: true, // Allow the property to be redefined later if needed
      })

      manager!.get = async (
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
        written = await manager!.processIncomingLogEntrySyncMessage(
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
        { communitiesManager: manager!, socket: new MockedSocket() as Socket },
      )

      Object.defineProperty(authConnection, '_status', {
        get: jest.fn((): AuthStatus => AuthStatus.REJECTED_OR_CLOSED), // Define a getter that returns your mocked value
        configurable: true, // Allow the property to be redefined later if needed
      })

      manager!.get = async (
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
        written = await manager!.processIncomingLogEntrySyncMessage(
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

      manager!.get = async (
        teamId: string,
        forceFetchFromStorage = false,
        // eslint-disable-next-line @typescript-eslint/require-await -- just matching the real function
      ): Promise<ManagedCommunity | undefined> => undefined

      let error: Error | undefined = undefined
      let written = false
      try {
        written = await manager!.processIncomingLogEntrySyncMessage(
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
        { communitiesManager: manager!, socket: new MockedSocket() as Socket },
      )

      Object.defineProperty(authConnection, '_status', {
        get: jest.fn((): AuthStatus => AuthStatus.JOINED), // Define a getter that returns your mocked value
        configurable: true, // Allow the property to be redefined later if needed
      })

      manager!.get = async (
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
        written = await manager!.processIncomingLogEntrySyncMessage(
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
    const setupAuth = async (testTeam: TestTeam): Promise<void> => {
      const sigChain = await testTeamUtils!.createSigchainFromTestTeam(testTeam)
      const authConnection = new AuthConnection(
        testTeam.team.id,
        sigChain.sigchain,
        {
          communitiesManager: manager!,
          socket: wsConfig!.socket as Socket,
        },
      )

      Object.defineProperty(authConnection, '_status', {
        get: jest.fn((): AuthStatus => AuthStatus.JOINED),
        configurable: true,
      })

      manager!.get = async (
        teamId: string,
        forceFetchFromStorage = false,
        // eslint-disable-next-line @typescript-eslint/require-await -- just matching the real function
      ): Promise<ManagedCommunity> => {
        const authConnections = new Map<string, AuthConnection>()
        authConnections.set(testTeam.team.id, authConnection)
        return {
          teamId,
          sigChain: sigChain.sigchain,
          authConnections,
        }
      }
    }

    const addLogEntries = async (options: {
      teamId: string
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
        teamId,
        hashedDbId,
        startMs,
        count,
        size = 32,
        cidPrefix,
      } = options
      const entries = []
      for (let i = 0; i < count; i += 1) {
        const receivedAtMs = startMs + i * 1000
        const entry = Buffer.alloc(size, i)
        const cid = `${cidPrefix}-${i}`
        await dataSyncStorage!.addLogEntry({
          cid,
          hashedDbId,
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

    it('paginates large entries and continues with cursor', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      await setupAuth(testTeam)
      const startMs = DateTime.utc().toMillis()
      const entries = await addLogEntries({
        teamId: testTeam.team.id,
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

      const firstPage = await manager!.getPaginatedLogEntries(
        basePayload,
        wsConfig!.socket as Socket,
      )
      expect(firstPage.entries).toHaveLength(1)
      expect(firstPage.entries[0]).toEqual(entries[0].entry)
      expect(firstPage.cursor).toBeDefined()
      expect(firstPage.hasNextPage).toBe(true)

      const secondPage = await manager!.getPaginatedLogEntries(
        { ...basePayload, cursor: firstPage.cursor },
        wsConfig!.socket as Socket,
      )
      expect(secondPage.entries).toHaveLength(1)
      expect(secondPage.entries[0]).toEqual(entries[1].entry)
      expect(secondPage.cursor).toBeDefined()
      expect(secondPage.hasNextPage).toBe(true)

      const thirdPage = await manager!.getPaginatedLogEntries(
        { ...basePayload, cursor: secondPage.cursor },
        wsConfig!.socket as Socket,
      )
      expect(thirdPage.entries).toHaveLength(1)
      expect(thirdPage.entries[0]).toEqual(entries[2].entry)
      expect(thirdPage.hasNextPage).toBe(false)
    })

    it('filters entries by time range', async () => {
      const testTeam = await testTeamUtils!.createTestTeam()
      await setupAuth(testTeam)
      const startMs = DateTime.utc().toMillis()
      const entries = await addLogEntries({
        teamId: testTeam.team.id,
        hashedDbId: 'hashed-db-time',
        startMs,
        count: 3,
        cidPrefix: 'time-entry',
      })

      const result = await manager!.getPaginatedLogEntries(
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
      await setupAuth(testTeam)
      const startMs = DateTime.utc().toMillis()
      const hashedEntries = await addLogEntries({
        teamId: testTeam.team.id,
        hashedDbId: 'hashed-db-a',
        startMs,
        count: 2,
        cidPrefix: 'hash-db-a',
      })
      await addLogEntries({
        teamId: testTeam.team.id,
        hashedDbId: 'hashed-db-b',
        startMs: startMs + 5000,
        count: 1,
        cidPrefix: 'hash-db-b',
      })

      const result = await manager!.getPaginatedLogEntries(
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
      await setupAuth(testTeam)
      const startMs = DateTime.utc().toMillis()
      const entries = await addLogEntries({
        teamId: testTeam.team.id,
        hashedDbId: 'hashed-db-single',
        startMs,
        count: 3,
        cidPrefix: 'single-hash',
      })

      const result = await manager!.getPaginatedLogEntries(
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
      await setupAuth(testTeam)
      const startMs = DateTime.utc().toMillis()
      const entries = await addLogEntries({
        teamId: testTeam.team.id,
        hashedDbId: 'hashed-db-limit',
        startMs,
        count: 3,
        cidPrefix: 'limit-entry',
      })

      const result = await manager!.getPaginatedLogEntries(
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
      await setupAuth(testTeam)
      const startMs = DateTime.utc().toMillis()
      // add enough entries to exceed max socket size of 1MB
      const entries = await addLogEntries({
        teamId: testTeam.team.id,
        hashedDbId: 'hashed-db-saturate',
        startMs,
        count: 100,
        size: 20_000,
        cidPrefix: 'saturate-entry',
      })
      const result = await manager!.getPaginatedLogEntries(
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
