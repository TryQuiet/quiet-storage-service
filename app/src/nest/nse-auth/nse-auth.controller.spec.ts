import { jest } from '@jest/globals'
import { Test, type TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { NseAuthController } from './nse-auth.controller.js'
import { NseAuthService } from './nse-auth.service.js'
import type { NseLogEntry } from './nse-auth.service.js'

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
    Pick<
      NseAuthService,
      'issueChallenge' | 'verifyAndIssueToken' | 'getLogEntriesSince'
    >
  >

  beforeEach(async () => {
    mockService = {
      issueChallenge: jest.fn<NseAuthService['issueChallenge']>(),
      verifyAndIssueToken: jest.fn<NseAuthService['verifyAndIssueToken']>(),
      getLogEntriesSince: jest.fn<NseAuthService['getLogEntriesSince']>(),
    }

    module = await Test.createTestingModule({
      controllers: [NseAuthController],
      providers: [{ provide: NseAuthService, useValue: mockService }],
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

    it('delegates to service and wraps result in { entries }', async () => {
      const fakeEntries: NseLogEntry[] = []
      mockService.getLogEntriesSince.mockResolvedValue(fakeEntries)

      const result = await controller.getLogEntries(TEAM_ID, '0', req)

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock; method ref is safe
      expect(mockService.getLogEntriesSince).toHaveBeenCalledWith(TEAM_ID, 0)
      expect(result).toEqual({ entries: fakeEntries })
    })

    it('uses since=0 when query param is empty', async () => {
      mockService.getLogEntriesSince.mockResolvedValue([])

      await controller.getLogEntries(TEAM_ID, '', req)

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock; method ref is safe
      expect(mockService.getLogEntriesSince).toHaveBeenCalledWith(TEAM_ID, 0)
    })

    it('passes parsed since timestamp to service', async () => {
      mockService.getLogEntriesSince.mockResolvedValue([])

      await controller.getLogEntries(TEAM_ID, '1700000000000', req)

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock; method ref is safe
      expect(mockService.getLogEntriesSince).toHaveBeenCalledWith(
        TEAM_ID,
        1700000000000,
      )
    })

    it('throws UnauthorizedException if req.user.teamId does not match path teamId', async () => {
      await expect(
        controller.getLogEntries('other-team', '0', req),
      ).rejects.toThrow(UnauthorizedException)

      // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock; method ref is safe
      expect(mockService.getLogEntriesSince).not.toHaveBeenCalled()
    })

    it('propagates UnauthorizedException from service', async () => {
      mockService.getLogEntriesSince.mockRejectedValue(
        new UnauthorizedException('Storage error'),
      )

      await expect(controller.getLogEntries(TEAM_ID, '0', req)).rejects.toThrow(
        UnauthorizedException,
      )
    })
  })
})
