import { jest } from '@jest/globals'
import { registerQpsHandlers } from './qps.handler.js'
import { WebsocketEvents } from '../ws.types.js'
import { CommunityOperationStatus } from './types/common.types.js'
import type { QPSHandlerConfig } from './types/qps.types.js'
import type { QPSService } from '../../qps/qps.service.js'
import { QPS_MAX_BATCH_UCANS, QpsErrorReason } from '../../qps/qps.types.js'
import type { CommunitiesManagerService } from '../../communities/communities-manager.service.js'
import { AuthStatus } from '../../communities/auth/types.js'
import type { Server } from 'socket.io'
import type { QuietSocket } from '../ws.types.js'

interface AuthConnectionState {
  socketId: string
  status: AuthStatus
}

interface ManagedCommunityAuthState {
  authConnections: Map<string, AuthConnectionState>
}

describe('QPS WebSocket Handlers', () => {
  const teamId = 'test-team-id'
  const otherTeamId = 'other-team-id'
  const userId = 'test-user-id'

  let mockQpsService: jest.Mocked<QPSService>
  let mockCommunitiesManager: { get: jest.Mock }
  let mockSocket: jest.Mocked<QuietSocket>
  let mockServer: jest.Mocked<Server>
  let handlers: Map<string, (...args: unknown[]) => unknown>

  function createManagedCommunity(
    status = AuthStatus.JOINED,
    socketId = 'test-socket-id',
  ): ManagedCommunityAuthState {
    const authConnection: AuthConnectionState = {
      socketId,
      status,
    }

    return {
      authConnections: new Map([[userId, authConnection]]),
    }
  }

  beforeEach(() => {
    mockQpsService = {
      registerDevice: jest.fn(),
      sendPush: jest.fn(),
      sendBatchPush: jest.fn(),
      validateUcan: jest.fn(),
    } as unknown as jest.Mocked<QPSService>

    mockCommunitiesManager = {
      get: jest.fn(async () => await Promise.resolve(createManagedCommunity())),
    }

    handlers = new Map()

    mockSocket = {
      id: 'test-socket-id',
      data: {
        teamId,
        userId,
      },
      on: jest.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(event, handler)
        return mockSocket
      }),
    } as unknown as jest.Mocked<QuietSocket>

    mockServer = {} as unknown as jest.Mocked<Server>

    const config: QPSHandlerConfig = {
      socketServer: mockServer,
      socket: mockSocket,
      qpsService: mockQpsService,
      communitiesManager:
        mockCommunitiesManager as unknown as CommunitiesManagerService,
    }

    registerQpsHandlers(config)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should register all event handlers', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
    expect(mockSocket.on).toHaveBeenCalledWith(
      WebsocketEvents.QPSRegisterDevice,
      expect.any(Function),
    )
    // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
    expect(mockSocket.on).toHaveBeenCalledWith(
      WebsocketEvents.QPSSendPush,
      expect.any(Function),
    )
    // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
    expect(mockSocket.on).toHaveBeenCalledWith(
      WebsocketEvents.QPSSendBatchPush,
      expect.any(Function),
    )
  })

  describe('handleRegisterDevice', () => {
    it('should return UNAUTHORIZED and not register device when socket is not signed into the requested team', async () => {
      mockSocket.data = {}

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSRegisterDevice)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            deviceToken: 'fcm-token',
            bundleId: 'com.test.app',
            platform: 'android',
            teamId,
          },
        },
        callback,
      )

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.registerDevice).not.toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.UNAUTHORIZED,
          reason: QpsErrorReason.SocketNotSignedIntoTeam,
        }),
      )
    })

    it('should return SUCCESS with ucan on successful registration', async () => {
      mockQpsService.registerDevice.mockResolvedValue({
        success: true,
        ucan: 'test-ucan-token',
      })

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSRegisterDevice)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            deviceToken: 'fcm-token',
            bundleId: 'com.test.app',
            platform: 'android',
            teamId,
          },
        },
        callback,
      )

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.registerDevice).toHaveBeenCalledWith(
        'fcm-token',
        'com.test.app',
        'android',
        teamId,
      )
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.SUCCESS,
          payload: { ucan: 'test-ucan-token' },
        }),
      )
    })

    it('should return ERROR when registration fails', async () => {
      mockQpsService.registerDevice.mockResolvedValue({
        success: false,
        error: QpsErrorReason.PushNotificationServiceNotAvailable,
      })

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSRegisterDevice)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            deviceToken: 'fcm-token',
            bundleId: 'com.test.app',
            platform: 'android',
            teamId,
          },
        },
        callback,
      )

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.ERROR,
          reason: QpsErrorReason.PushNotificationServiceNotAvailable,
        }),
      )
    })

    it('should return ERROR when service throws', async () => {
      mockQpsService.registerDevice.mockRejectedValue(
        new Error('unexpected error'),
      )

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSRegisterDevice)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            deviceToken: 'fcm-token',
            bundleId: 'com.test.app',
            platform: 'android',
            teamId,
          },
        },
        callback,
      )

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.ERROR,
          reason: QpsErrorReason.RegistrationFailed,
        }),
      )
    })
  })

  describe('handleSendPush', () => {
    beforeEach(() => {
      mockQpsService.validateUcan.mockResolvedValue({
        valid: true,
        deviceToken: 'device-token',
        bundleId: 'com.test.app',
        platform: 'ios',
        teamId,
      })
    })

    it('should return UNAUTHORIZED and not send push when socket is not signed into the UCAN team', async () => {
      mockSocket.data = {}

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: { ucan: 'valid-ucan' },
        },
        callback,
      )

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.sendPush).not.toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.UNAUTHORIZED,
          reason: QpsErrorReason.SocketNotSignedIntoUcanTeam,
        }),
      )
    })

    it('should return SUCCESS on successful push', async () => {
      mockQpsService.sendPush.mockResolvedValue({ success: true })

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            ucan: 'valid-ucan',
            title: 'Test',
            body: 'Hello',
            data: { key: 'value' },
          },
        },
        callback,
      )

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.sendPush).toHaveBeenCalledWith(
        'valid-ucan',
        'Test',
        'Hello',
        { key: 'value' },
      )
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.SUCCESS,
        }),
      )
    })

    it('should return ERROR for invalid UCAN metadata', async () => {
      mockQpsService.validateUcan.mockResolvedValue({
        valid: false,
        error: QpsErrorReason.InvalidUcanToken,
      })

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: { ucan: 'invalid-ucan' },
        },
        callback,
      )

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.sendPush).not.toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.ERROR,
          reason: QpsErrorReason.InvalidUcanToken,
        }),
      )
    })

    it('should return UNAUTHORIZED when UCAN has no teamId', async () => {
      mockQpsService.validateUcan.mockResolvedValue({
        valid: true,
        deviceToken: 'device-token',
        platform: 'ios',
      })

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: { ucan: 'ucan-without-team' },
        },
        callback,
      )

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.sendPush).not.toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.UNAUTHORIZED,
        }),
      )
    })

    it('should return ERROR for invalid UCAN during delivery', async () => {
      mockQpsService.sendPush.mockResolvedValue({
        success: false,
        error: QpsErrorReason.InvalidUcanToken,
        tokenInvalid: false,
      })

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: { ucan: 'invalid-ucan' },
        },
        callback,
      )

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.ERROR,
          reason: QpsErrorReason.InvalidUcanToken,
        }),
      )
    })

    it('should return NOT_FOUND when device token is invalid', async () => {
      mockQpsService.sendPush.mockResolvedValue({
        success: false,
        error: QpsErrorReason.DeviceTokenNoLongerValid,
        tokenInvalid: true,
      })

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: { ucan: 'ucan-with-expired-token' },
        },
        callback,
      )

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.NOT_FOUND,
          reason: QpsErrorReason.DeviceTokenNoLongerValid,
        }),
      )
    })

    it('should return ERROR when service throws', async () => {
      mockQpsService.sendPush.mockRejectedValue(new Error('unexpected error'))

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: { ucan: 'valid-ucan' },
        },
        callback,
      )

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.ERROR,
          reason: QpsErrorReason.PushNotificationFailed,
        }),
      )
    })
  })

  describe('handleSendBatchPush', () => {
    beforeEach(() => {
      mockQpsService.validateUcan.mockResolvedValue({
        valid: true,
        deviceToken: 'device-token',
        bundleId: 'com.test.app',
        platform: 'ios',
        teamId,
      })
    })

    it('should return UNAUTHORIZED and not send batch push when auth has not joined', async () => {
      mockCommunitiesManager.get.mockResolvedValue(
        createManagedCommunity(AuthStatus.JOINING),
      )

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendBatchPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            ucans: ['ucan-1'],
          },
        },
        callback,
      )

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.sendBatchPush).not.toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.UNAUTHORIZED,
          reason: QpsErrorReason.SocketNotSignedIntoAnyUcanTeam,
          payload: { invalidTokens: [] },
        }),
      )
    })

    it('should return UNAUTHORIZED and not call service when auth belongs to another socket', async () => {
      mockCommunitiesManager.get.mockResolvedValue(
        createManagedCommunity(AuthStatus.JOINED, 'other-socket-id'),
      )

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendBatchPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            ucans: ['ucan-1'],
          },
        },
        callback,
      )

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.sendBatchPush).not.toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.UNAUTHORIZED,
          reason: QpsErrorReason.SocketNotSignedIntoAnyUcanTeam,
          payload: { invalidTokens: [] },
        }),
      )
    })

    it('should filter out unauthorized UCANs before batch delivery', async () => {
      mockQpsService.validateUcan
        .mockResolvedValueOnce({
          valid: true,
          deviceToken: 'device-token-1',
          platform: 'ios',
          teamId,
        })
        .mockResolvedValueOnce({
          valid: true,
          deviceToken: 'device-token-2',
          platform: 'ios',
          teamId: otherTeamId,
        })
        .mockResolvedValueOnce({
          valid: false,
          error: QpsErrorReason.InvalidUcanToken,
        })
      mockCommunitiesManager.get.mockImplementation(async requestedTeamId => {
        if (requestedTeamId === teamId) {
          return await Promise.resolve(createManagedCommunity())
        }
        return await Promise.resolve(
          createManagedCommunity(AuthStatus.JOINED, 'other-socket-id'),
        )
      })
      mockQpsService.sendBatchPush.mockResolvedValue({
        success: true,
        invalidTokens: [],
      })

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendBatchPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            ucans: ['ucan-1', 'ucan-2', 'ucan-3'],
            title: 'Batch Test',
            body: 'Hello All',
            data: { key: 'value' },
          },
        },
        callback,
      )

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.sendBatchPush).toHaveBeenCalledWith(
        ['ucan-1'],
        'Batch Test',
        'Hello All',
        { key: 'value' },
      )
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.SUCCESS,
          payload: { invalidTokens: [] },
        }),
      )
    })

    it('should return SUCCESS with invalidTokens on successful batch push', async () => {
      mockQpsService.sendBatchPush.mockResolvedValue({
        success: true,
        invalidTokens: ['expired-token-1', 'expired-token-2'],
      })

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendBatchPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            ucans: ['ucan-1', 'ucan-2', 'ucan-3'],
            title: 'Batch Test',
            body: 'Hello All',
            data: { key: 'value' },
          },
        },
        callback,
      )

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.sendBatchPush).toHaveBeenCalledWith(
        ['ucan-1', 'ucan-2', 'ucan-3'],
        'Batch Test',
        'Hello All',
        { key: 'value' },
      )
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.SUCCESS,
          payload: { invalidTokens: ['expired-token-1', 'expired-token-2'] },
        }),
      )
    })

    it('should return SUCCESS with empty invalidTokens when all succeed', async () => {
      mockQpsService.sendBatchPush.mockResolvedValue({
        success: true,
        invalidTokens: [],
      })

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendBatchPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            ucans: ['ucan-1', 'ucan-2'],
          },
        },
        callback,
      )

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.SUCCESS,
          payload: { invalidTokens: [] },
        }),
      )
    })

    it('should return ERROR with invalidTokens on batch push failure', async () => {
      mockQpsService.sendBatchPush.mockResolvedValue({
        success: false,
        error: QpsErrorReason.AllPushNotificationsFailed,
        invalidTokens: ['token-1', 'token-2', 'token-3'],
      })

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendBatchPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            ucans: ['ucan-1', 'ucan-2', 'ucan-3'],
          },
        },
        callback,
      )

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.ERROR,
          reason: QpsErrorReason.AllPushNotificationsFailed,
          payload: { invalidTokens: ['token-1', 'token-2', 'token-3'] },
        }),
      )
    })

    it('should reject oversized batches before validating UCANs', async () => {
      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendBatchPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            ucans: Array(QPS_MAX_BATCH_UCANS + 1).fill('ucan'),
          },
        },
        callback,
      )

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.validateUcan).not.toHaveBeenCalled()
      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.sendBatchPush).not.toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.ERROR,
          reason: QpsErrorReason.BatchSizeExceedsLimit,
          payload: { invalidTokens: [] },
        }),
      )
    })

    it('should reject malformed batch UCAN payloads before validating UCANs', async () => {
      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendBatchPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            ucans: 'ucan-1',
          },
        },
        callback,
      )

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.validateUcan).not.toHaveBeenCalled()
      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.sendBatchPush).not.toHaveBeenCalled()
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.ERROR,
          reason: QpsErrorReason.InvalidBatchPayload,
          payload: { invalidTokens: [] },
        }),
      )
    })

    it('should return ERROR when service throws', async () => {
      mockQpsService.sendBatchPush.mockRejectedValue(
        new Error('unexpected error'),
      )

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSSendBatchPush)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: {
            ucans: ['ucan-1'],
          },
        },
        callback,
      )

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.ERROR,
          reason: QpsErrorReason.BatchPushFailed,
          payload: { invalidTokens: [] },
        }),
      )
    })
  })
})
