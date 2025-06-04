/**
 * REST controller for health check requests
 */
import { Controller, Get } from '@nestjs/common'
import {
  HealthCheckService,
  HealthCheck,
  MikroOrmHealthIndicator,
  HealthCheckResult,
  HealthIndicatorResult,
  HealthIndicatorFunction,
} from '@nestjs/terminus'
import { createLogger } from '../../app/logger/logger.js'

// associate with the /health path prefix
@Controller('health')
export class HealthController {
  private readonly logger = createLogger(HealthController.name)

  constructor(
    private readonly health: HealthCheckService,
    private readonly postgresHealth: MikroOrmHealthIndicator,
  ) {}

  /**
   * Check health of this QSS instance
   *
   * @returns Health check data
   */
  @Get()
  @HealthCheck()
  public async check(): Promise<HealthCheckResult> {
    return await this.health.check([this.postgresCheck()])
  }

  /**
   * Check postgres connection health
   *
   * @returns Postgres health data
   */
  private postgresCheck(): HealthIndicatorFunction {
    const check = async (): Promise<HealthIndicatorResult<'postgres'>> => {
      try {
        return await this.postgresHealth.pingCheck('postgres', {
          timeout: 2_000,
        })
      } catch (e) {
        this.logger.error(`Error while getting postgres health`, e)
        return {
          postgres: {
            status: 'down',
            message: 'Error while getting postgres health',
          },
        }
      }
    }
    return check
  }
}
