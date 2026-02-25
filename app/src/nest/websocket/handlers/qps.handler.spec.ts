import { jest } from '@jest/globals'
import { registerQpsHandlers } from './qps.handler.js'
import { WebsocketEvents } from '../ws.types.js'
import { CommunityOperationStatus } from './types/common.types.js'
import type { QPSHandlerConfig } from './types/qps.types.js'
import type { QPSService } from '../../qps/qps.service.js'
import type { Server } from 'socket.io'
import type { QuietSocket } from '../ws.types.js'

describe('QPS WebSocket Handlers', () => {
  let mockQpsService: jest.Mocked<QPSService>
  let mockSocket: jest.Mocked<QuietSocket>
  let mockServer: jest.Mocked<Server>
  let handlers: Map<string, (...args: unknown[]) => unknown>

  beforeEach(() => {
    mockQpsService = {
      registerDevice: jest.fn(),
      sendPush: jest.fn(),
    } as unknown as jest.Mocked<QPSService>

    handlers = new Map()

    mockSocket = {
      id: 'test-socket-id',
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
    }

    registerQpsHandlers(config)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should register both event handlers', () => {
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
  })

  describe('handleRegisterDevice', () => {
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
          payload: { deviceToken: 'fcm-token', bundleId: 'com.test.app' },
        },
        callback,
      )

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockQpsService.registerDevice).toHaveBeenCalledWith(
        'fcm-token',
        'com.test.app',
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
        error: 'Push service not available',
      })

      const callback = jest.fn()
      const handler = handlers.get(WebsocketEvents.QPSRegisterDevice)!
      await handler(
        {
          ts: Date.now(),
          status: '',
          payload: { deviceToken: 'fcm-token', bundleId: 'com.test.app' },
        },
        callback,
      )

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.ERROR,
          reason: 'Push service not available',
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
          payload: { deviceToken: 'fcm-token', bundleId: 'com.test.app' },
        },
        callback,
      )

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommunityOperationStatus.ERROR,
          reason: 'Registration failed',
        }),
      )
    })
  })

  describe('handleSendPush', () => {
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

    it('should return ERROR for invalid UCAN', async () => {
      mockQpsService.sendPush.mockResolvedValue({
        success: false,
        error: 'Invalid UCAN token',
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
          reason: 'Invalid UCAN token',
        }),
      )
    })

    it('should return NOT_FOUND when device token is invalid', async () => {
      mockQpsService.sendPush.mockResolvedValue({
        success: false,
        error: 'Device token no longer valid',
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
          reason: 'Device token no longer valid',
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
          reason: 'Push notification failed',
        }),
      )
    })
  })
})
