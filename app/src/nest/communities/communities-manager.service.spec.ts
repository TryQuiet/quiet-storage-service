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
import type { CommunitiesHandlerOptions } from './websocket/types/common.types.js'
import _ from 'lodash'
import { StoredKeyRingType } from '../encryption/types.js'
import { CommunitiesStorageService } from './storage/communities.storage.service.js'
// @ts-expect-error -- no types
import MockedSocket from 'socket.io-mock'
import type { Socket } from 'socket.io'
import type { KeysetWithSecrets } from '@localfirst/crdx'
import type { CompoundError } from '../types.js'
import { RedisClient } from '../storage/redis/redis.client.js'

describe('CommunitiesManagerService', () => {
  let module: TestingModule | undefined = undefined
  let manager: CommunitiesManagerService | undefined = undefined
  let testTeamUtils: TeamTestUtils | undefined = undefined
  let serverKeyManager: ServerKeyManagerService | undefined = undefined
  let storage: CommunitiesStorageService | undefined = undefined
  let redis: RedisClient | undefined = undefined
  let wsOptions: CommunitiesHandlerOptions | undefined = undefined

  beforeEach(async () => {
    jest.mock('../src/nest/communities/auth/auth.connection.js')
    module = await Test.createTestingModule({
      imports: [StorageModule, CommunitiesModule, EncryptionModule],
    }).compile()
    await module.init()

    manager = module.get<CommunitiesManagerService>(CommunitiesManagerService)
    serverKeyManager = module.get<ServerKeyManagerService>(
      ServerKeyManagerService,
    )
    storage = module.get<CommunitiesStorageService>(CommunitiesStorageService)
    redis = module.get<RedisClient>(RedisClient)
    testTeamUtils = new TeamTestUtils(serverKeyManager)
    wsOptions = {
      communitiesManager: manager,
      storage,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- this is ok
      socket: new MockedSocket() as Socket,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- this doesn't get used anywhere in this code
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
        wsOptions!,
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
          wsOptions!,
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
          wsOptions!,
        )
      } catch (e) {
        error = e as Error
      }
      expect(createdCommunity).toBeUndefined()
      expect(error).toBeDefined()
      expect(error?.message).toBe('Error while creating community')
      expect(
        (error as CompoundError<Error> | undefined)?.original?.message,
      ).toBe('Failed to store community!')
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
          wsOptions!,
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
