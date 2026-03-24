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
  type NseLogEntry,
  type ChallengePayload,
} from './nse-auth.service.js'
import { NseJwtAuthGuard } from './nse-jwt-auth.guard.js'
import { createLogger } from '../app/logger/logger.js'

const logger = createLogger('NseAuth:Controller')

@Controller('nse-auth')
export class NseAuthController {
  constructor(private readonly nseAuthService: NseAuthService) {}

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
   * GET /nse-auth/logs/:teamId?since=<ms>
   * Requires Authorization: Bearer <jwt>
   * Returns: { entries: NseLogEntry[] }
   */
  @UseGuards(NseJwtAuthGuard)
  @Get('logs/:teamId')
  async getLogEntries(
    @Param('teamId') teamId: string,
    @Query('since') since: string,
    @Request() req: { user: { teamId: string } },
  ): Promise<{ entries: NseLogEntry[] }> {
    // Extra guard: the JWT teamId must match the path param
    if (req.user.teamId !== teamId) {
      throw new UnauthorizedException('Token teamId does not match path')
    }
    const sinceMs = since != null && since !== '' ? parseInt(since, 10) : 0
    const entries = await this.nseAuthService.getLogEntriesSince(
      teamId,
      sinceMs,
    )
    return { entries }
  }
}
