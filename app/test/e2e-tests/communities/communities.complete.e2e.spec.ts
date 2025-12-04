/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- I don't have time to fix these rn*/
/* eslint-disable @typescript-eslint/no-unsafe-member-access -- I don't have time to fix these rn */
/* eslint-disable @typescript-eslint/no-unsafe-argument -- I don't have time to fix these rn*/
import { Test, type TestingModule } from '@nestjs/testing'
import { TestUtils } from '../../utils/test.utils.js'
import { TeamTestUtils } from '../../utils/team.utils.js'
import type { TestClient, TestTeam } from '../../utils/types.js'
import { WebsocketEvents } from '../../../src/nest/websocket/ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../../src/nest/app/logger/logger.js'
import { AppModule } from '../../../src/nest/app/app.module.js'
import { CommunitiesManagerService } from '../../../src/nest/communities/communities-manager.service.js'
import type { GeneratePublicKeysMessage } from '../../../src/nest/communities/websocket/types/gen-pub-keys.types.js'
import {
  createDevice,
  createUser,
  type DeviceWithSecrets,
  type InviteResult,
  type LocalUserContext,
  type Server,
} from '@localfirst/auth'
import {
  type Community,
  type EncryptedAndSignedPayload,
  EncryptionScopeType,
} from '../../../src/nest/communities/types.js'
import { SodiumHelper } from '../../../src/nest/encryption/sodium.helper.js'
import * as uint8arrays from 'uint8arrays'
import type { Keyset } from '@localfirst/crdx'
import { CommunityOperationStatus } from '../../../src/nest/communities/websocket/types/common.types.js'
import {
  type CreateCommunity,
  type CreateCommunityResponse,
  CreateCommunityStatus,
} from '../../../src/nest/communities/websocket/types/create-community.types.js'
import { CommunitiesStorageService } from '../../../src/nest/communities/storage/communities.storage.service.js'
import type { CommunitySignInMessage } from '../../../src/nest/communities/websocket/types/community-sign-in.types.js'
import { ClientEvents } from '../../../src/client/ws.client.events.js'
import { ServerKeyManagerService } from '../../../src/nest/encryption/server-key-manager.service.js'
import type {
  LogEntrySyncMessage,
  LogEntrySyncPayload,
} from '../../../src/nest/communities/websocket/types/log-entry-sync.types.js'
import { LogEntrySyncStorageService } from '../../../src/nest/communities/storage/log-entry-sync.storage.service.js'
import type { Serializer } from '../../../src/nest/utils/serialization/serializer.service.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- necessary?
import _ from 'lodash'
import { SERIALIZER } from '../../../src/nest/app/const.js'
import {
  type CaptchaVerifyMessage,
  HCAPTCHA_TEST_TOKEN,
} from '../../../src/nest/communities/websocket/types/captcha.types.js'
import { WebsocketGateway } from '../../../src/nest/websocket/ws.gateway.js'
import { waitFor } from '../../utils/waitFor.js'

describe('Communities', () => {
  let testClient: TestClient
  let secondTestClient: TestClient
  let invalidTestClient: TestClient
  let secondClientContext: LocalUserContext
  let invalidClientContext: LocalUserContext
  let invite: InviteResult

  let testingModule: TestingModule
  let communitiesManagerService: CommunitiesManagerService
  let websocketGateway: WebsocketGateway
  let sodiumHelper: SodiumHelper
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- keeping for future convenience
  let storage: CommunitiesStorageService
  let dataSyncStorage: LogEntrySyncStorageService
  let serializer: Serializer
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
    testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    await TestUtils.startServer(testingModule)
    websocketGateway = testingModule.get<WebsocketGateway>(WebsocketGateway)
    communitiesManagerService = testingModule.get<CommunitiesManagerService>(
      CommunitiesManagerService,
    )
    sodiumHelper = testingModule.get<SodiumHelper>(SodiumHelper)
    storage = testingModule.get<CommunitiesStorageService>(
      CommunitiesStorageService,
    )
    dataSyncStorage = testingModule.get<LogEntrySyncStorageService>(
      LogEntrySyncStorageService,
    )
    teamTestUtils = new TeamTestUtils(
      testingModule.get<ServerKeyManagerService>(ServerKeyManagerService),
    )
    serializer = testingModule.get<Serializer>(SERIALIZER)
  })

  afterAll(async () => {
    testClient.client.close()
    secondTestClient.client.close()
    invalidTestClient.client.close()
    await TestUtils.close()
    await testingModule.close()
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

    it('should validate the connection with captcha', async () => {
      const message: CaptchaVerifyMessage = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SENDING,
        payload: {
          token: HCAPTCHA_TEST_TOKEN,
        },
      }
      const response =
        await testClient.client.sendMessage<CaptchaVerifyMessage>(
          WebsocketEvents.VerifyCaptcha,
          message,
          true,
        )
      expect(response).toBeDefined()
      expect(response!.status).toBe(CommunityOperationStatus.SUCCESS)
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
        } satisfies CreateCommunityResponse),
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
        {
          ...testTeam.testUserContext,
          team: testTeam.team,
        },
      )
      let authorized = false

      testClient.authConnection.on(ClientEvents.AuthJoined, () => {
        authorized = true
      })
      await waitFor(
        () => {
          expect(authorized).toBe(true)
        },
        { timeout: 30_000 },
      )
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

      secondClientContext = {
        user: prospectiveUser,
        device: prospectiveDevice,
      }

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
        } satisfies CommunitySignInMessage),
      )
    })

    it('the user should be in a room corresponding to their team id after signing in', () => {
      // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- false positive?
      const { rooms } = websocketGateway.io.sockets.adapter
      expect(rooms.has(testTeam.team.id)).toBe(true)
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
        {
          ...secondClientContext,
          invitationSeed: invite.seed,
        },
      )
      let authorized = false
      secondTestClient.authConnection.on(ClientEvents.AuthJoined, () => {
        authorized = true
      })
      await waitFor(
        () => {
          expect(authorized).toBe(true)
        },
        { timeout: 30_000 },
      )
    })

    it('should validate that the sigchain is updated for QSS and the original user', async () => {
      await waitFor(
        async () => {
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
        },
        { timeout: 15_000 },
      )
    })
  })

  describe('Data Sync', () => {
    let logSyncMessage: LogEntrySyncMessage
    let logSyncAck: LogEntrySyncMessage | undefined
    let sendingClientReceivedMessage = false
    let secondClientReceivedMessage = false

    beforeAll(() => {
      testClient.sockets.client.onAny((...args: unknown[]) => {
        logger.debug(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- testing
          `testClient.sockets.client ${testClient.sockets.client.id} received event: ${args[0]}`,
          ...args.slice(1),
        )
      })
      secondTestClient.sockets.client.onAny((...args: unknown[]) => {
        logger.debug(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- testing
          `secondTestClient.sockets.client ${secondTestClient.sockets.client.id} received event: ${args[0]}`,
          ...args.slice(1),
        )
      })

      testClient.client.clientSocket?.onAny((...args: unknown[]) => {
        logger.debug(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- testing
          `testClient.client.clientSocket ${testClient.client.clientSocket?.id} received event: ${args[0]}`,
          ...args.slice(1),
        )
      })
      secondTestClient.client.clientSocket?.onAny((...args: unknown[]) => {
        logger.debug(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- testing
          `secondTestClient.client.clientSocket ${secondTestClient.client.clientSocket?.id} received event: ${args[0]}`,
          ...args.slice(1),
        )
      })
      testClient.sockets.client.on(
        WebsocketEvents.LogEntryFanout,
        (message: LogEntrySyncMessage) => {
          logger.info('Sending client received fanned out message')
          sendingClientReceivedMessage = true
        },
      )
      secondTestClient.sockets.client.on(
        WebsocketEvents.LogEntryFanout,
        (message: LogEntrySyncMessage) => {
          logger.info('Second client received fanned out message')
          secondClientReceivedMessage = true
        },
      )
    })

    it('should have both users in the teams socketio room', () => {
      // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- false positive?
      const { rooms } = websocketGateway.io.sockets.adapter
      const room = rooms.get(testTeam.team.id)
      expect(room).toBeDefined()
      expect(room!.size).toBe(2)

      logger.info('Room members:', Array.from(room!))
      logger.info('Test client socket id:', testClient.sockets.client.id)
      logger.info(
        'Second test client socket id:',
        secondTestClient.sockets.client.id,
      )
    })

    it('client should send a data sync message', async () => {
      const rawMessage = 'this is a message'
      const encryptedMessage = testTeam.team.encrypt(rawMessage, 'member')
      const signature = testTeam.team.sign(rawMessage)
      const logSyncPayload: LogEntrySyncPayload = {
        teamId: testTeam.team.id,
        hash: sodiumHelper.sodium.crypto_hash(rawMessage, 'base64'),
        hashedDbId: sodiumHelper.sodium.crypto_hash(
          sodiumHelper.sodium.randombytes_buf(32),
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
      const serialized = serializer.serialize(logSyncPayload.encEntry)
      const deserialized = serializer.deserialize(serialized)
      expect(deserialized).toStrictEqual(logSyncPayload.encEntry)
      logSyncMessage = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SENDING,
        payload: logSyncPayload,
      }

      logSyncAck = await testClient.client.sendMessage<LogEntrySyncMessage>(
        WebsocketEvents.LogEntrySync,
        logSyncMessage,
        true,
      )
    })

    it('should return a valid data sync ack', () => {
      expect(logSyncAck).not.toBeNull()
      expect(logSyncAck!.status).toBe(CommunityOperationStatus.SUCCESS)
      expect(logSyncAck!.reason).toBeUndefined()
      expect(logSyncAck!.payload).toMatchObject(
        expect.objectContaining({
          teamId: logSyncMessage.payload.teamId,
          hashedDbId: logSyncMessage.payload.hashedDbId,
          hash: logSyncMessage.payload.hash,
        }),
      )
    })

    it('should store the message contents in postgres', async () => {
      const storedSyncContents =
        await dataSyncStorage.getLogEntriesForCommunity(
          testTeam.team.id,
          logSyncMessage.ts - 10_000,
        )
      expect(storedSyncContents).not.toBeNull()
      expect(storedSyncContents!.length).toBe(1)
      const [contents] = storedSyncContents!
      expect(contents.cid).toBe(logSyncMessage.payload.hashedDbId)
      expect(contents.communityId).toBe(testTeam.team.id)

      const deserializedContents = serializer.deserialize(
        contents.entry,
      ) as EncryptedAndSignedPayload
      expect(deserializedContents).toEqual(
        expect.objectContaining({
          userId: logSyncMessage.payload.encEntry.userId,
          ts: logSyncMessage.payload.encEntry.ts,
          teamId: logSyncMessage.payload.encEntry.teamId,
          signature: logSyncMessage.payload.encEntry.signature,
          encrypted: expect.objectContaining({
            contents: expect.any(Buffer),
            scope: {
              name: logSyncMessage.payload.encEntry.encrypted.scope.name,
              type: logSyncMessage.payload.encEntry.encrypted.scope.type,
              generation:
                logSyncMessage.payload.encEntry.encrypted.scope.generation,
            },
          }),
        }),
      )

      expect(
        serializer.bufferToUint8array(
          deserializedContents.encrypted.contents as Buffer,
        ),
      ).toStrictEqual(logSyncMessage.payload.encEntry.encrypted.contents)
    })

    it('should have fanned out log entry to second user', () => {
      logger.info('sendingClientReceivedMessage', sendingClientReceivedMessage)
      logger.info('secondClientReceivedMessage', secondClientReceivedMessage)

      expect(!sendingClientReceivedMessage && secondClientReceivedMessage).toBe(
        true,
      )
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
      }

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
        } satisfies CommunitySignInMessage),
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
        {
          ...invalidClientContext,
          invitationSeed: 'foobar',
        },
      )
      let authorized = false
      let disconnected = false
      secondTestClient.authConnection.on(ClientEvents.AuthJoined, () => {
        authorized = true
      })
      secondTestClient.authConnection.on(ClientEvents.AuthDisconnected, () => {
        disconnected = true
      })

      await waitFor(
        () => {
          expect(disconnected).toBe(true)
        },
        { timeout: 30_000 },
      )
      expect(authorized).toBe(false)
    })

    it(`should validate that the invalid client's auth connection should be closed and removed from QSS`, async () => {
      await waitFor(
        async () => {
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
        },
        { timeout: 15_000 },
      )
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
