/**
 * QPS (Quiet Push Service) main service
 *
 * Orchestrates device registration and push notification delivery via FCM.
 */
import { Injectable } from '@nestjs/common'
import { createLogger } from '../app/logger/logger.js'
import { UcanService } from './ucan/ucan.service.js'
import { PushService } from './push/push.service.js'
import { PushErrorCode, type MulticastPushResult } from './push/push.types.js'

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

/**
 * Result of sending a batch of push notifications
 */
export interface SendBatchPushResult {
  success: boolean
  error?: string
  invalidTokens?: string[]
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
    platform: 'ios' | 'android',
  ): Promise<RegistrationResult> {
    try {
      if (!this.pushService.isAvailable(platform)) {
        this.logger.warn(
          `FCM is not available for registration (platform=${platform})`,
        )
        return {
          success: false,
          error: 'Push notification service not available',
        }
      }

      const ucan = await this.ucanService.createUcan(
        deviceToken,
        bundleId,
        platform,
      )

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

    const platform = validation.platform ?? 'ios'
    const result = await this.pushService.send(
      validation.deviceToken,
      { title, body, data },
      platform,
    )

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
   * Send push notifications to a batch of devices using their UCANs
   *
   * @param ucans Array of UCAN tokens for target devices
   * @returns Batch result indicating overall success
   */
  async sendBatchPush(
    ucans: string[],
    title?: string,
    body?: string,
    data?: Record<string, string>,
  ): Promise<SendBatchPushResult> {
    if (ucans.length === 0) {
      return { success: true }
    } else if (ucans.length > 500) {
      this.logger.debug(
        `Batch push failed: ${ucans.length} UCANs exceeds firebase limit of 500`,
      )
      return {
        success: false,
        error: 'Batch size exceeds limit of 500',
      }
    }

    // Validate all UCANs and bucket by platform
    const iosTokens: string[] = []
    const androidTokens: string[] = []
    for (const ucan of ucans) {
      const validation = await this.ucanService.validateUcan(ucan)
      if (validation.valid && validation.deviceToken != null) {
        if (validation.platform === 'android') {
          androidTokens.push(validation.deviceToken)
        } else {
          iosTokens.push(validation.deviceToken)
        }
      } else {
        this.logger.debug(
          `Skipping invalid UCAN in batch: ${validation.error ?? 'unknown error'}`,
        )
      }
    }

    const totalValid = iosTokens.length + androidTokens.length
    if (totalValid === 0) {
      this.logger.warn(`Batch push failed: no valid UCANs`)
      return { success: false, error: 'No valid device tokens' }
    }

    const payload = {
      title: title ?? 'Quiet',
      body: body ?? 'You have new activity',
      data,
    }

    // Send multicast per platform so each uses the correct Firebase project
    const results: MulticastPushResult[] = await Promise.all([
      iosTokens.length > 0
        ? this.pushService.sendMulticast(iosTokens, payload, 'ios')
        : Promise.resolve({
            successCount: 0,
            failureCount: 0,
            invalidTokens: [],
          }),
      androidTokens.length > 0
        ? this.pushService.sendMulticast(androidTokens, payload, 'android')
        : Promise.resolve({
            successCount: 0,
            failureCount: 0,
            invalidTokens: [],
          }),
    ])

    const successCount = results.reduce((n, r) => n + r.successCount, 0)
    const invalidTokens = results.flatMap(r => r.invalidTokens)

    if (successCount === 0) {
      this.logger.warn(
        `Batch push failed: all ${totalValid} notifications failed`,
      )
      return {
        success: false,
        error: 'All push notifications failed',
        invalidTokens,
      }
    }

    this.logger.debug(
      `Batch push complete: ${successCount}/${totalValid} succeeded, ${invalidTokens.length} invalid tokens`,
    )
    return { success: true, invalidTokens }
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
