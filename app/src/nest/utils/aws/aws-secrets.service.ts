import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
  GetSecretValueCommandInput,
  PutSecretValueCommandInput,
  GetSecretValueCommandOutput,
  ServiceOutputTypes,
  SecretsManagerClientConfig,
} from '@aws-sdk/client-secrets-manager'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '../config/config.service.js'
import { EnvVars } from '../config/env_vars.js'
import { createLogger } from '../../app/logger/logger.js'
import { CompoundError } from '../../types.js'
import { isUint8Array } from 'util/types'
import { Environment } from '../config/types.js'
import { RedisClient } from '../../storage/redis/redis.client.js'

@Injectable()
export class AWSSecretsService {
  private readonly awsRegion: string | undefined
  private readonly local: boolean
  private readonly clientConfig: SecretsManagerClientConfig | undefined

  private readonly logger = createLogger(`Utils:${AWSSecretsService.name}`)

  constructor(
    private readonly configService: ConfigService,
    private readonly redisClient: RedisClient,
  ) {
    this.logger.log(`Creating ${AWSSecretsService.name}`)
    this.awsRegion = this.configService.getString(EnvVars.AWS_REGION)
    if (
      [Environment.Development, Environment.Production].includes(
        this.configService.getEnv(),
      )
    ) {
      this.local = false
      this.logger.warn(
        `Creating ${this.configService.getEnv()} ${AWSSecretsService.name}`,
      )
      if (this.awsRegion == null) {
        throw new Error(
          `Must add AWS_REGION to the environment config to use AWS secrets in a non-local environment!`,
        )
      }

      this.clientConfig = {
        region: this.awsRegion,
      }
    } else {
      this.local = true
      this.logger.warn(`Creating local ${AWSSecretsService.name}`)
      if (!this.redisClient.enabled) {
        throw new Error(
          `Must configure a local redis instance to use ${AWSSecretsService.name} locally!`,
        )
      }
    }
  }

  public async get(
    secretName: string,
  ): Promise<string | Uint8Array | undefined | null> {
    try {
      if (this.local) {
        return await this.redisClient.get(secretName)
      }

      const commandInput: GetSecretValueCommandInput = {
        SecretId: secretName,
      }
      const command = new GetSecretValueCommand(commandInput)
      const response: GetSecretValueCommandOutput =
        await this.executeCommandAws(command)
      return response.SecretString ?? response.SecretBinary
    } catch (e) {
      this.logger.error('Error retrieving secret:', e)
      throw new CompoundError('Error getting secret from AWS', e as Error)
    }
  }

  public async put(
    secretName: string,
    secret: string | Uint8Array,
  ): Promise<void> {
    try {
      if (this.local) {
        await this.redisClient.set(secretName, secret)
        return
      }

      const commandInput: PutSecretValueCommandInput = {
        SecretId: secretName,
      }
      if (typeof secret === 'string') {
        commandInput.SecretString = secret
      } else if (isUint8Array(secret)) {
        commandInput.SecretBinary = secret
      } else {
        throw new Error(`Secret must be a string or Uint8Array!`)
      }

      const command = new PutSecretValueCommand(commandInput)
      await this.executeCommandAws(command)
    } catch (e) {
      this.logger.error('Error putting secret:', e)
      throw new CompoundError('Error putting secret into AWS', e as Error)
    }
  }

  private async executeCommandAws(command: any): Promise<ServiceOutputTypes> {
    if (this.clientConfig == null) {
      throw new Error(`Must configure a client config to use the AWS SDK`)
    }
    const client = new SecretsManagerClient(this.clientConfig)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- the actual type here is weird
    return await client.send(command)
  }
}
