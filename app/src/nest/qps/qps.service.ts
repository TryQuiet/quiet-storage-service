/**
 * QPS (Quiet Push Service) main service
 *
 * Orchestrates device registration and push notification delivery via FCM.
 */
import { Injectable } from '@nestjs/common'
import { createLogger } from '../app/logger/logger.js'
import { UcanService } from './ucan/ucan.service.js'
import { PushService } from './push/push.service.js'
import { PushErrorCode } from './push/push.types.js'

/**
 * Result of a device registration
 */
export interface RegistrationResult {
  success: boolean
  ucan?: string
  error?: string
}

/**
 * Result of sending a push notification
 */
export interface SendPushResult {
  success: boolean
  error?: string
  tokenInvalid?: boolean
}

@Injectable()
export class QPSService {
  private readonly logger = createLogger(QPSService.name)

  constructor(
    private readonly ucanService: UcanService,
    private readonly pushService: PushService,
  ) {}

  /**
   * Register a device and return a UCAN for push authorization
   *
   * @param deviceToken The FCM device token
   * @param bundleId The app bundle identifier
   * @returns Registration result with UCAN token
   */
  async registerDevice(
    deviceToken: string,
    bundleId: string,
  ): Promise<RegistrationResult> {
    try {
      if (!this.pushService.isAvailable()) {
        this.logger.warn(`FCM is not available for registration`)
        return {
          success: false,
          error: 'Push notification service not available',
        }
      }

      const ucan = await this.ucanService.createUcan(deviceToken, bundleId)

      this.logger.log(`Device registered successfully`)
      return {
        success: true,
        ucan,
      }
    } catch (error) {
      this.logger.error(`Failed to register device`, error)
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during registration',
      }
    }
  }

  /**
   * Send a push notification using a UCAN for authorization
   *
   * @param ucanToken The UCAN token containing device information
   * @param title Optional notification title
   * @param body Optional notification body
   * @param data Optional custom data payload
   * @returns Result of the push operation
   */
  async sendPush(
    ucanToken: string,
    title?: string,
    body?: string,
    data?: Record<string, string>,
  ): Promise<SendPushResult> {
    // Validate the UCAN and extract device information
    const validation = await this.ucanService.validateUcan(ucanToken)

    if (!validation.valid || validation.deviceToken == null) {
      this.logger.warn(
        `Invalid UCAN token: ${validation.error ?? 'unknown error'}`,
      )
      return {
        success: false,
        error: validation.error ?? 'Invalid UCAN token',
      }
    }

    const result = await this.pushService.send(validation.deviceToken, {
      title,
      body,
      data,
    })

    if (!result.success) {
      // Check if this is a token-invalid error (should return 410)
      const tokenInvalid = this.isTokenInvalidError(result.errorCode)

      return {
        success: false,
        error: result.error,
        tokenInvalid,
      }
    }

    this.logger.debug(`Push notification sent successfully`)
    return { success: true }
  }

  /**
   * Check if an error code indicates the device token is no longer valid
   */
  private isTokenInvalidError(errorCode?: PushErrorCode): boolean {
    if (errorCode == null) return false

    const tokenInvalidCodes: PushErrorCode[] = [
      PushErrorCode.INVALID_TOKEN,
      PushErrorCode.FCM_INVALID_REGISTRATION,
      PushErrorCode.FCM_NOT_REGISTERED,
    ]

    return tokenInvalidCodes.includes(errorCode)
  }
}
