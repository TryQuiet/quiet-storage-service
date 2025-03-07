import { Controller, Get } from '@nestjs/common'
import {
  HealthCheckService,
  HealthCheck,
  MikroOrmHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus'

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgresHealth: MikroOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  public async check(): Promise<HealthCheckResult> {
    return await this.health.check([
      async () =>
        await this.postgresHealth.pingCheck('postgres', { timeout: 2_000 }),
    ])
  }
}
