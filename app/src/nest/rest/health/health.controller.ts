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
import { ConfigService } from '../../utils/config/config.service.js'
import { EnvVars } from '../../utils/config/env_vars.js'
import { Environment } from '../../utils/config/types.js'
import { QPS_PUSH_RELAY_VERSION } from '../../qps/push/push-relay.types.js'

export function getQssCapabilities(): {
  qps: {
    payloadBinding: 'ucan-v1'
    pushCredentialIsolation:
      | typeof QPS_PUSH_RELAY_VERSION
      | 'development-direct'
      | 'unavailable'
  }
} {
  const env = ConfigService.getEnv()
  const relayConfigured =
    ConfigService.getString(EnvVars.QPS_PUSH_RELAY_FUNCTION_ARN) != null
  const networkEnvironment = [
    Environment.Development,
    Environment.Production,
  ].includes(env)

  return {
    qps: {
      payloadBinding: 'ucan-v1',
      pushCredentialIsolation: networkEnvironment
        ? relayConfigured
          ? QPS_PUSH_RELAY_VERSION
          : 'unavailable'
        : 'development-direct',
    },
  }
}

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
   * Stable, unauthenticated deployment capabilities used by release gates.
   * Values describe wire behavior, not whether an optional service is enabled.
   */
  @Get('capabilities')
  public capabilities(): ReturnType<typeof getQssCapabilities> {
    return getQssCapabilities()
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
