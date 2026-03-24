import { jest } from '@jest/globals'
import { Test, type TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { NseAuthService } from './nse-auth.service.js'
import { LogEntrySyncStorageService } from '../communities/storage/log-entry-sync.storage.service.js'

const TEAM_ID = 'test-team-id'
const DEVICE_ID = 'test-device-id'
const PROOF = { signature: 'sig', publicKey: 'pub' }

describe('NseAuthService', () => {
  let module: TestingModule | undefined
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- assigned in beforeEach
  let service!: NseAuthService
  let mockLogEntrySyncStorage: jest.Mocked<
    Pick<LogEntrySyncStorageService, 'getLogEntriesForCommunity'>
  >

  beforeEach(async () => {
    mockLogEntrySyncStorage = {
      getLogEntriesForCommunity:
        jest.fn<LogEntrySyncStorageService['getLogEntriesForCommunity']>(),
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
      await expect(
        service.verifyAndIssueToken(challengeId, DEVICE_ID, {
          signature: '0OIl', // invalid base58 chars
          publicKey: 'pub',
        }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('consumes the challenge (second call fails)', async () => {
      const { challengeId } = service.issueChallenge(DEVICE_ID, TEAM_ID)
      // First attempt — will throw (invalid sig) but consumes the challenge
      await expect(
        service.verifyAndIssueToken(challengeId, DEVICE_ID, PROOF),
      ).rejects.toThrow(UnauthorizedException)
      // Second attempt — challenge already gone
      await expect(
        service.verifyAndIssueToken(challengeId, DEVICE_ID, PROOF),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('getLogEntriesSince', () => {
    it('returns [] when storage returns null', async () => {
      mockLogEntrySyncStorage.getLogEntriesForCommunity.mockResolvedValue(null)

      const result = await service.getLogEntriesSince(TEAM_ID, 0)

      expect(result).toEqual([])
    })

    it('returns [] when storage returns undefined', async () => {
      mockLogEntrySyncStorage.getLogEntriesForCommunity.mockResolvedValue(
        undefined,
      )

      const result = await service.getLogEntriesSince(TEAM_ID, 0)

      expect(result).toEqual([])
    })

    it('delegates to storage with correct args', async () => {
      mockLogEntrySyncStorage.getLogEntriesForCommunity.mockResolvedValue([])

      await service.getLogEntriesSince(TEAM_ID, 1700000000000)

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock; method ref is safe
      expect(
        mockLogEntrySyncStorage.getLogEntriesForCommunity,
      ).toHaveBeenCalledWith(TEAM_ID, 1700000000000)
    })
  })
})
