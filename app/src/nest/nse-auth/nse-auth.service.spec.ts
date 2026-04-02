import { jest } from '@jest/globals'
import { Test, type TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { NseAuthService } from './nse-auth.service.js'
import { LogEntrySyncStorageService } from '../communities/storage/log-entry-sync.storage.service.js'
import { CommunitiesManagerService } from '../communities/communities-manager.service.js'
import { signatures } from '@localfirst/crypto'

const TEAM_ID = 'test-team-id'
const DEVICE_ID = 'test-device-id'
const PROOF = { signature: 'sig', publicKey: 'pub' }

describe('NseAuthService', () => {
  let module: TestingModule | undefined
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- assigned in beforeEach
  let service!: NseAuthService
  let mockLogEntrySyncStorage: jest.Mocked<
    Pick<
      LogEntrySyncStorageService,
      'getLogEntriesForCommunity' | 'resolveSyncSeqForTimestamp'
    >
  >
  let mockCommunitiesManager: jest.Mocked<
    Pick<CommunitiesManagerService, 'get'>
  >

  beforeEach(async () => {
    mockLogEntrySyncStorage = {
      getLogEntriesForCommunity:
        jest.fn<LogEntrySyncStorageService['getLogEntriesForCommunity']>(),
      resolveSyncSeqForTimestamp:
        jest.fn<LogEntrySyncStorageService['resolveSyncSeqForTimestamp']>(),
    }
    mockCommunitiesManager = {
      get: jest.fn<CommunitiesManagerService['get']>(),
    }

    module = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: 900 },
        }),
      ],
      providers: [
        NseAuthService,
        {
          provide: LogEntrySyncStorageService,
          useValue: mockLogEntrySyncStorage,
        },
        {
          provide: CommunitiesManagerService,
          useValue: mockCommunitiesManager,
        },
      ],
    }).compile()

    service = module.get<NseAuthService>(NseAuthService)
    await service.onModuleInit()
  })

  afterEach(async () => {
    service.onModuleDestroy()
    await module?.close()
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('issueChallenge', () => {
    it('returns challengeId and correctly shaped challenge', () => {
      const result = service.issueChallenge(DEVICE_ID, TEAM_ID)

      expect(typeof result.challengeId).toBe('string')
      expect(result.challengeId.length).toBeGreaterThan(0)
      expect(result.challenge.type).toBe('DEVICE')
      expect(result.challenge.name).toBe(DEVICE_ID)
      expect(typeof result.challenge.nonce).toBe('string')
      expect(result.challenge.nonce.length).toBeGreaterThan(0)
      expect(typeof result.challenge.timestamp).toBe('number')
    })

    it('timestamp is within 1s of Date.now()', () => {
      const before = Date.now()
      const result = service.issueChallenge(DEVICE_ID, TEAM_ID)
      const after = Date.now()

      expect(result.challenge.timestamp).toBeGreaterThanOrEqual(before)
      expect(result.challenge.timestamp).toBeLessThanOrEqual(after)
    })

    it('each call produces a unique challengeId', () => {
      const a = service.issueChallenge(DEVICE_ID, TEAM_ID)
      const b = service.issueChallenge(DEVICE_ID, TEAM_ID)
      expect(a.challengeId).not.toBe(b.challengeId)
    })

    it('evicts expired challenges on next issue', () => {
      const first = service.issueChallenge(DEVICE_ID, TEAM_ID)
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 70_000)
      try {
        const second = service.issueChallenge(DEVICE_ID, TEAM_ID)
        expect(second.challengeId).not.toBe(first.challengeId)
      } finally {
        jest.restoreAllMocks()
      }
    })
  })

  describe('verifyAndIssueToken', () => {
    const registeredKeys = signatures.keyPair()

    const setRegisteredDevice = (): void => {
      const mockCommunity = {
        teamId: TEAM_ID,
        sigChain: {
          team: {
            deviceWasRemoved: jest.fn().mockReturnValue(false),
            hasDevice: jest.fn().mockReturnValue(true),
            device: jest.fn().mockReturnValue({
              keys: { signature: registeredKeys.publicKey },
            }),
          },
        },
      }
      mockCommunitiesManager.get.mockResolvedValue(mockCommunity as never)
    }

    it('throws UnauthorizedException if challengeId not found', async () => {
      await expect(
        service.verifyAndIssueToken('nonexistent', DEVICE_ID, PROOF),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException if challenge is expired', async () => {
      const { challengeId } = service.issueChallenge(DEVICE_ID, TEAM_ID)
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 70_000)
      try {
        await expect(
          service.verifyAndIssueToken(challengeId, DEVICE_ID, PROOF),
        ).rejects.toThrow(UnauthorizedException)
      } finally {
        jest.restoreAllMocks()
      }
    })

    it('throws UnauthorizedException for invalid base58 in proof', async () => {
      const { challengeId } = service.issueChallenge(DEVICE_ID, TEAM_ID)
      setRegisteredDevice()
      await expect(
        service.verifyAndIssueToken(challengeId, DEVICE_ID, {
          signature: '0OIl', // invalid base58 chars
          publicKey: 'pub',
        }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException if token request device does not match challenged device', async () => {
      const { challengeId } = service.issueChallenge(DEVICE_ID, TEAM_ID)

      await expect(
        service.verifyAndIssueToken(challengeId, 'other-device-id', PROOF),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException if the device is not registered on the team', async () => {
      const { challengeId, challenge } = service.issueChallenge(
        DEVICE_ID,
        TEAM_ID,
      )
      const otherKeys = signatures.keyPair()
      const mockCommunity = {
        teamId: TEAM_ID,
        sigChain: {
          team: {
            deviceWasRemoved: jest.fn().mockReturnValue(false),
            hasDevice: jest.fn().mockReturnValue(false),
          },
        },
      }
      mockCommunitiesManager.get.mockResolvedValue(mockCommunity as never)

      await expect(
        service.verifyAndIssueToken(challengeId, DEVICE_ID, {
          signature: signatures.sign(challenge, otherKeys.secretKey),
          publicKey: otherKeys.publicKey,
        }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException if proof public key does not match the registered device key', async () => {
      const { challengeId, challenge } = service.issueChallenge(
        DEVICE_ID,
        TEAM_ID,
      )
      const otherKeys = signatures.keyPair()
      setRegisteredDevice()

      await expect(
        service.verifyAndIssueToken(challengeId, DEVICE_ID, {
          signature: signatures.sign(challenge, otherKeys.secretKey),
          publicKey: otherKeys.publicKey,
        }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('issues a JWT when the proof matches the registered device key for the team', async () => {
      const { challengeId, challenge } = service.issueChallenge(
        DEVICE_ID,
        TEAM_ID,
      )
      setRegisteredDevice()

      const result = await service.verifyAndIssueToken(challengeId, DEVICE_ID, {
        signature: signatures.sign(challenge, registeredKeys.secretKey),
        publicKey: registeredKeys.publicKey,
      })

      expect(result.expiresIn).toBe(900)
      expect(typeof result.token).toBe('string')
      expect(result.token.length).toBeGreaterThan(0)
    })

    it('consumes the challenge (second call fails)', async () => {
      const { challengeId } = service.issueChallenge(DEVICE_ID, TEAM_ID)
      // First attempt — will throw (invalid sig) but consumes the challenge
      setRegisteredDevice()
      await expect(
        service.verifyAndIssueToken(challengeId, DEVICE_ID, PROOF),
      ).rejects.toThrow(UnauthorizedException)
      // Second attempt — challenge already gone
      await expect(
        service.verifyAndIssueToken(challengeId, DEVICE_ID, PROOF),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('getLogEntriesAfterSeq', () => {
    it('returns [] when storage returns null', async () => {
      mockLogEntrySyncStorage.getLogEntriesForCommunity.mockResolvedValue(null)

      const result = await service.getLogEntriesAfterSeq(TEAM_ID, 0)

      expect(result).toEqual({ entries: [], resolvedAfterSeq: 0 })
    })

    it('returns [] when storage returns undefined', async () => {
      mockLogEntrySyncStorage.getLogEntriesForCommunity.mockResolvedValue(
        undefined,
      )

      const result = await service.getLogEntriesAfterSeq(TEAM_ID, 0)

      expect(result).toEqual({ entries: [], resolvedAfterSeq: 0 })
    })

    it('delegates to storage with afterSeq when provided', async () => {
      mockLogEntrySyncStorage.getLogEntriesForCommunity.mockResolvedValue([])

      await service.getLogEntriesAfterSeq(TEAM_ID, 42)

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock; method ref is safe
      expect(
        mockLogEntrySyncStorage.getLogEntriesForCommunity,
      ).toHaveBeenCalledWith(TEAM_ID, 42)
      expect(
        mockLogEntrySyncStorage.resolveSyncSeqForTimestamp,
      ).not.toHaveBeenCalled()
    })

    it('resolves a legacy timestamp to syncSeq when afterSeq is absent', async () => {
      mockLogEntrySyncStorage.resolveSyncSeqForTimestamp.mockResolvedValue(17)
      mockLogEntrySyncStorage.getLogEntriesForCommunity.mockResolvedValue([])

      const result = await service.getLogEntriesAfterSeq(
        TEAM_ID,
        undefined,
        1700000000000,
      )

      expect(
        mockLogEntrySyncStorage.resolveSyncSeqForTimestamp,
      ).toHaveBeenCalledWith(TEAM_ID, 1700000000000)
      expect(
        mockLogEntrySyncStorage.getLogEntriesForCommunity,
      ).toHaveBeenCalledWith(TEAM_ID, 17)
      expect(result).toEqual({ entries: [], resolvedAfterSeq: 17 })
    })
  })
})
