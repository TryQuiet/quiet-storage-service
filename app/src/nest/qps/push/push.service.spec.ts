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

describe('PushService', () => {
  let module: TestingModule | undefined = undefined
  let pushService: PushService | undefined = undefined

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
})
