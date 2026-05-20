import { jest } from '@jest/globals'
import { Test, type TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { DateTime } from 'luxon'
import { NseAuthController } from './nse.controller.js'
import { NseAuthService } from './nse-auth.service.js'
import type { NseLogEntriesResponse } from './nse-auth.service.js'
import { NseJwtAuthGuard } from './nse-jwt-auth.guard.js'
import { LogEntrySyncStorageService } from '../communities/storage/log-entry-sync.storage.service.js'
import type { LogSyncEntry } from '../communities/types.js'

const TEAM_ID = 'test-team-id'
const DEVICE_ID = 'test-device-id'

const CHALLENGE_RESPONSE = {
  challengeId: 'challenge-abc',
  challenge: { type: 'DEVICE', name: DEVICE_ID, nonce: 'abc', timestamp: 1 },
}

const PROOF = { signature: 'sig', publicKey: 'pub' }

describe('NseAuthController', () => {
  let module: TestingModule | undefined
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- assigned in beforeEach
  let controller!: NseAuthController
  let mockService: jest.Mocked<
    Pick<NseAuthService, 'issueChallenge' | 'verifyAndIssueToken'>
  >
  let mockLogEntrySyncStorage: jest.Mocked<
    Pick<
      LogEntrySyncStorageService,
      'getLogEntriesForCommunity' | 'resolveSyncSeqForTimestamp'
    >
  >

  beforeEach(async () => {
    mockService = {
      issueChallenge: jest.fn<NseAuthService['issueChallenge']>(),
      verifyAndIssueToken: jest.fn<NseAuthService['verifyAndIssueToken']>(),
    }
    mockLogEntrySyncStorage = {
      getLogEntriesForCommunity:
        jest.fn<LogEntrySyncStorageService['getLogEntriesForCommunity']>(),
      resolveSyncSeqForTimestamp:
        jest.fn<LogEntrySyncStorageService['resolveSyncSeqForTimestamp']>(),
    }

    module = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: 900 },
        }),
      ],
      controllers: [NseAuthController],
      providers: [
        { provide: NseAuthService, useValue: mockService },
        {
          provide: LogEntrySyncStorageService,
          useValue: mockLogEntrySyncStorage,
        },
        NseJwtAuthGuard,
      ],
    }).compile()

    controller = module.get<NseAuthController>(NseAuthController)
  })

  afterEach(async () => {
    await module?.close()
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('issueChallenge', () => {
    it('delegates to service and returns result', () => {
      mockService.issueChallenge.mockReturnValue(CHALLENGE_RESPONSE)

      const result = controller.issueChallenge({
        deviceId: DEVICE_ID,
        teamId: TEAM_ID,
      })

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock; method ref is safe
      expect(mockService.issueChallenge).toHaveBeenCalledWith(
        DEVICE_ID,
        TEAM_ID,
      )
      expect(result).toBe(CHALLENGE_RESPONSE)
    })

    it('propagates exceptions from service', () => {
      mockService.issueChallenge.mockImplementation(() => {
        throw new UnauthorizedException('Unknown team')
      })

      expect(() =>
        controller.issueChallenge({ deviceId: DEVICE_ID, teamId: TEAM_ID }),
      ).toThrow(UnauthorizedException)
    })
  })

  describe('verifyAndIssueToken', () => {
    it('delegates to service and returns token', async () => {
      const expected = { token: 'tok.sig', expiresIn: 900 }
      mockService.verifyAndIssueToken.mockResolvedValue(expected)

      const result = await controller.verifyAndIssueToken({
        challengeId: 'chal-id',
        deviceId: DEVICE_ID,
        proof: PROOF,
      })

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock; method ref is safe
      expect(mockService.verifyAndIssueToken).toHaveBeenCalledWith(
        'chal-id',
        DEVICE_ID,
        PROOF,
      )
      expect(result).toBe(expected)
    })

    it('propagates UnauthorizedException from service', async () => {
      mockService.verifyAndIssueToken.mockRejectedValue(
        new UnauthorizedException('Challenge expired'),
      )

      await expect(
        controller.verifyAndIssueToken({
          challengeId: 'expired-id',
          deviceId: DEVICE_ID,
          proof: PROOF,
        }),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('getLogEntries', () => {
    const req = { user: { teamId: TEAM_ID } }

    it('loads entries from storage using afterSeq when provided', async () => {
      const storageEntries: LogSyncEntry[] = [
        {
          cid: 'cid-1',
          hashedDbId: 'hashed-db-id-1',
          communityId: TEAM_ID,
          entry: Buffer.from([1, 2, 3]),
          receivedAt: DateTime.fromISO('2024-01-01T00:00:00.000Z'),
          syncSeq: 7,
        },
      ]
      const response: NseLogEntriesResponse = {
        entries: [
          {
            cid: 'cid-1',
            hashedDbId: 'hashed-db-id-1',
            communityId: TEAM_ID,
            entry: { type: 'Buffer', data: [1, 2, 3] },
            receivedAt: '2024-01-01T00:00:00.000Z',
            syncSeq: 7,
          },
        ],
        resolvedAfterSeq: 5,
      }
      mockLogEntrySyncStorage.getLogEntriesForCommunity.mockResolvedValue(
        storageEntries,
      )

      const result = await controller.getLogEntries(TEAM_ID, '5', '', req)

      expect(
        mockLogEntrySyncStorage.resolveSyncSeqForTimestamp,
      ).not.toHaveBeenCalled()
      expect(
        mockLogEntrySyncStorage.getLogEntriesForCommunity,
      ).toHaveBeenCalledWith(TEAM_ID, 5)
      expect(result).toEqual(response)
    })

    it('uses since=0 when query params are empty', async () => {
      mockLogEntrySyncStorage.resolveSyncSeqForTimestamp.mockResolvedValue(0)
      mockLogEntrySyncStorage.getLogEntriesForCommunity.mockResolvedValue([])

      await controller.getLogEntries(TEAM_ID, '', '', req)

      expect(
        mockLogEntrySyncStorage.resolveSyncSeqForTimestamp,
      ).toHaveBeenCalledWith(TEAM_ID, 0)
      expect(
        mockLogEntrySyncStorage.getLogEntriesForCommunity,
      ).toHaveBeenCalledWith(TEAM_ID, 0)
    })

    it('returns [] when storage returns null', async () => {
      mockLogEntrySyncStorage.resolveSyncSeqForTimestamp.mockResolvedValue(0)
      mockLogEntrySyncStorage.getLogEntriesForCommunity.mockResolvedValue(null)

      const result = await controller.getLogEntries(TEAM_ID, '', '', req)

      expect(result).toEqual({
        entries: [],
        resolvedAfterSeq: 0,
      })
    })

    it('resolves a parsed since timestamp to syncSeq', async () => {
      mockLogEntrySyncStorage.resolveSyncSeqForTimestamp.mockResolvedValue(17)
      mockLogEntrySyncStorage.getLogEntriesForCommunity.mockResolvedValue([])

      const result = await controller.getLogEntries(
        TEAM_ID,
        '',
        '1700000000000',
        req,
      )

      expect(
        mockLogEntrySyncStorage.resolveSyncSeqForTimestamp,
      ).toHaveBeenCalledWith(TEAM_ID, 1700000000000)
      expect(
        mockLogEntrySyncStorage.getLogEntriesForCommunity,
      ).toHaveBeenCalledWith(TEAM_ID, 17)
      expect(result).toEqual({
        entries: [],
        resolvedAfterSeq: 17,
      })
    })

    it('throws UnauthorizedException if req.user.teamId does not match path teamId', async () => {
      await expect(
        controller.getLogEntries('other-team', '0', '', req),
      ).rejects.toThrow(UnauthorizedException)

      expect(
        mockLogEntrySyncStorage.resolveSyncSeqForTimestamp,
      ).not.toHaveBeenCalled()
      expect(
        mockLogEntrySyncStorage.getLogEntriesForCommunity,
      ).not.toHaveBeenCalled()
    })

    it('propagates UnauthorizedException from storage', async () => {
      mockLogEntrySyncStorage.getLogEntriesForCommunity.mockRejectedValue(
        new UnauthorizedException('Storage error'),
      )

      await expect(
        controller.getLogEntries(TEAM_ID, '0', '', req),
      ).rejects.toThrow(UnauthorizedException)
    })
  })
})
