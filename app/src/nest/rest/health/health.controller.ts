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

@Controller('health')
export class HealthController {
  private readonly logger = createLogger(HealthController.name)

  constructor(
    private readonly health: HealthCheckService,
    private readonly postgresHealth: MikroOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  public async check(): Promise<HealthCheckResult> {
    return await this.health.check([this.postgresCheck()])
  }

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
