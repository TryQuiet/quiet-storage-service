import { jest } from '@jest/globals'
import { Test } from '@nestjs/testing'
import { TestUtils } from '../../utils/test.utils.js'
import { TestSockets } from '../../utils/types.js'
import { WebsocketEvents } from '../../../src/nest/websocket/ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../../src/nest/app/logger/logger.js'
import { AppModule } from '../../../src/nest/app/app.module.js'
import { CommunitiesManagerService } from '../../../src/nest/communities/communities-manager.service.js'
import {
  GeneratePublicKeysMessage,
  GeneratePublicKeysResponse,
} from '../../../src/nest/communities/websocket/types/gen-pub-keys.types.js'
import {
  createDevice,
  createTeam,
  createUser,
  DeviceWithSecrets,
  LocalUserContext,
  Server,
  Team,
  UserWithSecrets,
} from '@localfirst/auth'
import { Community } from '../../../src/nest/communities/types.js'
import { SodiumHelper } from '../../../src/nest/encryption/sodium.helper.js'
import * as uint8arrays from 'uint8arrays'
import { Keyset } from '@localfirst/crdx'
import { CommunityOperationStatus } from '../../../src/nest/communities/websocket/types/common.types.js'
import {
  CreateCommunity,
  CreateCommunityResponse,
  CreateCommunityStatus,
} from '../../../src/nest/communities/websocket/types/create-community.types.js'
import { CommunitiesStorageService } from '../../../src/nest/communities/storage/communities.storage.service.js'

describe('Communities', () => {
  let sockets: TestSockets
  let communitiesManagerService: CommunitiesManagerService
  let sodiumHelper: SodiumHelper
  let storage: CommunitiesStorageService
  let community: Community
  let team: Team
  let clientContext: LocalUserContext
  let serverKeys: Keyset | undefined = undefined

  const TEAM_NAME = 'test-team-name'
  const USER_NAME = 'testuser'
  const DEVICE_NAME = 'testdevice'
  const SERVER_NAME = 'localhost'

  const logger = createLogger('E2E:Websocket:Communities:Complete')

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    await TestUtils.startServer(testingModule)
    communitiesManagerService = testingModule.get<CommunitiesManagerService>(
      CommunitiesManagerService,
    )
    sodiumHelper = testingModule.get<SodiumHelper>(SodiumHelper)
    storage = testingModule.get<CommunitiesStorageService>(
      CommunitiesStorageService,
    )
  })

  afterAll(async () => {
    // each test need to release the connection for next
    await TestUtils.close()
  })

  describe('Startup', () => {
    it('connect client', async () => {
      sockets = await TestUtils.connectClient()
      expect(TestUtils.getOpenConnectionCount()).toBe(1)
    })
  })

  describe('Add a community to QSS', () => {
    it('should create a new LFA team locally', async () => {
      const user: UserWithSecrets = createUser(USER_NAME)
      const device: DeviceWithSecrets = createDevice({
        userId: user.userId,
        deviceName: DEVICE_NAME,
      })
      clientContext = {
        user,
        device,
      }
      team = createTeam(TEAM_NAME, clientContext)
    })

    it('should validate that the context and team are defined', () => {
      expect(team).toBeDefined()
      expect(clientContext).toBeDefined()
    })

    it('should get public keys from server', async () => {
      const message: GeneratePublicKeysMessage = {
        ts: DateTime.utc().toMillis(),
        payload: {
          teamId: team.id,
        },
      }
      const response =
        await TestUtils.client.sendMessage<GeneratePublicKeysResponse>(
          WebsocketEvents.GeneratePublicKeys,
          message,
          true,
        )
      serverKeys = response?.payload.payload?.keys
      expect(response).toEqual(
        expect.objectContaining({
          ts: expect.any(Number),
          payload: {
            status: CommunityOperationStatus.SUCCESS,
            payload: {
              teamId: team.id,
              keys: expect.objectContaining({
                type: 'SERVER',
                name: SERVER_NAME,
                signature: expect.any(String),
                encryption: expect.any(String),
                generation: 0,
              }),
            },
          },
        }),
      )
    })

    it('should validate that the server keys are defined', () => {
      expect(serverKeys).toBeDefined()
    })

    it('should add the server to the team', () => {
      const server: Server = {
        host: SERVER_NAME,
        keys: serverKeys!,
      }
      team.addServer(server)
      community = {
        teamId: team.id,
        sigChain: uint8arrays.toString(team.save(), 'hex'),
      }
    })

    it('should validate that the community is defined', () => {
      expect(community).toBeDefined()
    })

    it('should add the community on qss', async () => {
      const message: CreateCommunity = {
        ts: DateTime.utc().toMillis(),
        payload: {
          userId: clientContext.user.userId,
          community,
          teamKeyring: uint8arrays.toString(
            uint8arrays.fromString(JSON.stringify(team.teamKeyring()), 'utf8'),
            'base64',
          ),
        },
      }

      const response =
        await TestUtils.client.sendMessage<CreateCommunityResponse>(
          WebsocketEvents.CreateCommunity,
          message,
          true,
        )
      expect(response).toEqual(
        expect.objectContaining({
          ts: expect.any(Number),
          payload: {
            status: CreateCommunityStatus.SUCCESS,
          },
        } as CreateCommunityResponse),
      )
    })

    it('should validate that the community exists on qss', async () => {
      const managedCommunity = await communitiesManagerService.get(team.id)
      expect(managedCommunity).toBeDefined()
      expect(managedCommunity!.authConnections).toBeDefined()
      expect(
        managedCommunity!.authConnections?.get(clientContext.user.userId),
      ).toBeDefined()
      expect(managedCommunity!.teamId).toBe(team.id)
    })
  })
})
