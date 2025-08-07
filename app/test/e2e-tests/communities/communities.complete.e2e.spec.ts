import { jest } from '@jest/globals'
import { Test } from '@nestjs/testing'
import { TestUtils } from '../../utils/test.utils.js'
import { TeamTestUtils } from '../../utils/team.utils.js'
import { TestClient, TestTeam } from '../../utils/types.js'
import { WebsocketEvents } from '../../../src/nest/websocket/ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../../src/nest/app/logger/logger.js'
import { AppModule } from '../../../src/nest/app/app.module.js'
import { CommunitiesManagerService } from '../../../src/nest/communities/communities-manager.service.js'
import { GeneratePublicKeysMessage } from '../../../src/nest/communities/websocket/types/gen-pub-keys.types.js'
import {
  createDevice,
  createUser,
  DeviceWithSecrets,
  generateProof,
  InviteeMemberContext,
  InviteResult,
  LocalUserContext,
  Server,
} from '@localfirst/auth'
import { Community } from '../../../src/nest/communities/types.js'
import { SodiumHelper } from '../../../src/nest/encryption/sodium.helper.js'
import * as uint8arrays from 'uint8arrays'
import { Keyset, redactUser } from '@localfirst/crdx'
import { CommunityOperationStatus } from '../../../src/nest/communities/websocket/types/common.types.js'
import {
  CreateCommunity,
  CreateCommunityResponse,
  CreateCommunityStatus,
} from '../../../src/nest/communities/websocket/types/create-community.types.js'
import { CommunitiesStorageService } from '../../../src/nest/communities/storage/communities.storage.service.js'
import { CommunitySignInMessage } from '../../../src/nest/communities/websocket/types/community-sign-in.types.js'
import waitForExpect from 'wait-for-expect'
import { QSSClientAuthConnection } from '../../../src/client/client-auth-conn.js'
import { ClientEvents } from '../../../src/client/ws.client.events.js'
import { ServerKeyManagerService } from '../../../src/nest/encryption/server-key-manager.service.js'

describe('Communities', () => {
  let testClient: TestClient
  let secondTestClient: TestClient
  let invalidTestClient: TestClient
  let authConnection: QSSClientAuthConnection
  let secondAuthConnection: QSSClientAuthConnection
  let invalidAuthConnection: QSSClientAuthConnection
  let clientContext: LocalUserContext
  let secondClientContext: LocalUserContext
  let invalidClientContext: LocalUserContext
  let invite: InviteResult

  let communitiesManagerService: CommunitiesManagerService
  let sodiumHelper: SodiumHelper
  let storage: CommunitiesStorageService
  let community: Community
  let testTeam: TestTeam
  let serverKeys: Keyset | undefined = undefined
  let teamTestUtils: TeamTestUtils

  const TEAM_NAME = 'test-team-name'
  const USER_NAME = 'testuser'
  const DEVICE_NAME = 'testdevice'
  const SECOND_USER_NAME = 'secondtestuser'
  const SECOND_DEVICE_NAME = 'secondtestdevice'
  const INVALID_USER_NAME = 'invaliduser'
  const INVALID_DEVICE_NAME = 'invaliddevice'
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
    teamTestUtils = new TeamTestUtils(
      testingModule.get<ServerKeyManagerService>(ServerKeyManagerService),
    )
  })

  afterAll(async () => {
    // each test need to release the connection for next
    await TestUtils.close()
  })

  describe('Startup', () => {
    it('connect client', async () => {
      testClient = await TestUtils.connectClient(USER_NAME)
      expect(TestUtils.getOpenConnectionCount()).toBe(1)
    })
  })

  describe('Add a community to QSS', () => {
    it('should create a new LFA team locally', async () => {
      testTeam = await teamTestUtils.createTestTeam(
        false,
        TEAM_NAME,
        SERVER_NAME,
        USER_NAME,
        DEVICE_NAME,
      )
    })

    it('should validate that the context and team are defined', () => {
      expect(testTeam).toBeDefined()
      expect(testTeam.team).toBeDefined()
      expect(testTeam.testUserContext).toBeDefined()
      expect(testTeam.server).toBeUndefined()
      expect(testTeam.serverKeys).toBeUndefined()
    })

    it('should get public keys from server', async () => {
      const message: GeneratePublicKeysMessage = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SENDING,
        payload: {
          teamId: testTeam.team.id,
        },
      }
      const response =
        await testClient.client.sendMessage<GeneratePublicKeysMessage>(
          WebsocketEvents.GeneratePublicKeys,
          message,
          true,
        )
      serverKeys = response?.payload?.keys
      expect(response).toEqual(
        expect.objectContaining({
          ts: expect.any(Number),
          status: CommunityOperationStatus.SUCCESS,
          payload: {
            teamId: testTeam.team.id,
            keys: expect.objectContaining({
              type: 'SERVER',
              name: SERVER_NAME,
              signature: expect.any(String),
              encryption: expect.any(String),
              generation: 0,
            }),
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
      testTeam.team.addServer(server)
      testTeam.server = server
      community = {
        teamId: testTeam.team.id,
        sigChain: uint8arrays.toString(testTeam.team.save(), 'hex'),
      }
    })

    it('should validate that the community is defined', () => {
      expect(community).toBeDefined()
    })

    it('should add the community on qss', async () => {
      const message: CreateCommunity = {
        ts: DateTime.utc().toMillis(),
        payload: {
          userId: testTeam.testUserContext.user.userId,
          community,
          teamKeyring: uint8arrays.toString(
            uint8arrays.fromString(
              JSON.stringify(testTeam.team.teamKeyring()),
              'utf8',
            ),
            'base64',
          ),
        },
      }

      const response =
        await testClient.client.sendMessage<CreateCommunityResponse>(
          WebsocketEvents.CreateCommunity,
          message,
          true,
        )
      expect(response).toEqual(
        expect.objectContaining({
          ts: expect.any(Number),
          status: CreateCommunityStatus.SUCCESS,
        } as CreateCommunityResponse),
      )
    })

    it('should validate that the community exists on qss', async () => {
      const managedCommunity = await communitiesManagerService.get(
        testTeam.team.id,
      )
      expect(managedCommunity).toBeDefined()
      expect(managedCommunity!.authConnections).toBeDefined()
      expect(
        managedCommunity!.authConnections?.get(
          testTeam.testUserContext.user.userId,
        ),
      ).toBeDefined()
      expect(managedCommunity!.teamId).toBe(testTeam.team.id)
    })

    it('should start an auth connection with QSS and successfully authorize', async () => {
      testClient.authConnection = await TestUtils.startAuthConnection(
        testTeam.team.id,
        { ...testTeam.testUserContext, team: testTeam.team },
      )
      let authorized: boolean = false
      testClient.authConnection.on(ClientEvents.AuthJoined, () => {
        authorized = true
      })
      await waitForExpect(() => expect(authorized).toBe(true), 30_000)
    })
  })

  describe('Sign into community', () => {
    it('connect client', async () => {
      secondTestClient = await TestUtils.connectClient(SECOND_USER_NAME)
      expect(TestUtils.getOpenConnectionCount()).toBe(2)
    })

    it('should sign into the community as a new user', async () => {
      invite = testTeam.team.inviteMember()
      const prospectiveUser = createUser(SECOND_USER_NAME)
      const prospectiveDevice: DeviceWithSecrets = createDevice({
        userId: prospectiveUser.userId,
        deviceName: SECOND_DEVICE_NAME,
      })
      const inviteProof = generateProof(invite.seed)
      secondClientContext = {
        user: prospectiveUser,
        device: prospectiveDevice,
        invitationSeed: invite.seed,
      } as InviteeMemberContext

      const message: CommunitySignInMessage = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SENDING,
        payload: {
          userId: secondClientContext.user.userId,
          teamId: testTeam.team.id,
        },
      }

      const response =
        await secondTestClient.client.sendMessage<CommunitySignInMessage>(
          WebsocketEvents.SignInCommunity,
          message,
          true,
        )
      expect(response).toEqual(
        expect.objectContaining({
          ts: expect.any(Number),
          status: CommunityOperationStatus.SUCCESS,
        } as CommunitySignInMessage),
      )
    })

    it('should validate that the community has been updated with second user', async () => {
      const managedCommunity = await communitiesManagerService.get(
        testTeam.team.id,
      )
      expect(managedCommunity).toBeDefined()
      expect(managedCommunity!.authConnections).toBeDefined()
      expect(managedCommunity!.authConnections!.size).toBe(2)
      expect(
        managedCommunity!.authConnections!.get(secondClientContext.user.userId),
      ).toBeDefined()
      expect(managedCommunity!.teamId).toBe(testTeam.team.id)
      expect(managedCommunity!.expiryMs).toBeUndefined()
    })

    it('should start an auth connection with QSS and successfully authorize the second user', async () => {
      secondTestClient.authConnection = await TestUtils.startAuthConnection(
        testTeam.team.id,
        { ...secondClientContext, invitationSeed: invite.seed },
      )
      let authorized: boolean = false
      secondTestClient.authConnection.on(ClientEvents.AuthJoined, () => {
        authorized = true
      })
      await waitForExpect(() => expect(authorized).toBe(true), 30_000)
    })

    it('should validate that the sigchain is updated for QSS and the original user', async () => {
      await waitForExpect(async () => {
        const managedCommunity = await communitiesManagerService.get(
          testTeam.team.id,
        )
        expect(managedCommunity).toBeDefined()
        expect(
          managedCommunity!.sigChain.team.memberByDeviceId(
            secondClientContext.device.deviceId,
          ),
        ).toBeDefined()
        expect(
          testTeam.team.memberByDeviceId(secondClientContext.device.deviceId),
        ).toBeDefined()
      }, 15_000)
    })
  })

  describe('Invalid Sign In Attempt', () => {
    it('should try to sign in with invalid user', async () => {
      const invalidUser = createUser(INVALID_USER_NAME)
      const invalidDevice: DeviceWithSecrets = createDevice({
        userId: invalidUser.userId,
        deviceName: INVALID_DEVICE_NAME,
      })
      invalidClientContext = {
        user: invalidUser,
        device: invalidDevice,
      } as LocalUserContext

      const message: CommunitySignInMessage = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SENDING,
        payload: {
          userId: invalidClientContext.user.userId,
          teamId: testTeam.team.id,
        },
      }

      invalidTestClient = await TestUtils.connectClient(INVALID_USER_NAME)
      const response =
        await invalidTestClient.client.sendMessage<CommunitySignInMessage>(
          WebsocketEvents.SignInCommunity,
          message,
          true,
        )
      expect(response).toEqual(
        expect.objectContaining({
          ts: expect.any(Number),
          status: CommunityOperationStatus.SUCCESS,
        } as CommunitySignInMessage),
      )
    })

    it('should validate that the community has been (temporarily) updated with invalid user', async () => {
      const managedCommunity = await communitiesManagerService.get(
        testTeam.team.id,
      )
      expect(managedCommunity).toBeDefined()
      expect(managedCommunity!.authConnections).toBeDefined()
      expect(managedCommunity!.authConnections!.size).toBe(3)
      expect(
        managedCommunity!.authConnections!.get(
          invalidClientContext.user.userId,
        ),
      ).toBeDefined()
      expect(managedCommunity!.teamId).toBe(testTeam.team.id)
      expect(managedCommunity!.expiryMs).toBeUndefined()
    })

    it('should start an auth connection with QSS and fail to authorize the invalid user', async () => {
      secondTestClient.authConnection = await TestUtils.startAuthConnection(
        testTeam.team.id,
        { ...invalidClientContext, invitationSeed: 'foobar' },
      )
      let authorized: boolean = false
      let disconnected: boolean = false
      secondTestClient.authConnection.on(ClientEvents.AuthJoined, () => {
        authorized = true
      })
      secondTestClient.authConnection.on(ClientEvents.AuthDisconnected, () => {
        disconnected = true
      })
      await waitForExpect(() => expect(disconnected).toBe(true), 30_000)
      expect(authorized).toBe(false)
    })

    it(`should validate that the invalid client's auth connection should be closed and removed from QSS`, async () => {
      await waitForExpect(async () => {
        const managedCommunity = await communitiesManagerService.get(
          testTeam.team.id,
        )
        expect(managedCommunity).toBeDefined()
        expect(managedCommunity!.authConnections).toBeDefined()
        expect(managedCommunity!.authConnections!.size).toBe(2)
        expect(
          managedCommunity!.authConnections!.has(
            invalidClientContext.user.userId,
          ),
        ).toBe(false)
      }, 15_000)
    })

    it('should validate that the sigchains on QSS and the original client do not include the invalid user', async () => {
      const managedCommunity = await communitiesManagerService.get(
        testTeam.team.id,
      )
      expect(managedCommunity).toBeDefined()
      expect(() =>
        managedCommunity!.sigChain.team.memberByDeviceId(
          invalidClientContext.device.deviceId,
        ),
      ).toThrow()
      expect(() =>
        testTeam.team.memberByDeviceId(invalidClientContext.device.deviceId),
      ).toThrow()
    })
  })
})
