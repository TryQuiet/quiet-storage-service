/**
 * NSE Auth service
 *
 * Issues challenges and JWT tokens for the iOS Notification Service Extension.
 * The NSE proves device identity by signing a challenge with its Ed25519 device key,
 * matching the @localfirst/auth identity protocol (msgpackr.pack + libsodium Ed25519).
 */
import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import {
  signatures,
  type Base58,
  type ServerWithSecrets,
} from '@localfirst/auth'
import { randomBytes } from 'node:crypto'
import { createLogger } from '../app/logger/logger.js'
import { CommunitiesManagerService } from '../communities/communities-manager.service.js'

const logger = createLogger('NseAuth:Service')

export const NSE_AUTH_PROTOCOL_VERSION = 1
export const NSE_AUTH_SIGNATURE_CONTEXT = 'quiet/qss-nse-auth/device-proof'
export const NSE_AUTH_CHALLENGE_TTL_MS = 30_000
export const NSE_AUTH_CLOCK_SKEW_MS = 5_000
const MAX_OUTSTANDING_CHALLENGES_PER_DEVICE = 5
const MAX_CHALLENGES_PER_IP_PER_MINUTE = 30

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

const base58Encode = (bytes: Uint8Array): string => {
  let result = ''
  const hexBytes = Buffer.from(bytes).toString('hex')
  let value = BigInt(`0x${hexBytes === '' ? '0' : hexBytes}`)
  while (value > 0n) {
    result = BASE58_ALPHABET[Number(value % 58n)] + result
    value /= 58n
  }
  for (const byte of bytes) {
    if (byte !== 0) break
    result = `1${result}`
  }
  return result
}

const base58Decode = (encoded: string): Uint8Array => {
  let value = 0n
  for (const character of encoded) {
    const digit = BASE58_ALPHABET.indexOf(character)
    if (digit < 0) throw new Error('Invalid base58 character')
    value = value * 58n + BigInt(digit)
  }
  const hex = value === 0n ? '' : value.toString(16).padStart(2, '0')
  const evenHex = hex.length % 2 === 0 ? hex : `0${hex}`
  const decoded = evenHex === '' ? [] : [...Buffer.from(evenHex, 'hex')]
  const leadingZeros = /^1*/.exec(encoded)?.[0].length ?? 0
  return new Uint8Array([...new Uint8Array(leadingZeros), ...decoded])
}

export interface ChallengePayload {
  protocolVersion: number
  type: string
  deviceId: string
  teamId: string
  qssServerId: string
  challengeId: string
  nonce: string
  issuedAtMs: number
  expiresAtMs: number
}

interface StoredChallenge {
  challenge: ChallengePayload
}

export interface NseLogEntry {
  cid: string
  hashedDbId: string
  communityId: string
  entry: { type: 'Buffer'; data: number[] }
  receivedAt: string
  syncSeq: number
}

export interface NseLogEntriesResponse {
  entries: NseLogEntry[]
  resolvedAfterSeq: number
}

@Injectable()
export class NseAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly challenges = new Map<string, StoredChallenge>()
  private readonly challengeRequestsByIp = new Map<string, number[]>()

  // Periodic cleanup so stale challenges don't accumulate between requests.
  private readonly cleanupInterval: ReturnType<typeof setInterval> =
    setInterval(
      () => {
        this.evictExpiredChallenges()
      },
      5 * 60 * 1000,
    )

  constructor(
    private readonly jwtService: JwtService,
    private readonly communitiesManager: CommunitiesManagerService,
  ) {}

  onModuleInit(): void {
    logger.log('NseAuthService initialized (libsodium ready)')
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval)
  }

  /**
   * Issue the exact v1, server-audience-bound challenge signed by native clients.
   */
  async issueChallenge(
    deviceId: string,
    teamId: string,
    sourceIp = 'unknown',
  ): Promise<{ challengeId: string; challenge: ChallengePayload }> {
    this.evictExpiredChallenges()
    this.enforceChallengeRateLimit(sourceIp)
    if (
      deviceId.length === 0 ||
      deviceId.length > 256 ||
      teamId.length === 0 ||
      teamId.length > 256
    ) {
      throw new UnauthorizedException('Invalid device or team identifier')
    }

    const community = await this.communitiesManager.get(teamId)
    if (community == null) {
      throw new UnauthorizedException('Unknown team')
    }
    const { team } = community.sigChain
    if (team.deviceWasRemoved(deviceId) || !team.hasDevice(deviceId)) {
      throw new UnauthorizedException('Unknown or removed device for team')
    }
    const outstanding = [...this.challenges.values()].filter(
      ({ challenge }) =>
        challenge.teamId === teamId && challenge.deviceId === deviceId,
    ).length
    if (outstanding >= MAX_OUTSTANDING_CHALLENGES_PER_DEVICE) {
      throw new UnauthorizedException('Too many outstanding challenges')
    }

    const challengeId = randomBytes(16).toString('hex')
    const issuedAtMs = Date.now()
    // The pinned auth package's generated declarations lose this concrete type.
    const qssServer = community.sigChain.context.server as ServerWithSecrets
    const { serverId: qssServerId } = qssServer
    const challenge: ChallengePayload = {
      protocolVersion: NSE_AUTH_PROTOCOL_VERSION,
      type: 'DEVICE',
      deviceId,
      teamId,
      qssServerId,
      challengeId,
      nonce: base58Encode(randomBytes(32)),
      issuedAtMs,
      expiresAtMs: issuedAtMs + NSE_AUTH_CHALLENGE_TTL_MS,
    }

    this.challenges.set(challengeId, { challenge })

    logger.debug(
      `Issued challenge ${challengeId} for device ${deviceId} team ${teamId}`,
    )
    return { challengeId, challenge }
  }

  /**
   * Verify the signed challenge proof and return a short-lived JWT.
   *
   * Proof convention follows @localfirst/crypto signatures.sign(): the v1
   * canonical tuple is packed with the NSE-specific context and signed by the
   * registered device key. No claimant-selected key material is accepted.
   */
  async verifyAndIssueToken(
    challengeId: string,
    deviceId: string,
    signature: string,
  ): Promise<{ token: string; expiresIn: number }> {
    if (
      challengeId.length !== 32 ||
      !/^[0-9a-f]{32}$/.test(challengeId) ||
      deviceId.length === 0 ||
      deviceId.length > 256 ||
      signature.length === 0 ||
      signature.length > 128
    ) {
      throw new UnauthorizedException('Invalid token request')
    }
    const stored = this.challenges.get(challengeId)
    if (stored == null || stored.challenge.expiresAtMs < Date.now()) {
      this.challenges.delete(challengeId)
      throw new UnauthorizedException('Challenge expired or not found')
    }

    if (stored.challenge.deviceId !== deviceId) {
      this.challenges.delete(challengeId)
      logger.warn(
        `Challenge device mismatch for challengeId ${challengeId}: expected ${stored.challenge.deviceId}, received ${deviceId}`,
      )
      throw new UnauthorizedException('Challenge does not belong to device')
    }

    // Consume immediately to prevent replay
    this.challenges.delete(challengeId)

    let sigBytes: Uint8Array
    try {
      sigBytes = base58Decode(signature)
      if (sigBytes.length !== 64 || base58Encode(sigBytes) !== signature) {
        throw new Error('Non-canonical or incorrectly sized signature')
      }
    } catch {
      throw new UnauthorizedException('Invalid signature encoding')
    }

    const expectedPubKey = await this.getRegisteredDeviceSignatureKey(
      stored.challenge.teamId,
      deviceId,
    )
    let valid = false
    try {
      const expectedKeyBytes = base58Decode(expectedPubKey)
      if (
        expectedKeyBytes.length !== 32 ||
        base58Encode(expectedKeyBytes) !== expectedPubKey
      ) {
        throw new Error(
          'Registered device key was non-canonical or incorrectly sized',
        )
      }
      valid = signatures.verify({
        payload: this.canonicalPayload(stored.challenge),
        signature: signature as Base58,
        publicKey: expectedPubKey,
        context: NSE_AUTH_SIGNATURE_CONTEXT,
      })
    } catch (error) {
      logger.warn(
        `Proof verification input was invalid for device ${deviceId}`,
        error,
      )
    }
    if (!valid) {
      logger.warn(
        `Signature verification failed for challengeId ${challengeId} device ${deviceId}`,
      )
      throw new UnauthorizedException('Invalid signature')
    }

    const expiresIn = 900 // 15 min
    const token = await this.jwtService.signAsync(
      { deviceId, teamId: stored.challenge.teamId },
      { expiresIn },
    )

    logger.log(
      `Issued JWT for device ${deviceId} team ${stored.challenge.teamId}`,
    )
    return { token, expiresIn }
  }

  private async getRegisteredDeviceSignatureKey(
    teamId: string,
    deviceId: string,
  ): Promise<Base58> {
    const community = await this.communitiesManager.get(teamId)
    if (community == null) {
      logger.warn(`No managed community found for team ${teamId}`)
      throw new UnauthorizedException('Unknown team')
    }

    const { team } = community.sigChain
    if (team.deviceWasRemoved(deviceId)) {
      logger.warn(
        `Removed device ${deviceId} attempted NSE auth for team ${teamId}`,
      )
      throw new UnauthorizedException('Device was removed from team')
    }

    if (!team.hasDevice(deviceId)) {
      logger.warn(
        `Unknown device ${deviceId} attempted NSE auth for team ${teamId}`,
      )
      throw new UnauthorizedException('Unknown device for team')
    }

    try {
      const device = team.device(deviceId) as { keys: { signature: string } }
      return device.keys.signature as Base58
    } catch (error) {
      logger.warn(
        `Failed to resolve registered device key for ${deviceId} on team ${teamId}`,
        error,
      )
      throw new UnauthorizedException('Unknown device for team')
    }
  }

  private evictExpiredChallenges(): void {
    const now = Date.now()
    for (const [id, stored] of this.challenges) {
      if (stored.challenge.expiresAtMs < now) this.challenges.delete(id)
    }
  }

  private canonicalPayload(challenge: ChallengePayload): unknown[] {
    return [
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
  }

  private enforceChallengeRateLimit(sourceIp: string): void {
    const now = Date.now()
    const recent = (this.challengeRequestsByIp.get(sourceIp) ?? []).filter(
      timestamp => now - timestamp < 60_000,
    )
    if (recent.length >= MAX_CHALLENGES_PER_IP_PER_MINUTE) {
      throw new UnauthorizedException('Challenge rate limit exceeded')
    }
    recent.push(now)
    this.challengeRequestsByIp.set(sourceIp, recent)
  }
}
