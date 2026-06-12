/**
 * Unit tests for AWSSecretsService
 */
import { jest } from '@jest/globals'
import type {
  CreateSecretCommand,
  CreateSecretCommandOutput,
  GetSecretValueCommand,
  GetSecretValueCommandOutput,
} from '@aws-sdk/client-secrets-manager'
import { AWSSecretsService } from './aws-secrets.service.js'
import { EnvVars } from '../config/env_vars.js'
import type { RedisClient } from '../../storage/redis/redis.client.js'

interface AWSSecretsServiceInternals {
  executeGetSecretValueCommandAws: (
    command: GetSecretValueCommand,
  ) => Promise<GetSecretValueCommandOutput>
  executeCreateSecretCommandAws: (
    command: CreateSecretCommand,
  ) => Promise<CreateSecretCommandOutput>
}

interface AwsTestError extends Error {
  code?: string
  $metadata?: {
    httpStatusCode?: number
  }
  $retryable?: {
    throttling?: boolean
  }
}

const makeAwsError = (
  name: string,
  options: {
    code?: string
    httpStatusCode?: number
    retryable?: boolean
  } = {},
): AwsTestError => {
  const error = new Error(name) as AwsTestError
  error.name = name
  error.code = options.code
  error.$metadata =
    options.httpStatusCode == null
      ? undefined
      : { httpStatusCode: options.httpStatusCode }
  error.$retryable =
    options.retryable === true ? { throttling: true } : undefined
  return error
}

const createService = (): AWSSecretsService =>
  new AWSSecretsService({ enabled: false } as unknown as RedisClient)

const getInternals = (service: AWSSecretsService): AWSSecretsServiceInternals =>
  service as unknown as AWSSecretsServiceInternals

describe('AWSSecretsService', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ENV: 'development',
      AWS_REGION: 'us-east-1',
      HCAPTCHA_SECRET_KEY: undefined,
    }
  })

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  describe('get', () => {
    it('returns undefined for missing AWS secrets', async () => {
      const service = createService()
      const getSecretSpy = jest
        .spyOn(getInternals(service), 'executeGetSecretValueCommandAws')
        .mockRejectedValueOnce(makeAwsError('ResourceNotFoundException'))

      await expect(service.get('missing-secret')).resolves.toBeUndefined()
      expect(getSecretSpy).toHaveBeenCalledTimes(1)
    })

    it('retries retryable AWS failures and throws after attempts are exhausted', async () => {
      const service = createService()
      const throttlingError = makeAwsError('ThrottlingException', {
        httpStatusCode: 429,
        retryable: true,
      })
      const getSecretSpy = jest
        .spyOn(getInternals(service), 'executeGetSecretValueCommandAws')
        .mockRejectedValue(throttlingError)

      await expect(service.get('throttled-secret')).rejects.toThrow(
        throttlingError,
      )
      expect(getSecretSpy).toHaveBeenCalledTimes(3)
    })

    it('returns the secret when a retry succeeds', async () => {
      const service = createService()
      const getSecretSpy = jest
        .spyOn(getInternals(service), 'executeGetSecretValueCommandAws')
        .mockRejectedValueOnce(
          makeAwsError('InternalServiceError', { httpStatusCode: 500 }),
        )
        .mockResolvedValueOnce({ SecretString: 'retrieved-secret' })

      await expect(service.get('eventual-secret')).resolves.toBe(
        'retrieved-secret',
      )
      expect(getSecretSpy).toHaveBeenCalledTimes(2)
    })

    it('throws access denied errors without treating them as missing secrets', async () => {
      const service = createService()
      const accessDeniedError = makeAwsError('AccessDeniedException', {
        httpStatusCode: 403,
      })
      const getSecretSpy = jest
        .spyOn(getInternals(service), 'executeGetSecretValueCommandAws')
        .mockRejectedValueOnce(accessDeniedError)

      await expect(service.get('forbidden-secret')).rejects.toThrow(
        accessDeniedError,
      )
      expect(getSecretSpy).toHaveBeenCalledTimes(1)
    })

    it('throws configuration errors without retrying', async () => {
      const service = createService()
      const configError = makeAwsError('UnrecognizedClientException', {
        httpStatusCode: 400,
      })
      const getSecretSpy = jest
        .spyOn(getInternals(service), 'executeGetSecretValueCommandAws')
        .mockRejectedValueOnce(configError)

      await expect(service.get('config-error-secret')).rejects.toThrow(
        configError,
      )
      expect(getSecretSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('getSecretEnvVar', () => {
    it('caches retrieved hCaptcha env secrets within the TTL', async () => {
      const service = createService()
      const getSecretSpy = jest
        .spyOn(getInternals(service), 'executeGetSecretValueCommandAws')
        .mockResolvedValue({ SecretString: '{"secret":"hcaptcha-secret"}' })

      await expect(
        service.getSecretEnvVar(EnvVars.HCAPTCHA_SECRET_KEY),
      ).resolves.toBe('hcaptcha-secret')
      await expect(
        service.getSecretEnvVar(EnvVars.HCAPTCHA_SECRET_KEY),
      ).resolves.toBe('hcaptcha-secret')

      expect(getSecretSpy).toHaveBeenCalledTimes(1)
    })

    it('updates cached env secrets when matching AWS secrets are created', async () => {
      const service = createService()
      const getSecretSpy = jest
        .spyOn(getInternals(service), 'executeGetSecretValueCommandAws')
        .mockResolvedValueOnce({ SecretString: '{"secret":"old-secret"}' })
      const createSecretSpy = jest
        .spyOn(getInternals(service), 'executeCreateSecretCommandAws')
        .mockResolvedValueOnce({})

      await expect(
        service.getSecretEnvVar(EnvVars.HCAPTCHA_SECRET_KEY),
      ).resolves.toBe('old-secret')

      await service.create('DEV_HCAPTCHA_SECRET_KEY', '{"secret":"new-secret"}')

      await expect(
        service.getSecretEnvVar(EnvVars.HCAPTCHA_SECRET_KEY),
      ).resolves.toBe('new-secret')
      expect(getSecretSpy).toHaveBeenCalledTimes(1)
      expect(createSecretSpy).toHaveBeenCalledTimes(1)
    })
  })
})
