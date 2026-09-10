/**
 * QPS (Quiet Push Service) main service
 *
 * Orchestrates device registration and push notification delivery via FCM.
 */
import { Injectable } from '@nestjs/common'
import { createLogger } from '../app/logger/logger.js'
import { UcanService } from './ucan/ucan.service.js'
import { PushService } from './push/push.service.js'
import {
  PushErrorCode,
  type MulticastPushResult,
  type PushPayload,
} from './push/push.types.js'
import type { UcanValidationResult } from './ucan/ucan.types.js'
import { QPS_MAX_BATCH_UCANS, QpsErrorReason } from './qps.types.js'

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
   * @param teamId The team this UCAN authorizes push delivery for
   * @returns Registration result with UCAN token
   */
  async registerDevice(
    deviceToken: string,
    bundleId: string,
    platform: 'ios' | 'android',
    teamId: string,
  ): Promise<RegistrationResult> {
    try {
      if (!this.pushService.isAvailable(platform)) {
        this.logger.warn(
          `FCM is not available for registration (platform=${platform})`,
        )
        return {
          success: false,
          error: QpsErrorReason.PushNotificationServiceNotAvailable,
        }
      }

      const ucan = await this.ucanService.createUcan(
        deviceToken,
        bundleId,
        platform,
        teamId,
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
            : QpsErrorReason.UnknownRegistrationError,
      }
    }
  }

  /**
   * Validate a UCAN and return its embedded metadata for authorization checks.
   */
  async validateUcan(ucanToken: string): Promise<UcanValidationResult> {
    return await this.ucanService.validateUcan(ucanToken)
  }

  /**
   * Send a push notification using a UCAN for authorization
   *
   * @param ucanToken The UCAN token containing device information
   * @returns Result of the push operation
   */
  async sendPush(ucanToken: string): Promise<SendPushResult> {
    // Validate the UCAN and extract device information
    const validation = await this.ucanService.validateUcan(ucanToken)

    if (
      !validation.valid ||
      validation.deviceToken == null ||
      validation.teamId == null
    ) {
      this.logger.warn(
        `Invalid UCAN token: ${validation.error ?? 'unknown error'}`,
      )
      return {
        success: false,
        error: validation.error ?? QpsErrorReason.InvalidUcanToken,
      }
    }

    const platform = validation.platform ?? 'ios'
    const result = await this.pushService.send(
      validation.deviceToken,
      this.makePayload(platform, validation.teamId),
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
  async sendBatchPush(ucans: string[]): Promise<SendBatchPushResult> {
    if (ucans.length === 0) {
      return { success: true }
    } else if (ucans.length > QPS_MAX_BATCH_UCANS) {
      this.logger.debug(
        `Batch push failed: ${ucans.length} UCANs exceeds firebase limit of ${QPS_MAX_BATCH_UCANS}`,
      )
      return {
        success: false,
        error: QpsErrorReason.BatchSizeExceedsLimit,
      }
    }

    // Validate all UCANs and bucket by their authenticated team and platform.
    // The caller never controls presentation text or data: QPS derives the only
    // client-visible field, teamId, from the signed UCAN itself.
    const recipients = new Map<
      string,
      { platform: 'ios' | 'android'; teamId: string; deviceTokens: string[] }
    >()
    for (const ucan of ucans) {
      const validation = await this.ucanService.validateUcan(ucan)
      if (
        validation.valid &&
        validation.deviceToken != null &&
        validation.teamId != null
      ) {
        const platform = validation.platform ?? 'ios'
        const key = `${platform}:${validation.teamId}`
        const recipient = recipients.get(key)
        if (recipient != null) {
          recipient.deviceTokens.push(validation.deviceToken)
        } else {
          recipients.set(key, {
            platform,
            teamId: validation.teamId,
            deviceTokens: [validation.deviceToken],
          })
        }
      } else {
        this.logger.debug(
          `Skipping invalid UCAN in batch: ${validation.error ?? 'unknown error'}`,
        )
      }
    }

    const totalValid = Array.from(recipients.values()).reduce(
      (total, recipient) => total + recipient.deviceTokens.length,
      0,
    )
    if (totalValid === 0) {
      this.logger.warn(`Batch push failed: no valid UCANs`)
      return { success: false, error: QpsErrorReason.NoValidDeviceTokens }
    }

    // Send each authenticated team/platform bucket separately. This prevents a
    // sender from using one recipient's UCAN to choose data for another team.
    const results: MulticastPushResult[] = await Promise.all(
      Array.from(recipients.values()).map(
        async recipient =>
          await this.pushService.sendMulticast(
            recipient.deviceTokens,
            this.makePayload(recipient.platform, recipient.teamId),
            recipient.platform,
          ),
      ),
    )

    const successCount = results.reduce((n, r) => n + r.successCount, 0)
    const invalidTokens = results.flatMap(r => r.invalidTokens)

    if (successCount === 0) {
      this.logger.warn(
        `Batch push failed: all ${totalValid} notifications failed`,
      )
      return {
        success: false,
        error: QpsErrorReason.AllPushNotificationsFailed,
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

  private makePayload(
    platform: 'ios' | 'android',
    teamId: string,
  ): PushPayload {
    if (platform === 'android') {
      // Android background delivery must be data-only so the app service can
      // fetch/decrypt the latest QSS entry instead of showing the fallback text.
      return { data: { teamId } }
    }

    return {
      // These are deliberately not caller-controlled. The notification service
      // extension replaces them only after it has fetched and authenticated a
      // QSS entry.
      title: 'Quiet',
      body: 'You have new activity',
      data: { teamId },
    }
  }
}
