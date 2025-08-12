/**
 * AWS secrets manager wrapper service
 */
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
  /**
   * AWS region string we are connecting to
   */
  private readonly awsRegion: string | undefined
  /**
   * True if we are initializing this service in a local environment
   */
  private readonly local: boolean
  /**
   * Configuration for connecting to the AWS secrets manager
   */
  private readonly clientConfig: SecretsManagerClientConfig | undefined

  private readonly logger = createLogger(`Utils:${AWSSecretsService.name}`)

  /**
   * @param redisClient Redis client for local instances
   */
  constructor(private readonly redisClient: RedisClient) {
    this.logger.log(`Creating ${AWSSecretsService.name}`)
    this.awsRegion = ConfigService.getString(EnvVars.AWS_REGION)
    // check if we are configured for a non-local environment
    if (
      [Environment.Development, Environment.Production].includes(
        ConfigService.getEnv(),
      )
    ) {
      this.local = false
      this.logger.warn(
        `Creating ${ConfigService.getEnv()} ${AWSSecretsService.name}`,
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

  /**
   * Get a secret by name from the AWS secrets manager
   *
   * @param secretName Secret to retrieve
   * @returns Retrieved encrypted secret value
   */
  public async get(
    secretName: string,
  ): Promise<string | Uint8Array | undefined | null> {
    try {
      // if local fetch the secret from Redis and return
      if (this.local) {
        return await this.redisClient.get(secretName)
      }

      // generate the AWS secrets manager command and fetch
      const commandInput: GetSecretValueCommandInput = {
        SecretId: secretName,
      }
      const command = new GetSecretValueCommand(commandInput)
      const response: GetSecretValueCommandOutput =
        await this.executeCommandAws(command)
      return response.SecretString ?? response.SecretBinary
    } catch (e) {
      this.logger.error('Error retrieving secret from AWS', e)
      return undefined
    }
  }

  /**
   * Insert a secret by name into the AWS secrets manager
   *
   * @param secretName Secret name we are inserting
   * @param secret Encrypted secret to insert
   */
  public async put(
    secretName: string,
    secret: string | Uint8Array,
  ): Promise<void> {
    try {
      // if local add the secret to Redis and return
      if (this.local) {
        await this.redisClient.set(secretName, secret)
        return
      }

      // generate the AWS secrets command and insert the secret
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

  /**
   * Close the Redis client, if applicable
   */
  public async close(): Promise<void> {
    if (this.redisClient.enabled) {
      await this.redisClient.close()
    }
  }

  /**
   * Execute a command in the AWS secrets manager and return result
   *
   * @param command AWS secrets manager command object
   * @returns Result of command
   */
  private async executeCommandAws(command: any): Promise<ServiceOutputTypes> {
    if (this.clientConfig == null) {
      throw new Error(`Must configure a client config to use the AWS SDK`)
    }
    const client = new SecretsManagerClient(this.clientConfig)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- the actual type here is weird
    return await client.send(command)
  }
}
