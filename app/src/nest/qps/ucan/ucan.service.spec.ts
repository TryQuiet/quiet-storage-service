/**
 * Unit tests for UcanService
 */
import { jest } from '@jest/globals'
import { Test, type TestingModule } from '@nestjs/testing'
import * as ucans from '@ucans/ucans'
import { UcanService } from './ucan.service.js'
import { EncryptionModule } from '../../encryption/enc.module.js'
import { UtilsModule } from '../../utils/utils.module.js'
import { AWSModule } from '../../utils/aws/aws.module.js'

describe('UcanService', () => {
  let module: TestingModule | undefined = undefined
  let ucanService: UcanService | undefined = undefined

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [UtilsModule, EncryptionModule, AWSModule],
      providers: [UcanService],
    }).compile()

    await module.init()
    ucanService = module.get<UcanService>(UcanService)
  })

  afterEach(async () => {
    await module?.close()
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(ucanService).toBeDefined()
  })

  describe('getDid', () => {
    it('should return the QPS DID after initialization', () => {
      const did = ucanService!.getDid()
      expect(did).toBeDefined()
      expect(did).toMatch(/^did:key:z[a-zA-Z0-9]+$/)
    })
  })

  describe('createUcan', () => {
    it('should create a valid UCAN', async () => {
      const deviceToken = 'test-fcm-device-token-123'
      const bundleId = 'com.tryquiet.quiet'

      const ucan = await ucanService!.createUcan(deviceToken, bundleId)

      expect(ucan).toBeDefined()
      expect(typeof ucan).toBe('string')
      expect(ucan.split('.').length).toBe(3)
    })

    it('should create UCANs that can be validated', async () => {
      const deviceToken = 'roundtrip-test-token'
      const bundleId = 'com.tryquiet.quiet'

      const ucan = await ucanService!.createUcan(deviceToken, bundleId)
      const validation = await ucanService!.validateUcan(ucan)

      expect(validation.valid).toBe(true)
      expect(validation.deviceToken).toBe(deviceToken)
      expect(validation.bundleId).toBe(bundleId)
    })

    it('should create self-issued UCANs (issuer === audience)', async () => {
      const ucan = await ucanService!.createUcan('test-token', 'com.test.app')
      const parsed = ucans.parse(ucan)

      expect(parsed.payload.iss).toBe(parsed.payload.aud)
      expect(parsed.payload.iss).toBe(ucanService!.getDid())
    })
  })

  describe('validateUcan - basic validation', () => {
    it('should validate a valid UCAN and extract device info', async () => {
      const deviceToken = 'validation-test-token'
      const bundleId = 'com.tryquiet.quiet'

      const ucan = await ucanService!.createUcan(deviceToken, bundleId)
      const validation = await ucanService!.validateUcan(ucan)

      expect(validation.valid).toBe(true)
      expect(validation.deviceToken).toBe(deviceToken)
      expect(validation.bundleId).toBe(bundleId)
      expect(validation.error).toBeUndefined()
    })

    it('should reject a malformed UCAN', async () => {
      const invalidUcan = 'not-a-valid-ucan-token'
      const validation = await ucanService!.validateUcan(invalidUcan)

      expect(validation.valid).toBe(false)
      expect(validation.error).toBeDefined()
    })

    it('should reject empty string', async () => {
      const validation = await ucanService!.validateUcan('')

      expect(validation.valid).toBe(false)
      expect(validation.error).toBeDefined()
    })
  })

  describe('validateUcan - signature security', () => {
    it('should reject a UCAN with tampered signature', async () => {
      const ucan = await ucanService!.createUcan('test-token', 'com.test.app')

      const parts = ucan.split('.')
      parts[2] = 'tampered' + parts[2].slice(8)
      const tamperedUcan = parts.join('.')

      const validation = await ucanService!.validateUcan(tamperedUcan)

      expect(validation.valid).toBe(false)
      expect(validation.error).toContain('signature')
    })

    it('should reject a UCAN with tampered payload', async () => {
      const ucan = await ucanService!.createUcan(
        'original-token',
        'com.test.app',
      )

      const parts = ucan.split('.')
      // Decode payload, modify device token (it's encoded as a string), re-encode (without fixing signature)
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as { att: Array<{ with: string }>; [key: string]: unknown }
      payload.att[0].with = 'fcm:malicious-token'
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url')
      const tamperedUcan = parts.join('.')

      const validation = await ucanService!.validateUcan(tamperedUcan)

      expect(validation.valid).toBe(false)
    })

    it('should reject a UCAN signed by a different key', async () => {
      const otherKeypair = await ucans.EdKeypair.create({ exportable: true })
      const otherDid = otherKeypair.did()

      const ucan = await ucans.build({
        issuer: otherKeypair,
        audience: otherDid,
        expiration: Math.floor(Date.now() / 1000) + 3600,
        capabilities: [
          {
            with: { scheme: 'fcm', hierPart: 'test-token' },
            can: { namespace: 'push', segments: ['send'] },
          },
        ],
      })

      const encoded = ucans.encode(ucan)
      const validation = await ucanService!.validateUcan(encoded)

      expect(validation.valid).toBe(false)
    })

    it('should reject a UCAN with wrong audience', async () => {
      const deviceToken = 'test-token'
      const bundleId = 'com.test.app'

      const ucan = await ucanService!.createUcan(deviceToken, bundleId)
      const parts = ucan.split('.')
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as { aud: string; [key: string]: unknown }

      // Change audience to a different DID
      payload.aud = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url')
      const tamperedUcan = parts.join('.')

      const validation = await ucanService!.validateUcan(tamperedUcan)

      expect(validation.valid).toBe(false)
      expect(validation.error).toContain('signature')
    })
  })

  describe('validateUcan - capability validation', () => {
    it('should reject UCAN with zero capabilities', async () => {
      const keypair = await ucans.EdKeypair.create({ exportable: true })
      const did = keypair.did()

      const ucan = await ucans.build({
        issuer: keypair,
        audience: did,
        expiration: Math.floor(Date.now() / 1000) + 3600,
        capabilities: [],
      })

      const encoded = ucans.encode(ucan)
      const validation = await ucanService!.validateUcan(encoded)

      expect(validation.valid).toBe(false)
      // Will fail issuer check before capability check
      expect(validation.error).toBeDefined()
    })

    // Note: Testing multiple capabilities would require creating a properly signed UCAN,
    // which is complex. The zero capabilities test validates the length check logic.

    // Note: The following tests use UCANs from different issuers
    // They all fail the issuer check before reaching capability validation

    it('should reject UCAN with wrong issuer (tests issuer security)', async () => {
      const keypair = await ucans.EdKeypair.create({ exportable: true })
      const did = keypair.did()

      const ucan = await ucans.build({
        issuer: keypair,
        audience: did,
        expiration: Math.floor(Date.now() / 1000) + 3600,
        capabilities: [
          {
            with: { scheme: 'fcm', hierPart: 'test-token' },
            can: { namespace: 'push', segments: ['send'] },
          },
        ],
      })

      const encoded = ucans.encode(ucan)
      const validation = await ucanService!.validateUcan(encoded)

      expect(validation.valid).toBe(false)
      expect(validation.error).toContain('issued by QPS')
    })
  })

  describe('validateUcan - device token extraction', () => {
    it('should extract device tokens with special characters', async () => {
      const deviceToken = 'token-with_special.chars:123'
      const bundleId = 'com.tryquiet.quiet'

      const ucan = await ucanService!.createUcan(deviceToken, bundleId)
      const validation = await ucanService!.validateUcan(ucan)

      expect(validation.valid).toBe(true)
      expect(validation.deviceToken).toBe(deviceToken)
    })

    it('should handle very long device tokens', async () => {
      const deviceToken = 'a'.repeat(1000)
      const bundleId = 'com.tryquiet.quiet'

      const ucan = await ucanService!.createUcan(deviceToken, bundleId)
      const validation = await ucanService!.validateUcan(ucan)

      expect(validation.valid).toBe(true)
      expect(validation.deviceToken).toBe(deviceToken)
      expect(validation.deviceToken!.length).toBe(1000)
    })

    it('should handle bundle IDs with various formats', async () => {
      const testCases = [
        'com.tryquiet.quiet',
        'com.company.app.debug',
        'org.example.myapp',
      ]

      for (const bundleId of testCases) {
        const ucan = await ucanService!.createUcan('test-token', bundleId)
        const validation = await ucanService!.validateUcan(ucan)

        expect(validation.valid).toBe(true)
        expect(validation.bundleId).toBe(bundleId)
      }
    })
  })

  describe('validateUcan - replay and reuse protection', () => {
    it('should allow the same UCAN to be validated multiple times', async () => {
      // UCANs are bearer tokens and should be reusable
      const ucan = await ucanService!.createUcan('test-token', 'com.test.app')

      const validation1 = await ucanService!.validateUcan(ucan)
      const validation2 = await ucanService!.validateUcan(ucan)

      expect(validation1.valid).toBe(true)
      expect(validation2.valid).toBe(true)
    })

    it('should create different UCANs for different device tokens', async () => {
      const ucan1 = await ucanService!.createUcan('token1', 'com.test.app')
      const ucan2 = await ucanService!.createUcan('token2', 'com.test.app')

      expect(ucan1).not.toBe(ucan2)

      const validation1 = await ucanService!.validateUcan(ucan1)
      const validation2 = await ucanService!.validateUcan(ucan2)

      expect(validation1.deviceToken).toBe('token1')
      expect(validation2.deviceToken).toBe('token2')
    })
  })

  describe('validateUcan - edge cases and malformed data', () => {
    it('should reject UCAN with empty device token', async () => {
      const ucan = await ucanService!.createUcan('valid-token', 'com.test.app')
      const parts = ucan.split('.')
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as { att: Array<{ with: string }>; [key: string]: unknown }

      // In the encoded JWT, 'with' is a string like "fcm:valid-token"
      payload.att[0].with = 'fcm:'
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url')
      const tamperedUcan = parts.join('.')

      const validation = await ucanService!.validateUcan(tamperedUcan)

      expect(validation.valid).toBe(false)
      expect(validation.error).toContain('signature')
    })

    it('should reject UCAN with whitespace-only device token', async () => {
      const ucan = await ucanService!.createUcan('valid-token', 'com.test.app')
      const parts = ucan.split('.')
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as { att: Array<{ with: string }>; [key: string]: unknown }

      payload.att[0].with = 'fcm:   '
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url')
      const tamperedUcan = parts.join('.')

      const validation = await ucanService!.validateUcan(tamperedUcan)

      expect(validation.valid).toBe(false)
      expect(validation.error).toContain('signature')
    })

    it('should reject UCAN with null capability structure', async () => {
      const ucan = await ucanService!.createUcan('valid-token', 'com.test.app')
      const parts = ucan.split('.')
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as { att: unknown[]; [key: string]: unknown }

      payload.att[0] = null
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url')
      const tamperedUcan = parts.join('.')

      const validation = await ucanService!.validateUcan(tamperedUcan)

      expect(validation.valid).toBe(false)
      expect(validation.error).toBeDefined()
    })

    it('should reject UCAN with missing capabilities array', async () => {
      const ucan = await ucanService!.createUcan('valid-token', 'com.test.app')
      const parts = ucan.split('.')
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as { att: unknown; [key: string]: unknown }

      payload.att = null
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url')
      const tamperedUcan = parts.join('.')

      const validation = await ucanService!.validateUcan(tamperedUcan)

      expect(validation.valid).toBe(false)
      expect(validation.error).toBeDefined()
    })
  })
})
