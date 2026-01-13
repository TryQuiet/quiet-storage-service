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
  type Community,
  type CreatedCommunity,
} from './types.js'

import * as uint8arrays from 'uint8arrays'
import type { CommunitiesHandlerConfig } from '../websocket/handlers/types/common.types.js'
import _ from 'lodash'
import { StoredKeyRingType } from '../encryption/types.js'
import { CommunitiesStorageService } from './storage/communities.storage.service.js'
import type { KeysetWithSecrets } from '@localfirst/crdx'
import type { CompoundError } from '../utils/errors.js'
import { RedisClient } from '../storage/redis/redis.client.js'
import { LogEntrySyncStorageService } from './storage/log-entry-sync.storage.service.js'
import { UtilsModule } from '../utils/utils.module.js'
import type { QuietSocket } from '../websocket/ws.types.js'

describe('CommunitiesManagerService', () => {
  let module: TestingModule | undefined = undefined
  let manager: CommunitiesManagerService | undefined = undefined
  let testTeamUtils: TeamTestUtils | undefined = undefined
  let serverKeyManager: ServerKeyManagerService | undefined = undefined
  let storage: CommunitiesStorageService | undefined = undefined
  let dataSyncStorage: LogEntrySyncStorageService | undefined = undefined
  let redis: RedisClient | undefined = undefined
  let wsConfig: CommunitiesHandlerConfig | undefined = undefined
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

    manager = module.get<CommunitiesManagerService>(CommunitiesManagerService)
    serverKeyManager = module.get<ServerKeyManagerService>(
      ServerKeyManagerService,
    )
    storage = module.get<CommunitiesStorageService>(CommunitiesStorageService)
    dataSyncStorage = module.get<LogEntrySyncStorageService>(
      LogEntrySyncStorageService,
    )
    redis = module.get<RedisClient>(RedisClient)
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
      communitiesManager: manager,
      storage,
      dataSyncStorage,
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
})
