/**
 * UCAN service for QPS (Quiet Push Service)
 *
 * Handles creation and validation of UCAN tokens for push notification authorization.
 * UCANs are self-issued by QPS and contain the device token as a capability resource.
 */
import { Injectable, OnModuleInit } from '@nestjs/common'
import * as ucans from '@ucans/ucans'
import { createLogger } from '../../app/logger/logger.js'
import { AWSSecretsService } from '../../utils/aws/aws-secrets.service.js'
import { ConfigService } from '../../utils/config/config.service.js'
import { EnvironmentShort } from '../../utils/config/types.js'
import {
  type UcanValidationResult,
  type QpsPushCapability,
  UcanError,
  UcanErrorCode,
} from './ucan.types.js'

const QPS_SIGNING_KEY_SECRET_NAMES: Record<EnvironmentShort, string> = {
  [EnvironmentShort.Local]: 'qps/local-signing-key',
  [EnvironmentShort.Test]: 'qps/test-signing-key',
  [EnvironmentShort.Dev]: 'qps/dev-signing-key',
  [EnvironmentShort.Prod]: 'qps/prod-signing-key',
}

// Far-future expiration (year 9999) since Infinity serializes to null in JSON
const FAR_FUTURE_EXPIRATION = Math.floor(
  new Date('9999-12-31T23:59:59Z').getTime() / 1000,
)

@Injectable()
export class UcanService implements OnModuleInit {
  private keypair: ucans.EdKeypair | undefined
  private qpsDid: string | undefined

  private readonly logger = createLogger(UcanService.name)

  constructor(private readonly awsSecretsService: AWSSecretsService) {}

  async onModuleInit(): Promise<void> {
    await this.initializeKeypair()
  }

  public getDid(): string {
    if (this.qpsDid == null) {
      throw new UcanError(
        'QPS signing key not initialized',
        UcanErrorCode.KEY_NOT_INITIALIZED,
      )
    }
    return this.qpsDid
  }

  /**
   * Create a UCAN token for device registration
   */
  async createUcan(deviceToken: string, bundleId: string): Promise<string> {
    if (this.keypair == null || this.qpsDid == null) {
      throw new UcanError(
        'QPS signing key not initialized',
        UcanErrorCode.KEY_NOT_INITIALIZED,
      )
    }

    const ucan = await ucans.build({
      issuer: this.keypair,
      audience: this.qpsDid,
      expiration: FAR_FUTURE_EXPIRATION,
      capabilities: [
        {
          with: { scheme: 'fcm', hierPart: deviceToken },
          can: { namespace: 'push', segments: ['send'] },
        },
      ],
      facts: [{ bundleId }],
    })

    return ucans.encode(ucan)
  }

  /**
   * Validate a UCAN token and extract device token information
   */
  async validateUcan(token: string): Promise<UcanValidationResult> {
    if (this.qpsDid == null) {
      return {
        valid: false,
        error: 'QPS signing key not initialized',
      }
    }

    try {
      const parsed = ucans.parse(token)

      try {
        await ucans.validate(token)
      } catch (validationError) {
        this.logger.warn(`UCAN validation failed`, validationError)
        return {
          valid: false,
          error: 'Invalid UCAN signature or structure',
        }
      }

      // Verify the issuer is QPS (signature validation only checks it's valid, not who signed it)
      if (parsed.payload.iss !== this.qpsDid) {
        return {
          valid: false,
          error: 'UCAN must be issued by QPS',
        }
      }

      // Verify the audience is QPS (self-issued bearer token)
      if (parsed.payload.aud !== this.qpsDid) {
        return {
          valid: false,
          error: 'UCAN audience must be QPS',
        }
      }

      const capabilities = parsed.payload.att as QpsPushCapability[]

      if (capabilities.length !== 1) {
        return {
          valid: false,
          error: 'UCAN must contain exactly one capability',
        }
      }

      const cap = capabilities[0]

      if (cap.can.namespace !== 'push') {
        return {
          valid: false,
          error: 'UCAN capability must be in push namespace',
        }
      }
      if (cap.can.segments.length !== 1 || cap.can.segments[0] !== 'send') {
        return {
          valid: false,
          error: 'UCAN capability must be push/send',
        }
      }

      if (cap.with.scheme !== 'fcm') {
        return {
          valid: false,
          error: 'UCAN resource must use fcm:// scheme',
        }
      }

      const deviceToken = cap.with.hierPart
      const facts = parsed.payload.fct as Array<{ bundleId?: string }>
      const bundleId = facts?.[0]?.bundleId

      return {
        valid: true,
        deviceToken,
        bundleId,
      }
    } catch (error) {
      this.logger.error(`Error validating UCAN`, error)
      return {
        valid: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error validating UCAN',
      }
    }
  }

  private async initializeKeypair(): Promise<void> {
    const secretName = this.getSecretName()

    try {
      const existingSecret = await this.awsSecretsService.get(secretName)

      if (existingSecret != null && typeof existingSecret === 'string') {
        this.keypair = ucans.EdKeypair.fromSecretKey(existingSecret, {
          format: 'base64',
          exportable: true,
        })
        this.logger.log(`Loaded existing QPS signing key`)
      } else {
        this.keypair = await ucans.EdKeypair.create({ exportable: true })
        const secretKeyBase64 = await this.keypair.export('base64')
        await this.awsSecretsService.create(secretName, secretKeyBase64)
        this.logger.log(`Generated new QPS signing key`)
      }

      this.qpsDid = this.keypair.did()
      this.logger.log(`QPS DID: ${this.qpsDid}`)
    } catch (error) {
      this.logger.error(`Failed to initialize QPS signing keypair`, error)
      throw error
    }
  }

  private getSecretName(): string {
    return QPS_SIGNING_KEY_SECRET_NAMES[ConfigService.getEnvShort()]
  }
}
