import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
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
  issueChallenge(@Body() body: { deviceId: string; teamId: string }): {
    challengeId: string
    challenge: ChallengePayload
  } {
    logger.debug(`Challenge request from device ${body.deviceId}`)
    return this.nseAuthService.issueChallenge(body.deviceId, body.teamId)
  }

  /**
   * POST /nse-auth/token
   * Body: { challengeId: string; deviceId: string; proof: { signature: string; publicKey: string } }
   * Returns: { token: string; expiresIn: number }
   */
  @Post('token')
  async verifyAndIssueToken(
    @Body()
    body: {
      challengeId: string
      deviceId: string
      proof: { signature: string; publicKey: string }
    },
  ): Promise<{ token: string; expiresIn: number }> {
    logger.debug(`Token request for device ${body.deviceId}`)
    return await this.nseAuthService.verifyAndIssueToken(
      body.challengeId,
      body.deviceId,
      body.proof,
    )
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
