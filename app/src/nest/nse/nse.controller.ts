import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import {
  NseAuthService,
  type NseLogEntriesResponse,
  type ChallengePayload,
} from './nse-auth.service.js'
import { NseJwtAuthGuard } from './nse-jwt-auth.guard.js'
import { createLogger } from '../app/logger/logger.js'
import { LogEntrySyncStorageService } from '../communities/storage/log-entry-sync.storage.service.js'

const logger = createLogger('NseAuth:Controller')

@Controller('nse-auth')
export class NseAuthController {
  constructor(
    private readonly nseAuthService: NseAuthService,
    private readonly logEntrySyncStorage: LogEntrySyncStorageService,
  ) {}

  /**
   * POST /nse-auth/challenge
   * Body: { deviceId: string; teamId: string }
   * Returns: { challengeId: string; challenge: ChallengePayload }
   */
  @Post('challenge')
  async issueChallenge(
    @Body() body: Record<string, unknown>,
    @Req() request: { ip?: string },
  ): Promise<{
    challengeId: string
    challenge: ChallengePayload
  }> {
    this.requireExactBody(body, ['deviceId', 'teamId'])
    if (typeof body.deviceId !== 'string' || typeof body.teamId !== 'string') {
      throw new UnauthorizedException('Invalid challenge request')
    }
    logger.debug(`Challenge request from device ${body.deviceId}`)
    return await this.nseAuthService.issueChallenge(
      body.deviceId,
      body.teamId,
      request.ip ?? 'unknown',
    )
  }

  /**
   * POST /nse-auth/token
   * Body: { challengeId: string; deviceId: string; signature: string }
   * Returns: { token: string; expiresIn: number }
   */
  @Post('token')
  async verifyAndIssueToken(
    @Body()
    body: Record<string, unknown>,
  ): Promise<{ token: string; expiresIn: number }> {
    this.requireExactBody(body, ['challengeId', 'deviceId', 'signature'])
    if (
      typeof body.challengeId !== 'string' ||
      typeof body.deviceId !== 'string' ||
      typeof body.signature !== 'string'
    ) {
      throw new UnauthorizedException('Invalid token request')
    }
    logger.debug(`Token request for device ${body.deviceId}`)
    return await this.nseAuthService.verifyAndIssueToken(
      body.challengeId,
      body.deviceId,
      body.signature,
    )
  }

  private requireExactBody(
    body: Record<string, unknown>,
    expectedKeys: string[],
  ): void {
    const actual = Object.keys(body).sort()
    if (
      actual.length !== expectedKeys.length ||
      !expectedKeys.sort().every((key, index) => actual[index] === key)
    ) {
      throw new UnauthorizedException('Unexpected request schema')
    }
  }

  /**
   * GET /nse-auth/logs/:teamId?afterSeq=<seq>
   * Requires Authorization: Bearer <jwt>
   * Returns: { entries: NseLogEntry[], resolvedAfterSeq: number }
   */
  @UseGuards(NseJwtAuthGuard)
  @Get('logs/:teamId')
  async getLogEntries(
    @Param('teamId') teamId: string,
    @Query('afterSeq') afterSeq: string,
    @Query('since') since: string,
    @Request() req: { user: { teamId: string } },
  ): Promise<NseLogEntriesResponse> {
    // Extra guard: the JWT teamId must match the path param
    if (req.user.teamId !== teamId) {
      throw new UnauthorizedException('Token teamId does not match path')
    }
    logger.debug(
      `Log entries request for team ${teamId} afterSeq ${afterSeq} since ${since}`,
    )
    const parsedAfterSeq = afterSeq !== '' ? parseInt(afterSeq, 10) : NaN
    const afterSeqNum = Number.isNaN(parsedAfterSeq)
      ? undefined
      : parsedAfterSeq
    const parsedSince = since !== '' ? parseInt(since, 10) : NaN
    const sinceMs = Number.isNaN(parsedSince) ? undefined : parsedSince
    const resolvedAfterSeq =
      afterSeqNum ??
      (await this.logEntrySyncStorage.resolveSyncSeqForTimestamp(
        teamId,
        sinceMs ?? 0,
      ))
    const entries = await this.logEntrySyncStorage.getLogEntriesForCommunity(
      teamId,
      resolvedAfterSeq,
    )

    if (entries == null) {
      logger.debug(
        `No log entries found for team ${teamId} afterSeq ${afterSeq} since ${since}`,
      )
      return { entries: [], resolvedAfterSeq }
    }

    logger.debug(
      `Found ${entries.length} log entries for team ${teamId} afterSeq ${afterSeq} since ${since}, resolvedAfterSeq ${resolvedAfterSeq}`,
    )
    return {
      entries: entries.map(e => ({
        cid: e.cid,
        hashedDbId: e.hashedDbId,
        communityId: e.communityId,
        entry: { type: 'Buffer' as const, data: Array.from(e.entry) },
        receivedAt: e.receivedAt.toUTC().toISO() ?? '',
        syncSeq: e.syncSeq ?? 0,
      })),
      resolvedAfterSeq,
    }
  }
}
