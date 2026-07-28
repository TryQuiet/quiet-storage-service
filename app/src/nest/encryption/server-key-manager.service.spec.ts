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
import { StoredKeyRingType } from './types.js'

describe('ServerKeyManagerService - server encryption key retrieval failure handling', () => {
  let sodiumHelper: SodiumHelper

  const createMockSecrets = (): {
    get: jest.Mock<(name: string) => Promise<string | Uint8Array | undefined>>
    create: jest.Mock<(name: string, secret: string) => Promise<void>>
    update: jest.Mock<
      (
        name: string,
        secret: string,
        clientRequestToken: string,
      ) => Promise<void>
    >
  } => ({
    get: jest.fn<(name: string) => Promise<string | Uint8Array | undefined>>(),
    create: jest.fn<(name: string, secret: string) => Promise<void>>(),
    update:
      jest.fn<
        (
          name: string,
          secret: string,
          clientRequestToken: string,
        ) => Promise<void>
      >(),
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

  it('updates an existing keyring without invoking secret creation', async () => {
    const existingKey = sodiumHelper.toBase64(
      sodiumHelper.sodium.crypto_secretbox_keygen(),
    )
    const mockSecrets = createMockSecrets()
    mockSecrets.get.mockResolvedValueOnce(existingKey)
    mockSecrets.update.mockResolvedValueOnce(undefined)

    const service = makeService(mockSecrets)
    const keyring = sodiumHelper.sodium.randombytes_buf(32)
    await service.updateKeyring(
      'team-id',
      keyring,
      StoredKeyRingType.TEAM_KEYRING,
    )

    expect(mockSecrets.update).toHaveBeenCalledTimes(1)
    expect(mockSecrets.update.mock.calls[0][2]).toHaveLength(64)
    expect(mockSecrets.create).not.toHaveBeenCalled()
  })

  it('reuses ciphertext and the request token after an ambiguous update failure', async () => {
    const existingKey = sodiumHelper.toBase64(
      sodiumHelper.sodium.crypto_secretbox_keygen(),
    )
    const mockSecrets = createMockSecrets()
    mockSecrets.get.mockResolvedValueOnce(existingKey)
    mockSecrets.update
      .mockRejectedValueOnce(new Error('response lost after commit'))
      .mockResolvedValueOnce(undefined)

    const service = makeService(mockSecrets)
    const encryptSpy = jest.spyOn(service, 'encrypt')
    const keyring = sodiumHelper.sodium.randombytes_buf(32)

    await expect(
      service.updateKeyring('team-id', keyring, StoredKeyRingType.TEAM_KEYRING),
    ).rejects.toThrow('Error while encrypting and updating keyring in AWS!')
    await service.updateKeyring(
      'team-id',
      keyring,
      StoredKeyRingType.TEAM_KEYRING,
    )

    expect(mockSecrets.update).toHaveBeenCalledTimes(2)
    expect(mockSecrets.update.mock.calls[1]).toEqual(
      mockSecrets.update.mock.calls[0],
    )
    expect(encryptSpy).toHaveBeenCalledTimes(1)
  })

  it('uses a new ciphertext-bound request token after service recreation', async () => {
    const existingKey = sodiumHelper.toBase64(
      sodiumHelper.sodium.crypto_secretbox_keygen(),
    )
    const mockSecrets = createMockSecrets()
    mockSecrets.get.mockResolvedValue(existingKey)
    mockSecrets.update
      .mockRejectedValueOnce(new Error('response lost after commit'))
      .mockResolvedValueOnce(undefined)
    const keyring = sodiumHelper.sodium.randombytes_buf(32)

    const firstService = makeService(mockSecrets)
    await expect(
      firstService.updateKeyring(
        'team-id',
        keyring,
        StoredKeyRingType.TEAM_KEYRING,
      ),
    ).rejects.toThrow('Error while encrypting and updating keyring in AWS!')

    const recreatedService = makeService(mockSecrets)
    await recreatedService.updateKeyring(
      'team-id',
      keyring,
      StoredKeyRingType.TEAM_KEYRING,
    )

    expect(mockSecrets.update).toHaveBeenCalledTimes(2)
    const [firstCall, recreatedCall] = mockSecrets.update.mock.calls
    const [, firstCiphertext, firstToken] = firstCall
    const [, recreatedCiphertext, recreatedToken] = recreatedCall
    expect(recreatedCiphertext).not.toBe(firstCiphertext)
    expect(recreatedToken).not.toBe(firstToken)
  })
})
