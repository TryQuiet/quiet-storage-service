/**
 * Unit tests for ServerKeyManagerService
 *
 * Regression coverage for issue #3290: a transient secrets-backend failure must
 * not be misread as "no server encryption key exists", which would regenerate
 * the key and make every previously stored keyring undecryptable. These tests
 * drive _initOrRetrieveServerEncKey (via encrypt) with a mocked
 * AWSSecretsService so they stay independent of Redis/AWS.
 */
import { jest } from '@jest/globals'
import { ServerKeyManagerService } from './server-key-manager.service.js'
import { SodiumHelper } from './sodium.helper.js'
import type { AWSSecretsService } from '../utils/aws/aws-secrets.service.js'

describe('ServerKeyManagerService - server encryption key retrieval failure handling', () => {
  let sodiumHelper: SodiumHelper

  const createMockSecrets = (): {
    get: jest.Mock<(name: string) => Promise<string | Uint8Array | undefined>>
    create: jest.Mock<(name: string, secret: string) => Promise<void>>
  } => ({
    get: jest.fn<(name: string) => Promise<string | Uint8Array | undefined>>(),
    create: jest.fn<(name: string, secret: string) => Promise<void>>(),
  })

  const makeService = (
    mock: ReturnType<typeof createMockSecrets>,
  ): ServerKeyManagerService =>
    new ServerKeyManagerService(
      mock as unknown as AWSSecretsService,
      sodiumHelper,
    )

  beforeAll(async () => {
    sodiumHelper = new SodiumHelper()
    await sodiumHelper.onModuleInit()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('does not generate a new server encryption key when retrieval fails transiently', async () => {
    const mockSecrets = createMockSecrets()
    mockSecrets.get.mockRejectedValueOnce(new Error('AWS unavailable'))

    const service = makeService(mockSecrets)

    await expect(service.encrypt('payload')).rejects.toThrow('AWS unavailable')
    expect(mockSecrets.create).not.toHaveBeenCalled()
  })

  it('generates and stores a new server encryption key only when none exists', async () => {
    const mockSecrets = createMockSecrets()
    mockSecrets.get.mockResolvedValueOnce(undefined)
    mockSecrets.create.mockResolvedValueOnce(undefined)

    const service = makeService(mockSecrets)
    await service.encrypt('payload')

    expect(mockSecrets.create).toHaveBeenCalledTimes(1)
  })

  it('loads the existing server encryption key without regenerating it', async () => {
    const existingKey = sodiumHelper.toBase64(
      sodiumHelper.sodium.crypto_secretbox_keygen(),
    )
    const mockSecrets = createMockSecrets()
    mockSecrets.get.mockResolvedValueOnce(existingKey)

    const service = makeService(mockSecrets)
    const encrypted = await service.encrypt('payload')

    expect(mockSecrets.create).not.toHaveBeenCalled()
    expect(encrypted.payload).toBeDefined()
    expect(encrypted.nonce).toBeDefined()
  })
})
