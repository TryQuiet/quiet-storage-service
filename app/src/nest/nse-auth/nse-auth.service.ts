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
import sodium from 'libsodium-wrappers-sumo'
import { pack } from 'msgpackr'
import { randomBytes } from 'node:crypto'
import { createLogger } from '../app/logger/logger.js'
import { LogEntrySyncStorageService } from '../communities/storage/log-entry-sync.storage.service.js'
import { CommunitiesManagerService } from '../communities/communities-manager.service.js'
import type { LogSyncEntry } from '../communities/types.js'

const logger = createLogger('NseAuth:Service')

const CHALLENGE_TTL_MS = 30_000

// Bitcoin base58 alphabet (same as @localfirst/crypto and the NSE's Base58 encoder)
const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(bytes: Uint8Array): string {
  let result = ''
  let n = BigInt('0x' + Buffer.from(bytes).toString('hex'))
  const base = BigInt(58)
  while (n > 0n) {
    result = BASE58_ALPHABET[Number(n % base)] + result
    n /= base
  }
  for (const b of bytes) {
    if (b === 0) result = '1' + result
    else break
  }
  return result
}

function base58Decode(s: string): Uint8Array {
  const alphabet: Record<string, number> = {}
  for (let i = 0; i < BASE58_ALPHABET.length; i++)
    alphabet[BASE58_ALPHABET[i]] = i

  let n = 0n
  for (const c of s) {
    const digit = alphabet[c]
    if (digit === undefined) throw new Error(`Invalid base58 character: ${c}`)
    n = n * 58n + BigInt(digit)
  }

  const hex = n.toString(16).padStart(2, '0')
  const padded = hex.length % 2 === 0 ? hex : '0' + hex
  const bytes = Buffer.from(padded, 'hex')

  let leadingZeros = 0
  for (const c of s) {
    if (c === '1') leadingZeros++
    else break
  }
  return new Uint8Array([...new Uint8Array(leadingZeros), ...bytes])
}

export interface ChallengePayload {
  type: string
  name: string
  nonce: string
  timestamp: number
}

interface StoredChallenge {
  challenge: ChallengePayload
  teamId: string
  expiry: number
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
  private sodiumReady = false

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
    private readonly logEntrySyncStorage: LogEntrySyncStorageService,
    private readonly communitiesManager: CommunitiesManagerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await sodium.ready
    this.sodiumReady = true
    logger.log('NseAuthService initialized (libsodium ready)')
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval)
  }

  /**
   * Issue a challenge for a device.  The challenge object mirrors the
   * @localfirst/auth `Challenge` type so the NSE can sign it with
   * msgpackr.pack + crypto_sign_detached (same as identity.prove()).
   */
  issueChallenge(
    deviceId: string,
    teamId: string,
  ): { challengeId: string; challenge: ChallengePayload } {
    this.evictExpiredChallenges()

    const challengeId = randomBytes(16).toString('hex')
    // nonce base58-encoded like @localfirst/crypto randomKey()
    const nonce = base58Encode(randomBytes(32))
    const challenge: ChallengePayload = {
      type: 'DEVICE',
      name: deviceId,
      nonce,
      timestamp: Date.now(),
    }

    this.challenges.set(challengeId, {
      challenge,
      teamId,
      expiry: Date.now() + CHALLENGE_TTL_MS,
    })

    logger.debug(
      `Issued challenge ${challengeId} for device ${deviceId} team ${teamId}`,
    )
    return { challengeId, challenge }
  }

  /**
   * Verify the signed challenge proof and return a short-lived JWT.
   *
   * Proof convention follows @localfirst/crypto signatures.sign():
   *   message   = msgpackr.pack(challengePayload)
   *   signature = base58-encoded 64-byte Ed25519 signature
   *   publicKey = base58-encoded 32-byte Ed25519 public key
   */
  async verifyAndIssueToken(
    challengeId: string,
    deviceId: string,
    proof: { signature: string; publicKey: string },
  ): Promise<{ token: string; expiresIn: number }> {
    if (!this.sodiumReady) {
      throw new UnauthorizedException('Crypto not ready')
    }

    const stored = this.challenges.get(challengeId)
    if (stored == null || stored.expiry < Date.now()) {
      this.challenges.delete(challengeId)
      throw new UnauthorizedException('Challenge expired or not found')
    }

    if (stored.challenge.name !== deviceId) {
      this.challenges.delete(challengeId)
      logger.warn(
        `Challenge device mismatch for challengeId ${challengeId}: expected ${stored.challenge.name}, received ${deviceId}`,
      )
      throw new UnauthorizedException('Challenge does not belong to device')
    }

    // Consume immediately to prevent replay
    this.challenges.delete(challengeId)

    // Decode base58 signature and public key
    let sigBytes: Uint8Array
    let pubKeyBytes: Uint8Array
    try {
      sigBytes = base58Decode(proof.signature)
      pubKeyBytes = base58Decode(proof.publicKey)
    } catch {
      throw new UnauthorizedException('Invalid base58 in proof')
    }

    const expectedPubKey = await this.getRegisteredDeviceSignatureKey(
      stored.teamId,
      deviceId,
    )

    let expectedPubKeyBytes: Uint8Array
    try {
      expectedPubKeyBytes = base58Decode(expectedPubKey)
    } catch {
      logger.error(
        `Registered device key for ${deviceId} on team ${stored.teamId} was not valid base58`,
      )
      throw new UnauthorizedException('Registered device key is invalid')
    }

    if (!Buffer.from(pubKeyBytes).equals(Buffer.from(expectedPubKeyBytes))) {
      logger.warn(
        `Proof public key mismatch for device ${deviceId} team ${stored.teamId}`,
      )
      throw new UnauthorizedException(
        'Proof key does not match registered device',
      )
    }

    // Re-derive the message bytes the NSE signed: msgpackr.pack(challengePayload)
    const messageBytes = pack(stored.challenge)

    const valid = sodium.crypto_sign_verify_detached(
      sigBytes,
      messageBytes,
      expectedPubKeyBytes,
    )
    if (!valid) {
      logger.warn(
        `Signature verification failed for challengeId ${challengeId} device ${deviceId}`,
      )
      throw new UnauthorizedException('Invalid signature')
    }

    const expiresIn = 900 // 15 min
    const token = await this.jwtService.signAsync(
      { deviceId, teamId: stored.teamId },
      { expiresIn },
    )

    logger.log(`Issued JWT for device ${deviceId} team ${stored.teamId}`)
    return { token, expiresIn }
  }

  private async getRegisteredDeviceSignatureKey(
    teamId: string,
    deviceId: string,
  ): Promise<string> {
    const community = await this.communitiesManager.get(teamId)
    if (community == null) {
      logger.warn(`No managed community found for team ${teamId}`)
      throw new UnauthorizedException('Unknown team')
    }

    const team = community.sigChain.team
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
      return device.keys.signature
    } catch (error) {
      logger.warn(
        `Failed to resolve registered device key for ${deviceId} on team ${teamId}`,
        error,
      )
      throw new UnauthorizedException('Unknown device for team')
    }
  }

  /**
   * Fetch log entries for a team since the given millisecond timestamp.
   * Caller must have already validated the JWT and matched the teamId.
   */
  async getLogEntriesAfterSeq(
    teamId: string,
    afterSeq?: number,
    legacySince?: number,
  ): Promise<NseLogEntriesResponse> {
    const resolvedAfterSeq =
      afterSeq ??
      (await this.logEntrySyncStorage.resolveSyncSeqForTimestamp(
        teamId,
        legacySince ?? 0,
      ))
    const entries: LogSyncEntry[] | undefined | null =
      await this.logEntrySyncStorage.getLogEntriesForCommunity(
        teamId,
        resolvedAfterSeq,
      )

    if (entries == null) {
      return { entries: [], resolvedAfterSeq }
    }

    return {
      entries: entries.map(e => ({
        cid: e.cid,
        hashedDbId: e.hashedDbId,
        communityId: e.communityId,
        // Serialize Buffer as Node.js JSON so the Swift Data decoder works:
        //   LogEntry.init(from:) decodes { "type": "Buffer", "data": [...] }
        entry: { type: 'Buffer' as const, data: Array.from(e.entry) },
        receivedAt: e.receivedAt.toUTC().toISO() ?? '',
        syncSeq: e.syncSeq ?? 0,
      })),
      resolvedAfterSeq,
    }
  }

  private evictExpiredChallenges(): void {
    const now = Date.now()
    for (const [id, stored] of this.challenges) {
      if (stored.expiry < now) this.challenges.delete(id)
    }
  }
}
