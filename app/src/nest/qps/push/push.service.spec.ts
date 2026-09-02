/**
 * Unit tests for PushService
 */
import { jest } from '@jest/globals'
import { Test, type TestingModule } from '@nestjs/testing'
import { PushService } from './push.service.js'
import { PushErrorCode } from './push.types.js'
import { QpsErrorReason } from '../qps.types.js'
import { AWSSecretsService } from '../../utils/aws/aws-secrets.service.js'
import { IOS_FALLBACK_BODY, IOS_FALLBACK_TITLE } from './push-relay.types.js'

// Mock firebase-admin
jest.unstable_mockModule('firebase-admin', () => ({
  default: {
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(),
    },
  },
}))

// Interface for accessing private members in tests
interface PushServicePrivate {
  relayAvailable: boolean
  relay: unknown
  iosAvailable: boolean
  iosMessaging: unknown
  androidAvailable: boolean
  androidMessaging: unknown
}

describe('PushService', () => {
  let module: TestingModule | undefined = undefined
  let pushService: PushService | undefined = undefined
  let awsSecretsServiceMock:
    | Pick<AWSSecretsService, 'getSecretEnvVar'>
    | undefined = undefined

  // Helper to access private members for testing
  const getPrivate = (): PushServicePrivate =>
    pushService as unknown as PushServicePrivate

  const setMessagingAvailable = (
    platform: 'ios' | 'android',
    messaging: unknown,
  ): void => {
    const privateService = getPrivate()
    if (platform === 'android') {
      privateService.androidAvailable = true
      privateService.androidMessaging = messaging
      return
    }

    privateService.iosAvailable = true
    privateService.iosMessaging = messaging
  }

  const setRelayAvailable = (relay: unknown): void => {
    const privateService = getPrivate()
    privateService.relayAvailable = true
    privateService.relay = relay
  }

  beforeEach(async () => {
    // Set environment variables for FCM
    process.env.FIREBASE_IOS_PROJECT_ID = 'test-project'
    process.env.FIREBASE_IOS_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com'
    process.env.FIREBASE_IOS_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----'

    awsSecretsServiceMock = {
      getSecretEnvVar: jest
        .fn<(secretName: string) => Promise<string | undefined>>()
        .mockImplementation(
          async secretName => await Promise.resolve(process.env[secretName]),
        ),
    }

    module = await Test.createTestingModule({
      providers: [
        PushService,
        {
          provide: AWSSecretsService,
          useValue: awsSecretsServiceMock,
        },
      ],
    }).compile()

    pushService = module.get<PushService>(PushService)
  })

  afterEach(async () => {
    delete process.env.FIREBASE_IOS_PROJECT_ID
    delete process.env.FIREBASE_IOS_CLIENT_EMAIL
    delete process.env.FIREBASE_IOS_PRIVATE_KEY
    await module?.close()
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(pushService).toBeDefined()
  })

  describe('isAvailable', () => {
    it('should return false when FCM is not configured', () => {
      expect(pushService!.isAvailable()).toBe(false)
      expect(pushService!.isAvailable('android')).toBe(false)
    })
  })

  describe('send', () => {
    it('should return error when FCM is not available', async () => {
      const result = await pushService!.send('test-token', { title: 'Test' })

      expect(result.success).toBe(false)
      expect(result.error).toBe(
        QpsErrorReason.PushNotificationServiceNotAvailable,
      )
      expect(result.errorCode).toBe(PushErrorCode.SERVICE_UNAVAILABLE)
    })

    it('should send successfully via iOS messaging', async () => {
      const mockMessaging = {
        send: jest.fn<() => Promise<string>>().mockResolvedValue('message-id'),
      }

      setMessagingAvailable('ios', mockMessaging)

      const result = await pushService!.send('test-token', {
        title: 'Test Title',
        body: 'Test Body',
        data: { key: 'value' },
      })

      expect(result).toEqual({ success: true })
      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'test-token',
          notification: {
            title: 'Test Title',
            body: 'Test Body',
          },
          data: { key: 'value' },
        }),
      )
    })

    it('should use Android messaging when platform is android', async () => {
      const mockMessaging = {
        send: jest.fn<() => Promise<string>>().mockResolvedValue('message-id'),
      }

      setMessagingAvailable('android', mockMessaging)

      const result = await pushService!.send(
        'android-token',
        { data: { key: 'value' } },
        'android',
      )

      expect(result).toEqual({ success: true })
      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'android-token',
          notification: undefined,
          data: { key: 'value' },
        }),
      )
    })

    it('should map invalid-registration-token to FCM_INVALID_REGISTRATION', async () => {
      const error = new Error('invalid token') as Error & { code: string }
      error.code = 'messaging/invalid-registration-token'

      const mockMessaging = {
        send: jest.fn<() => Promise<string>>().mockRejectedValue(error),
      }

      setMessagingAvailable('ios', mockMessaging)

      const result = await pushService!.send('test-token', { title: 'Test' })

      expect(result).toEqual({
        success: false,
        error: 'Device token is invalid or no longer registered',
        errorCode: PushErrorCode.FCM_INVALID_REGISTRATION,
      })
    })

    it('should map not-registered to FCM_NOT_REGISTERED', async () => {
      const error = new Error('not registered') as Error & { code: string }
      error.code = 'messaging/registration-token-not-registered'

      const mockMessaging = {
        send: jest.fn<() => Promise<string>>().mockRejectedValue(error),
      }

      setMessagingAvailable('ios', mockMessaging)

      const result = await pushService!.send('test-token', { title: 'Test' })

      expect(result).toEqual({
        success: false,
        error: 'Device token is invalid or no longer registered',
        errorCode: PushErrorCode.FCM_NOT_REGISTERED,
      })
    })

    it('should map mismatched credentials to FCM_SENDER_ID_MISMATCH', async () => {
      const error = new Error('mismatched credential') as Error & {
        code: string
      }
      error.code = 'messaging/mismatched-credential'

      const mockMessaging = {
        send: jest.fn<() => Promise<string>>().mockRejectedValue(error),
      }

      setMessagingAvailable('ios', mockMessaging)

      const result = await pushService!.send('test-token', { title: 'Test' })

      expect(result).toEqual({
        success: false,
        error: 'FCM credentials do not match the device token',
        errorCode: PushErrorCode.FCM_SENDER_ID_MISMATCH,
      })
    })

    it('should map unknown errors to UNKNOWN_ERROR', async () => {
      const mockMessaging = {
        send: jest
          .fn<() => Promise<string>>()
          .mockRejectedValue(new Error('unexpected failure')),
      }

      setMessagingAvailable('ios', mockMessaging)

      const result = await pushService!.send('test-token', { title: 'Test' })

      expect(result).toEqual({
        success: false,
        error: 'unexpected failure',
        errorCode: PushErrorCode.UNKNOWN_ERROR,
      })
    })
  })

  describe('trusted relay', () => {
    it('fails closed in production when the relay is not configured', async () => {
      const oldEnv = process.env.ENV
      const oldRegion = process.env.AWS_REGION
      const oldRelay = process.env.QPS_PUSH_RELAY_FUNCTION_ARN
      try {
        process.env.ENV = 'production'
        process.env.AWS_REGION = 'us-east-1'
        delete process.env.QPS_PUSH_RELAY_FUNCTION_ARN

        await pushService!.onModuleInit()

        expect(pushService!.isAvailable('ios')).toBe(false)
        expect(pushService!.isAvailable('android')).toBe(false)
        // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
        expect(awsSecretsServiceMock!.getSecretEnvVar).not.toHaveBeenCalled()
      } finally {
        if (oldEnv == null) delete process.env.ENV
        else process.env.ENV = oldEnv
        if (oldRegion == null) delete process.env.AWS_REGION
        else process.env.AWS_REGION = oldRegion
        if (oldRelay == null) delete process.env.QPS_PUSH_RELAY_FUNCTION_ARN
        else process.env.QPS_PUSH_RELAY_FUNCTION_ARN = oldRelay
      }
    })

    it('does not load Firebase credentials in a production environment', async () => {
      const oldEnv = process.env.ENV
      const oldRegion = process.env.AWS_REGION
      const oldRelay = process.env.QPS_PUSH_RELAY_FUNCTION_ARN
      try {
        process.env.ENV = 'production'
        process.env.AWS_REGION = 'us-east-1'
        process.env.QPS_PUSH_RELAY_FUNCTION_ARN = 'test-relay'

        await pushService!.onModuleInit()

        expect(pushService!.isAvailable('ios')).toBe(true)
        expect(pushService!.isAvailable('android')).toBe(true)
        // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
        expect(awsSecretsServiceMock!.getSecretEnvVar).not.toHaveBeenCalled()
      } finally {
        if (oldEnv == null) delete process.env.ENV
        else process.env.ENV = oldEnv
        if (oldRegion == null) delete process.env.AWS_REGION
        else process.env.AWS_REGION = oldRegion
        if (oldRelay == null) delete process.env.QPS_PUSH_RELAY_FUNCTION_ARN
        else process.env.QPS_PUSH_RELAY_FUNCTION_ARN = oldRelay
      }
    })

    it('delegates canonical notifications to the trusted relay', async () => {
      const send = jest
        .fn<
          () => Promise<{
            successCount: number
            failureCount: number
            invalidTokens: string[]
          }>
        >()
        .mockResolvedValue({
          successCount: 1,
          failureCount: 0,
          invalidTokens: [],
        })
      setRelayAvailable({ send, destroy: jest.fn() })

      const payload = {
        title: IOS_FALLBACK_TITLE,
        body: IOS_FALLBACK_BODY,
        data: { teamId: 'team-1' },
      }
      await expect(
        pushService!.send('token-1', payload, 'ios'),
      ).resolves.toEqual({ success: true })

      expect(send).toHaveBeenCalledWith(['token-1'], payload, 'ios')
    })
  })

  describe('sendMulticast', () => {
    it('should return all failures when FCM is not available', async () => {
      const result = await pushService!.sendMulticast(
        ['token-1', 'token-2', 'token-3'],
        { title: 'Test' },
      )

      expect(result.successCount).toBe(0)
      expect(result.failureCount).toBe(3)
      expect(result.invalidTokens).toEqual([])
    })

    it('should return zeros for empty device tokens array', async () => {
      const mockMessaging = {
        sendEachForMulticast: jest.fn<() => Promise<unknown>>(),
      }

      setMessagingAvailable('ios', mockMessaging)

      const result = await pushService!.sendMulticast([], { title: 'Test' })

      expect(result.successCount).toBe(0)
      expect(result.failureCount).toBe(0)
      expect(result.invalidTokens).toEqual([])
      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockMessaging.sendEachForMulticast).not.toHaveBeenCalled()
    })

    it('should handle all successful sends', async () => {
      const mockMessaging = {
        sendEachForMulticast: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({
            successCount: 3,
            failureCount: 0,
            responses: [
              { success: true },
              { success: true },
              { success: true },
            ],
          }),
      }

      setMessagingAvailable('ios', mockMessaging)

      const result = await pushService!.sendMulticast(
        ['token-1', 'token-2', 'token-3'],
        { title: 'Test', body: 'Message' },
      )

      expect(result.successCount).toBe(3)
      expect(result.failureCount).toBe(0)
      expect(result.invalidTokens).toEqual([])
    })

    it('should identify invalid tokens on failure', async () => {
      const mockMessaging = {
        sendEachForMulticast: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({
            successCount: 1,
            failureCount: 2,
            responses: [
              { success: true },
              {
                success: false,
                error: { code: 'messaging/invalid-registration-token' },
              },
              {
                success: false,
                error: { code: 'messaging/registration-token-not-registered' },
              },
            ],
          }),
      }

      setMessagingAvailable('ios', mockMessaging)

      const result = await pushService!.sendMulticast(
        ['valid-token', 'invalid-token', 'unregistered-token'],
        { title: 'Test' },
      )

      expect(result.successCount).toBe(1)
      expect(result.failureCount).toBe(2)
      expect(result.invalidTokens).toEqual([
        'invalid-token',
        'unregistered-token',
      ])
    })

    it('should handle mixed success and non-token failures', async () => {
      const mockMessaging = {
        sendEachForMulticast: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({
            successCount: 2,
            failureCount: 2,
            responses: [
              { success: true },
              {
                success: false,
                error: { code: 'messaging/invalid-registration-token' },
              },
              { success: true },
              {
                success: false,
                error: { code: 'messaging/server-unavailable' },
              },
            ],
          }),
      }

      setMessagingAvailable('ios', mockMessaging)

      const result = await pushService!.sendMulticast(
        ['token-1', 'token-2', 'token-3', 'token-4'],
        { data: { key: 'value' } },
      )

      expect(result.successCount).toBe(2)
      expect(result.failureCount).toBe(2)
      expect(result.invalidTokens).toEqual(['token-2'])
    })

    it('should handle exception during multicast', async () => {
      const mockMessaging = {
        sendEachForMulticast: jest
          .fn<() => Promise<unknown>>()
          .mockRejectedValue(new Error('FCM error')),
      }

      setMessagingAvailable('ios', mockMessaging)

      const result = await pushService!.sendMulticast(['token-1', 'token-2'], {
        title: 'Test',
      })

      expect(result.successCount).toBe(0)
      expect(result.failureCount).toBe(2)
      expect(result.invalidTokens).toEqual([])
    })

    it('should send payload with title and body', async () => {
      const mockMessaging = {
        sendEachForMulticast: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({
            successCount: 1,
            failureCount: 0,
            responses: [{ success: true }],
          }),
      }

      setMessagingAvailable('ios', mockMessaging)

      await pushService!.sendMulticast(['token-1'], {
        title: 'Test Title',
        body: 'Test Body',
        data: { key: 'value' },
      })

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockMessaging.sendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['token-1'],
          notification: {
            title: 'Test Title',
            body: 'Test Body',
          },
          data: { key: 'value' },
        }),
      )
    })

    it('should send data-only payload without notification', async () => {
      const mockMessaging = {
        sendEachForMulticast: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({
            successCount: 1,
            failureCount: 0,
            responses: [{ success: true }],
          }),
      }

      setMessagingAvailable('ios', mockMessaging)

      await pushService!.sendMulticast(['token-1'], {
        data: { key: 'value' },
      })

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockMessaging.sendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['token-1'],
          notification: undefined,
          data: { key: 'value' },
        }),
      )
    })

    it('should use Android messaging when platform is android', async () => {
      const mockMessaging = {
        sendEachForMulticast: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({
            successCount: 1,
            failureCount: 0,
            responses: [{ success: true }],
          }),
      }

      setMessagingAvailable('android', mockMessaging)

      const result = await pushService!.sendMulticast(
        ['android-token'],
        { data: { key: 'value' } },
        'android',
      )

      expect(result).toEqual({
        successCount: 1,
        failureCount: 0,
        invalidTokens: [],
      })
      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
      expect(mockMessaging.sendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['android-token'],
          notification: undefined,
          data: { key: 'value' },
        }),
      )
    })
  })
})
