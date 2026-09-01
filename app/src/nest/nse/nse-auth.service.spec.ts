import { jest } from '@jest/globals'
import { Test, type TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { signatures } from '@localfirst/auth'
import sodium from 'libsodium-wrappers-sumo'
import { pack } from 'msgpackr'
import {
  NseAuthService,
  NSE_AUTH_CHALLENGE_TTL_MS,
  NSE_AUTH_PROTOCOL_VERSION,
  NSE_AUTH_SIGNATURE_CONTEXT,
  type ChallengePayload,
} from './nse-auth.service.js'
import { CommunitiesManagerService } from '../communities/communities-manager.service.js'

const TEAM_ID = 'test-team-id'
const DEVICE_ID = 'test-device-id'
const QSS_SERVER_ID = 'qss-server-a'
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const decodeBase58 = (encoded: string): Uint8Array => {
  let value = 0n
  for (const character of encoded)
    value = value * 58n + BigInt(BASE58.indexOf(character))
  const hex = value.toString(16)
  const bytes =
    value === 0n
      ? []
      : [...Buffer.from(hex.length % 2 === 0 ? hex : `0${hex}`, 'hex')]
  return new Uint8Array([
    ...new Uint8Array(/^1*/.exec(encoded)?.[0].length ?? 0),
    ...bytes,
  ])
}
const encodeBase58 = (bytes: Uint8Array): string => {
  const hexBytes = Buffer.from(bytes).toString('hex')
  let value = BigInt(`0x${hexBytes === '' ? '0' : hexBytes}`)
  let encoded = ''
  while (value > 0n) {
    encoded = BASE58[Number(value % 58n)] + encoded
    value /= 58n
  }
  for (const byte of bytes) {
    if (byte !== 0) break
    encoded = `1${encoded}`
  }
  return encoded
}

const canonicalPayload = (challenge: ChallengePayload): unknown[] => [
  challenge.protocolVersion,
  challenge.type,
  challenge.deviceId,
  challenge.teamId,
  challenge.qssServerId,
  challenge.challengeId,
  challenge.nonce,
  challenge.issuedAtMs,
  challenge.expiresAtMs,
]

describe('NseAuthService v1 device proof', () => {
  let module: TestingModule | undefined
  let service: NseAuthService
  let mockCommunitiesManager: jest.Mocked<
    Pick<CommunitiesManagerService, 'get'>
  >
  const registeredKeys = signatures.keyPair('registered-device')

  const setCommunity = (
    qssServerId = QSS_SERVER_ID,
    options: { hasDevice?: boolean; removed?: boolean } = {},
  ): void => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal LFA fixture
    mockCommunitiesManager.get.mockResolvedValue({
      teamId: TEAM_ID,
      sigChain: {
        context: { server: { serverId: qssServerId } },
        team: {
          deviceWasRemoved: jest.fn().mockReturnValue(options.removed ?? false),
          hasDevice: jest.fn().mockReturnValue(options.hasDevice ?? true),
          device: jest
            .fn()
            .mockReturnValue({ keys: { signature: registeredKeys.publicKey } }),
        },
      },
    } as never)
  }

  const sign = (
    challenge: ChallengePayload,
    context = NSE_AUTH_SIGNATURE_CONTEXT,
  ): string =>
    signatures.sign(
      canonicalPayload(challenge),
      registeredKeys.secretKey,
      context,
    )

  beforeEach(async () => {
    mockCommunitiesManager = {
      get: jest.fn<CommunitiesManagerService['get']>(),
    }
    module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        NseAuthService,
        {
          provide: CommunitiesManagerService,
          useValue: mockCommunitiesManager,
        },
      ],
    }).compile()
    service = module.get(NseAuthService)
    service.onModuleInit()
    setCommunity()
  })

  afterEach(async () => {
    service.onModuleDestroy()
    await module?.close()
    jest.restoreAllMocks()
  })

  it('issues the exact bounded v1 schema only for a registered active device', async () => {
    const before = Date.now()
    const { challengeId, challenge } = await service.issueChallenge(
      DEVICE_ID,
      TEAM_ID,
      '192.0.2.1',
    )
    expect(Object.keys(challenge)).toEqual([
      'protocolVersion',
      'type',
      'deviceId',
      'teamId',
      'qssServerId',
      'challengeId',
      'nonce',
      'issuedAtMs',
      'expiresAtMs',
    ])
    expect(challenge).toMatchObject({
      protocolVersion: NSE_AUTH_PROTOCOL_VERSION,
      type: 'DEVICE',
      deviceId: DEVICE_ID,
      teamId: TEAM_ID,
      qssServerId: QSS_SERVER_ID,
      challengeId,
    })
    expect(challenge.issuedAtMs).toBeGreaterThanOrEqual(before)
    expect(challenge.expiresAtMs - challenge.issuedAtMs).toBe(
      NSE_AUTH_CHALLENGE_TTL_MS,
    )
    expect(challenge.nonce).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/)
  })

  it.each([
    ['unknown', { hasDevice: false }],
    ['removed', { removed: true }],
  ])(
    'rejects an %s device before allocating a challenge',
    async (_label, options) => {
      setCommunity(QSS_SERVER_ID, options)
      await expect(
        service.issueChallenge(DEVICE_ID, TEAM_ID, '192.0.2.2'),
      ).rejects.toThrow(UnauthorizedException)
    },
  )

  it('rejects an unknown team before allocating a challenge', async () => {
    mockCommunitiesManager.get.mockResolvedValue(undefined)
    await expect(
      service.issueChallenge(DEVICE_ID, TEAM_ID, '192.0.2.3'),
    ).rejects.toThrow('Unknown team')
  })

  it('issues a JWT for the registered device without accepting claimant key material', async () => {
    const { challengeId, challenge } = await service.issueChallenge(
      DEVICE_ID,
      TEAM_ID,
    )
    const result = await service.verifyAndIssueToken(
      challengeId,
      DEVICE_ID,
      sign(challenge),
    )
    expect(result.expiresIn).toBe(900)
    expect(result.token).toEqual(expect.any(String))
  })

  it('rejects raw legacy and LFA-domain signatures', async () => {
    for (const context of [
      'lf/auth/identity-challenge',
      'lf/crdx/link-authorship',
      'lf/auth/team-message',
    ]) {
      const { challengeId, challenge } = await service.issueChallenge(
        DEVICE_ID,
        TEAM_ID,
      )
      await expect(
        service.verifyAndIssueToken(
          challengeId,
          DEVICE_ID,
          sign(challenge, context),
        ),
      ).rejects.toThrow('Invalid signature')
    }
    const { challengeId, challenge } = await service.issueChallenge(
      DEVICE_ID,
      TEAM_ID,
    )
    const raw = encodeBase58(
      sodium.crypto_sign_detached(
        pack(challenge),
        decodeBase58(registeredKeys.secretKey),
      ),
    )
    await expect(
      service.verifyAndIssueToken(challengeId, DEVICE_ID, raw),
    ).rejects.toThrow('Invalid signature')
  })

  it('prevents a live relay between QSS identities', async () => {
    const { challengeId, challenge } = await service.issueChallenge(
      DEVICE_ID,
      TEAM_ID,
    )
    const relayedPayload = [...canonicalPayload(challenge)]
    relayedPayload[4] = 'qss-server-b'
    const signatureForB = signatures.sign(
      relayedPayload,
      registeredKeys.secretKey,
      NSE_AUTH_SIGNATURE_CONTEXT,
    )
    await expect(
      service.verifyAndIssueToken(challengeId, DEVICE_ID, signatureForB),
    ).rejects.toThrow('Invalid signature')
  })

  it('requires a canonical 64-byte Base58 signature', async () => {
    const { challengeId } = await service.issueChallenge(DEVICE_ID, TEAM_ID)
    await expect(
      service.verifyAndIssueToken(challengeId, DEVICE_ID, '111'),
    ).rejects.toThrow('Invalid signature encoding')
  })

  it('consumes a challenge atomically so only one concurrent redemption succeeds', async () => {
    const { challengeId, challenge } = await service.issueChallenge(
      DEVICE_ID,
      TEAM_ID,
    )
    const proof = sign(challenge)
    const results = await Promise.allSettled([
      service.verifyAndIssueToken(challengeId, DEVICE_ID, proof),
      service.verifyAndIssueToken(challengeId, DEVICE_ID, proof),
    ])
    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(
      1,
    )
  })

  it('expires challenges and bounds outstanding challenges per device', async () => {
    for (let index = 0; index < 5; index += 1)
      await service.issueChallenge(DEVICE_ID, TEAM_ID)
    await expect(service.issueChallenge(DEVICE_ID, TEAM_ID)).rejects.toThrow(
      'Too many outstanding challenges',
    )
    const now = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(now + NSE_AUTH_CHALLENGE_TTL_MS + 1)
    await expect(
      service.issueChallenge(DEVICE_ID, TEAM_ID),
    ).resolves.toBeDefined()
  })
})
