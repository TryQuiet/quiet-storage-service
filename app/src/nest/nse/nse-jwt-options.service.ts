import { Injectable } from '@nestjs/common'
import { JwtModuleOptions, JwtOptionsFactory } from '@nestjs/jwt'
import { createLogger } from '../app/logger/logger.js'
import { AWSSecretsService } from '../utils/aws/aws-secrets.service.js'
import { EnvVars } from '../utils/config/env_vars.js'

const logger = createLogger('NseAuth:JwtOptions')

@Injectable()
export class NseJwtOptionsService implements JwtOptionsFactory {
  constructor(private readonly awsSecretsService: AWSSecretsService) {}

  public async createJwtOptions(): Promise<JwtModuleOptions> {
    // No fallback: the JWT signing secret must come from the secrets manager. A
    // generated fallback would silently rotate the signing key (invalidating all
    // previously issued tokens) and mask a misconfigured or unreachable backend,
    // so a missing or unavailable secret fails loudly instead.
    const secret = await this.awsSecretsService.getSecretEnvVar(
      EnvVars.NSE_JWT_SECRET,
    )
    if (secret == null) {
      logger.error('NSE_JWT_SECRET is not configured')
      throw new Error('NSE_JWT_SECRET is not configured')
    }

    return {
      secret,
      signOptions: { expiresIn: 900 },
    }
  }
}
