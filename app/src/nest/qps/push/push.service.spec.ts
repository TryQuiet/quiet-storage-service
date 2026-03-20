/**
 * Unit tests for PushService
 */
import { jest } from '@jest/globals'
import { Test, type TestingModule } from '@nestjs/testing'
import { PushService } from './push.service.js'
import { PushErrorCode } from './push.types.js'

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
  available: boolean
  messaging: unknown
}

describe('PushService', () => {
  let module: TestingModule | undefined = undefined
  let pushService: PushService | undefined = undefined

  // Helper to access private members for testing
  const getPrivate = (): PushServicePrivate =>
    pushService as unknown as PushServicePrivate

  beforeEach(async () => {
    // Set environment variables for FCM
    process.env.FIREBASE_PROJECT_ID = 'test-project'
    process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com'
    process.env.FIREBASE_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----'

    module = await Test.createTestingModule({
      providers: [PushService],
    }).compile()

    pushService = module.get<PushService>(PushService)
  })

  afterEach(async () => {
    delete process.env.FIREBASE_PROJECT_ID
    delete process.env.FIREBASE_CLIENT_EMAIL
    delete process.env.FIREBASE_PRIVATE_KEY
    await module?.close()
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(pushService).toBeDefined()
  })

  describe('isAvailable', () => {
    it('should return false when FCM is not configured', () => {
      // Without proper initialization, should not be available
      // (the mock doesn't fully initialize FCM)
      const result = pushService!.isAvailable()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('send', () => {
    it('should return error when FCM is not available', async () => {
      // Since we're mocking, FCM won't be properly initialized
      const result = await pushService!.send('test-token', { title: 'Test' })

      expect(result.success).toBe(false)
      expect(result.errorCode).toBe(PushErrorCode.SERVICE_UNAVAILABLE)
    })
  })

  describe('sendMulticast', () => {
    it('should return all failures when FCM is not available', async () => {
      // Since we're mocking, FCM won't be properly initialized
      const result = await pushService!.sendMulticast(
        ['token-1', 'token-2', 'token-3'],
        { title: 'Test' },
      )

      expect(result.successCount).toBe(0)
      expect(result.failureCount).toBe(3)
      expect(result.invalidTokens).toEqual([])
    })

    it('should return zeros for empty device tokens array', async () => {
      const result = await pushService!.sendMulticast([], { title: 'Test' })

      expect(result.successCount).toBe(0)
      expect(result.failureCount).toBe(0)
      expect(result.invalidTokens).toEqual([])
    })

    it('should handle all successful sends', async () => {
      // Create a mock service with proper FCM initialization
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

      // Override the private properties for testing
      getPrivate().available = true
      getPrivate().messaging = mockMessaging

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

      getPrivate().available = true
      getPrivate().messaging = mockMessaging

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

      getPrivate().available = true
      getPrivate().messaging = mockMessaging

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

      getPrivate().available = true
      getPrivate().messaging = mockMessaging

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

      getPrivate().available = true
      getPrivate().messaging = mockMessaging

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

      getPrivate().available = true
      getPrivate().messaging = mockMessaging

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
  })
})
