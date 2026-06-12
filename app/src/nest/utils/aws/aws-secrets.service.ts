/**
 * AWS secrets manager wrapper service
 */
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  GetSecretValueCommandInput,
  GetSecretValueCommandOutput,
  SecretsManagerClientConfig,
  CreateSecretCommandInput,
  CreateSecretCommand,
  CreateSecretCommandOutput,
} from '@aws-sdk/client-secrets-manager'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '../config/config.service.js'
import { EnvVars } from '../config/env_vars.js'
import { createLogger } from '../../app/logger/logger.js'
import { CompoundError } from '../errors.js'
import { isUint8Array } from 'util/types'
import { setTimeout as sleep } from 'node:timers/promises'
import { Environment } from '../config/types.js'
import { RedisClient } from '../../storage/redis/redis.client.js'

const GET_SECRET_MAX_ATTEMPTS = 3
const GET_SECRET_RETRY_DELAY_MS = 100
const ENV_SECRET_CACHE_TTL_MS = 5 * 60 * 1000

interface CachedSecretEnvVar {
  value: string
  expiresAt: number
}

interface AwsErrorShape {
  name?: string
  code?: string
  message?: string
  $metadata?: {
    httpStatusCode?: number
  }
  $retryable?: unknown
}

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
   * AWS Secrets Manager client for non-local environments
   */
  private readonly client: SecretsManagerClient | undefined

  private readonly logger = createLogger(`Utils:${AWSSecretsService.name}`)

  private readonly secretEnvVarCache = new Map<string, CachedSecretEnvVar>()

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

      const clientConfig: SecretsManagerClientConfig = {
        region: this.awsRegion,
      }
      this.client = new SecretsManagerClient(clientConfig)
    } else {
      this.local = true
      this.client = undefined
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
  ): Promise<string | Uint8Array | undefined> {
    // if local fetch the secret from Redis and return
    if (this.local) {
      return (await this.redisClient.get(secretName)) ?? undefined
    }

    // generate the AWS secrets manager command and fetch
    const commandInput: GetSecretValueCommandInput = {
      SecretId: secretName,
    }
    const command = new GetSecretValueCommand(commandInput)
    let lastError: Error | undefined
    for (let attempt = 1; attempt <= GET_SECRET_MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.executeGetSecretValueCommandAws(command)
        const secret = response.SecretString ?? response.SecretBinary
        if (secret == null) {
          throw new Error(
            `Secret ${secretName} was found but did not include a secret value`,
          )
        }
        return secret
      } catch (e) {
        if (AWSSecretsService.isSecretNotFoundError(e)) {
          return undefined
        }

        lastError = AWSSecretsService.normalizeError(e)
        if (
          attempt < GET_SECRET_MAX_ATTEMPTS &&
          AWSSecretsService.isRetryableGetSecretError(e)
        ) {
          this.logger.warn(
            `Retrying AWS secret retrieval after attempt ${attempt} failed`,
            e,
          )
          await sleep(GET_SECRET_RETRY_DELAY_MS)
          continue
        }

        this.logger.error('Error retrieving secret from AWS', e)
        throw lastError
      }
    }

    throw lastError ?? new Error('Error retrieving secret from AWS')
  }

  public async getSecretEnvVar(
    secretName: string,
    useEnvScopedName = true,
  ): Promise<string | undefined> {
    const env = ConfigService.getEnv()
    if ([Environment.Local, Environment.Test].includes(env)) {
      return ConfigService.getString(secretName)
    }
    const envScopedSecretName = useEnvScopedName
      ? `${ConfigService.getString(EnvVars.ENV)?.toLowerCase() === 'development' ? 'DEV' : 'PROD'}_${secretName}`
      : secretName
    const cachedSecret = this.getCachedSecretEnvVar(envScopedSecretName)
    if (cachedSecret != null) {
      return cachedSecret
    }

    const secret = await this.get(envScopedSecretName)
    let secretString =
      secret == null ? undefined : AWSSecretsService.parseSecretString(secret)
    if (secretString == null) {
      const localSecret = ConfigService.getString(secretName)
      if (localSecret == null) {
        this.logger.error(
          `Secret ${secretName} not found in AWS secrets manager or local environment variables!`,
        )
        return undefined
      }
      secretString = localSecret
    }
    this.setCachedSecretEnvVar(envScopedSecretName, secretString)
    return secretString
  }

  /**
   * Insert a secret by name into the AWS secrets manager
   *
   * @param secretName Secret name we are inserting
   * @param secret Encrypted secret to insert
   */
  public async create(
    secretName: string,
    secret: string | Uint8Array,
  ): Promise<void> {
    try {
      // if local add the secret to Redis and return
      if (this.local) {
        await this.redisClient.set(secretName, secret)
        this.updateCachedSecretEnvVar(secretName, secret)
        return
      }

      // generate the AWS secrets command and insert the secret
      const commandInput: CreateSecretCommandInput = {
        Name: secretName,
      }
      if (typeof secret === 'string') {
        commandInput.SecretString = secret
      } else if (isUint8Array(secret)) {
        commandInput.SecretBinary = secret
      } else {
        throw new Error(`Secret must be a string or Uint8Array!`)
      }

      const command = new CreateSecretCommand(commandInput)
      await this.executeCreateSecretCommandAws(command)
      this.updateCachedSecretEnvVar(secretName, secret)
    } catch (e) {
      this.logger.error('Error putting secret:', e)
      throw new CompoundError(
        'Error putting secret into AWS',
        AWSSecretsService.normalizeError(e),
      )
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

  private static parseSecretString(
    secret: string | Uint8Array,
  ): string | undefined {
    const rawSecret =
      typeof secret === 'string' ? secret : Buffer.from(secret).toString()

    try {
      const parsedSecret: unknown = JSON.parse(rawSecret)
      if (typeof parsedSecret === 'string') {
        return parsedSecret
      }
      if (AWSSecretsService.isSecretPayload(parsedSecret)) {
        return parsedSecret.secret
      }
      return undefined
    } catch {
      return rawSecret
    }
  }

  private static isSecretPayload(value: unknown): value is { secret: string } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'secret' in value &&
      typeof value.secret === 'string'
    )
  }

  private static isSecretNotFoundError(error: unknown): boolean {
    const awsError = AWSSecretsService.toAwsErrorShape(error)
    return (
      awsError.name === 'ResourceNotFoundException' ||
      awsError.code === 'ResourceNotFoundException' ||
      awsError.$metadata?.httpStatusCode === 404
    )
  }

  private static isRetryableGetSecretError(error: unknown): boolean {
    const awsError = AWSSecretsService.toAwsErrorShape(error)
    const errorName = awsError.name ?? awsError.code
    const statusCode = awsError.$metadata?.httpStatusCode

    if (
      statusCode != null &&
      (statusCode === 408 || statusCode === 429 || statusCode >= 500)
    ) {
      return true
    }
    if (awsError.$retryable != null) {
      return true
    }
    if (
      errorName != null &&
      [
        'InternalServiceError',
        'InternalServiceErrorException',
        'ServiceUnavailableException',
        'ThrottlingException',
        'TooManyRequestsException',
        'TimeoutError',
        'TimeoutException',
        'RequestTimeout',
        'NetworkingError',
        'NetworkError',
      ].includes(errorName)
    ) {
      return true
    }

    const errorMessage = awsError.message?.toLowerCase()
    return (
      errorMessage?.includes('timeout') === true ||
      errorMessage?.includes('network') === true ||
      errorMessage?.includes('socket hang up') === true ||
      errorMessage?.includes('econnreset') === true
    )
  }

  private static toAwsErrorShape(error: unknown): AwsErrorShape {
    if (typeof error !== 'object' || error === null) {
      return {}
    }
    return error as AwsErrorShape
  }

  private static normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error
    }
    return new Error(
      typeof error === 'string' ? error : 'Unknown AWS secrets service error',
    )
  }

  private getCachedSecretEnvVar(secretName: string): string | undefined {
    const cachedSecret = this.secretEnvVarCache.get(secretName)
    if (cachedSecret == null) {
      return undefined
    }
    if (cachedSecret.expiresAt <= Date.now()) {
      this.secretEnvVarCache.delete(secretName)
      return undefined
    }
    return cachedSecret.value
  }

  private setCachedSecretEnvVar(secretName: string, secret: string): void {
    this.secretEnvVarCache.set(secretName, {
      value: secret,
      expiresAt: Date.now() + ENV_SECRET_CACHE_TTL_MS,
    })
  }

  private updateCachedSecretEnvVar(
    secretName: string,
    secret: string | Uint8Array,
  ): void {
    const secretString = AWSSecretsService.parseSecretString(secret)
    if (secretString == null) {
      this.secretEnvVarCache.delete(secretName)
      return
    }
    this.setCachedSecretEnvVar(secretName, secretString)
  }

  private getAwsClient(): SecretsManagerClient {
    if (this.client == null) {
      throw new Error(`Must configure a client config to use the AWS SDK`)
    }
    return this.client
  }

  private async executeGetSecretValueCommandAws(
    command: GetSecretValueCommand,
  ): Promise<GetSecretValueCommandOutput> {
    return await this.getAwsClient().send(command)
  }

  private async executeCreateSecretCommandAws(
    command: CreateSecretCommand,
  ): Promise<CreateSecretCommandOutput> {
    return await this.getAwsClient().send(command)
  }
}
