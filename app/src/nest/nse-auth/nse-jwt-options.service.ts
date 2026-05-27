import { Injectable } from '@nestjs/common'
import { JwtModuleOptions, JwtOptionsFactory } from '@nestjs/jwt'
import { randomBytes } from 'node:crypto'
import { createLogger } from '../app/logger/logger.js'
import { AWSSecretsService } from '../utils/aws/aws-secrets.service.js'
import { EnvVars } from '../utils/config/env_vars.js'

const logger = createLogger('NseAuth:JwtOptions')

@Injectable()
export class NseJwtOptionsService implements JwtOptionsFactory {
  private fallbackSecret: string | undefined

  constructor(private readonly awsSecretsService: AWSSecretsService) {}

  public async createJwtOptions(): Promise<JwtModuleOptions> {
    const secret =
      (await this.awsSecretsService.getSecretEnvVar(EnvVars.NSE_JWT_SECRET)) ??
      this.getFallbackSecret()

    return {
      secret,
      signOptions: { expiresIn: 900 },
    }
  }

  private getFallbackSecret(): string {
    if (this.fallbackSecret == null) {
      logger.warn(
        'NSE_JWT_SECRET not set — tokens will be invalid after process restart',
      )
      this.fallbackSecret = randomBytes(32).toString('base64url')
    }

    return this.fallbackSecret
  }
}
