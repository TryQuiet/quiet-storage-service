import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '../config/config.service.js'
import { EnvVars } from '../config/env_vars.js'
import { createLogger } from '../../app/logger/logger.js'

@Injectable()
export class AWSSecretsService {
  private readonly awsRegion: string | undefined
  private readonly logger = createLogger(`Utils:${AWSSecretsService.name}`)

  constructor(private readonly configService: ConfigService) {
    this.awsRegion = configService.getString(EnvVars.AWS_REGION)
  }

  public async getSecret<T>(secretName: string): Promise<T | undefined> {
    if (this.awsRegion == null) {
      throw new Error(
        `Must add AWS_REGION to the environment config to access AWS secrets!`,
      )
    }

    const client = new SecretsManagerClient({ region: this.awsRegion })
    const command = new GetSecretValueCommand({ SecretId: secretName })

    try {
      const response = await client.send(command)
      return response.SecretString != null
        ? (JSON.parse(response.SecretString) as T)
        : undefined
    } catch (e) {
      this.logger.error('Error retrieving secret:', e)
      throw e as Error
    }
  }
}
