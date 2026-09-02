/**
 * Push notification service using Firebase Cloud Messaging
 *
 * FCM handles push notifications for both iOS (via APNs) and Android.
 */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import admin from 'firebase-admin'
import { createLogger } from '../../app/logger/logger.js'
import { EnvVars } from '../../utils/config/env_vars.js'
import { AWSSecretsService } from '../../utils/aws/aws-secrets.service.js'
import {
  type PushPayload,
  type PushResult,
  type MulticastPushResult,
  PushErrorCode,
} from './push.types.js'
import { ConfigService } from '../../utils/config/config.service.js'
import { Environment } from '../../utils/config/types.js'
import { QpsErrorReason } from '../qps.types.js'
import type { PushPlatform, PushRelayResponse } from './push-relay.types.js'
import { TrustedPushRelayClient } from './push-relay.client.js'
import { initializeDirectFirebase } from './direct-firebase.client.js'

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private relay: TrustedPushRelayClient | undefined
  private relayAvailable = false

  private iosApp: admin.app.App | undefined
  private iosMessaging: admin.messaging.Messaging | undefined
  private iosAvailable = false

  private androidApp: admin.app.App | undefined
  private androidMessaging: admin.messaging.Messaging | undefined
  private androidAvailable = false

  private readonly logger = createLogger(PushService.name)

  constructor(private readonly awsSecretsService: AWSSecretsService) {}

  async onModuleInit(): Promise<void> {
    if (this.requiresCredentialIsolation()) {
      this.initializeRelay()
      return
    }
    const [ios, android] = await Promise.all([
      initializeDirectFirebase('ios', this.awsSecretsService),
      initializeDirectFirebase('android', this.awsSecretsService),
    ])
    this.iosApp = ios?.app
    this.iosMessaging = ios?.messaging
    this.iosAvailable = ios != null
    this.androidApp = android?.app
    this.androidMessaging = android?.messaging
    this.androidAvailable = android != null
  }

  async onModuleDestroy(): Promise<void> {
    this.relay?.destroy()
    await Promise.all([this.iosApp?.delete(), this.androidApp?.delete()])
  }

  /**
   * Check if push service is available for the given platform
   */
  isAvailable(platform: 'ios' | 'android' = 'ios'): boolean {
    if (this.relayAvailable) return true
    return platform === 'android' ? this.androidAvailable : this.iosAvailable
  }

  private messagingFor(
    platform: 'ios' | 'android',
  ): admin.messaging.Messaging | undefined {
    return platform === 'android' ? this.androidMessaging : this.iosMessaging
  }

  /**
   * Send a push notification to a device via FCM
   *
   * @param deviceToken The FCM device token
   * @param payload The notification payload
   * @param platform Target platform — selects the correct Firebase project
   * @returns Result of the push operation
   */
  async send(
    deviceToken: string,
    payload: PushPayload,
    platform: 'ios' | 'android' = 'ios',
  ): Promise<PushResult> {
    if (!this.isAvailable(platform)) {
      return {
        success: false,
        error: QpsErrorReason.PushNotificationServiceNotAvailable,
        errorCode: PushErrorCode.SERVICE_UNAVAILABLE,
      }
    }

    if (this.relayAvailable) {
      const result = await this.sendViaRelay([deviceToken], payload, platform)
      if (result.successCount > 0) return { success: true }
      if (result.invalidTokens.includes(deviceToken)) {
        return {
          success: false,
          error: 'Device token is invalid or no longer registered',
          errorCode: PushErrorCode.FCM_NOT_REGISTERED,
        }
      }
      return {
        success: false,
        error: 'Trusted push relay failed to deliver notification',
        errorCode: PushErrorCode.UNKNOWN_ERROR,
      }
    }

    return await this.sendFcm(deviceToken, payload, platform)
  }

  /**
   * Send a push notification to multiple devices via FCM multicast
   *
   * @param deviceTokens Array of FCM device tokens (must all be same platform)
   * @param payload The notification payload
   * @param platform Target platform — selects the correct Firebase project
   * @returns Result with success/failure counts and invalid tokens
   */
  async sendMulticast(
    deviceTokens: string[],
    payload: PushPayload,
    platform: 'ios' | 'android' = 'ios',
  ): Promise<MulticastPushResult> {
    if (!this.isAvailable(platform)) {
      this.logger.warn(
        `Push service not available for multicast (platform=${platform})`,
      )
      return {
        successCount: 0,
        failureCount: deviceTokens.length,
        invalidTokens: [],
      }
    }

    if (deviceTokens.length === 0) {
      return {
        successCount: 0,
        failureCount: 0,
        invalidTokens: [],
      }
    }

    if (this.relayAvailable) {
      return await this.sendViaRelay(deviceTokens, payload, platform)
    }

    const messaging = this.messagingFor(platform)
    if (messaging == null) {
      return {
        successCount: 0,
        failureCount: deviceTokens.length,
        invalidTokens: [],
      }
    }

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens: deviceTokens,
        notification:
          payload.title != null || payload.body != null
            ? {
                title: payload.title,
                body: payload.body,
              }
            : undefined,
        data: payload.data,
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
              mutableContent: true,
            },
          },
        },
        webpush: {
          headers: {
            Urgency: 'high',
          },
          notification:
            payload.title != null || payload.body != null
              ? {
                  title: payload.title,
                  body: payload.body,
                }
              : undefined,
        },
      }

      this.logger.log(
        `Sending multicast push to ${deviceTokens.length} devices`,
      )

      const response = await messaging.sendEachForMulticast(message)

      const invalidTokens: string[] = []
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const { error } = resp
          const errorCode = error?.code

          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(deviceTokens[idx])
          }
        }
      })

      this.logger.log(
        `Multicast complete: ${response.successCount}/${deviceTokens.length} succeeded, ${invalidTokens.length} invalid tokens`,
      )

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokens,
      }
    } catch (error) {
      this.logger.error('Error sending multicast push:', error)
      return {
        successCount: 0,
        failureCount: deviceTokens.length,
        invalidTokens: [],
      }
    }
  }

  private requiresCredentialIsolation(): boolean {
    return [Environment.Development, Environment.Production].includes(
      ConfigService.getEnv(),
    )
  }

  private initializeRelay(): void {
    const functionArn = ConfigService.getString(
      EnvVars.QPS_PUSH_RELAY_FUNCTION_ARN,
    )
    const region = ConfigService.getString(EnvVars.AWS_REGION)
    if (functionArn == null || region == null) {
      this.logger.error(
        'QPS push is fail-closed: QPS_PUSH_RELAY_FUNCTION_ARN and AWS_REGION are required outside local/test environments',
      )
      return
    }

    this.relay = TrustedPushRelayClient.create(region, functionArn)
    this.relayAvailable = true
    this.logger.log('Trusted QPS push relay initialized')
  }

  private async sendViaRelay(
    deviceTokens: string[],
    payload: PushPayload,
    platform: PushPlatform,
  ): Promise<PushRelayResponse> {
    const failure: PushRelayResponse = {
      successCount: 0,
      failureCount: deviceTokens.length,
      invalidTokens: [],
    }

    try {
      if (this.relay == null) return failure
      return await this.relay.send(deviceTokens, payload, platform)
    } catch (error) {
      this.logger.error('Trusted push relay invocation failed', error)
      return failure
    }
  }

  /**
   * Send via real FCM using the correct app for the given platform
   */
  private async sendFcm(
    deviceToken: string,
    payload: PushPayload,
    platform: 'ios' | 'android',
  ): Promise<PushResult> {
    const messaging = this.messagingFor(platform)
    if (messaging == null) {
      return {
        success: false,
        error: QpsErrorReason.PushNotificationServiceNotAvailable,
        errorCode: PushErrorCode.SERVICE_UNAVAILABLE,
      }
    }

    try {
      const message: admin.messaging.Message = {
        token: deviceToken,
        notification:
          payload.title != null || payload.body != null
            ? {
                title: payload.title,
                body: payload.body,
              }
            : undefined,
        data: payload.data,
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
              mutableContent: true,
            },
          },
        },
        // Web Push configuration
        webpush: {
          headers: {
            Urgency: 'high',
          },
          notification:
            payload.title != null || payload.body != null
              ? {
                  title: payload.title,
                  body: payload.body,
                }
              : undefined,
        },
      }

      this.logger.log(
        `Sending push notification to ${platform} token: ${deviceToken.substring(0, 20)}...`,
      )
      this.logger.debug(`Push payload:`, { payload, message })

      const messageId = await messaging.send(message)

      this.logger.log(
        `Push notification sent successfully, messageId: ${messageId}`,
      )
      return { success: true }
    } catch (error) {
      return this.handleFcmError(error, deviceToken)
    }
  }

  /**
   * Handle FCM errors and map to push error codes
   */
  private handleFcmError(error: unknown, deviceToken?: string): PushResult {
    const tokenSnippet =
      deviceToken !== undefined
        ? deviceToken.substring(0, 20) + '...'
        : 'unknown'
    this.logger.error(`FCM error for token ${tokenSnippet}:`, error)

    // Check for Firebase messaging errors
    if (error instanceof Error) {
      const errorCode = (error as { code?: string }).code

      // Device token issues - client should remove this token
      if (
        errorCode === 'messaging/invalid-registration-token' ||
        errorCode === 'messaging/registration-token-not-registered'
      ) {
        return {
          success: false,
          error: 'Device token is invalid or no longer registered',
          errorCode:
            errorCode === 'messaging/invalid-registration-token'
              ? PushErrorCode.FCM_INVALID_REGISTRATION
              : PushErrorCode.FCM_NOT_REGISTERED,
        }
      }

      if (errorCode === 'messaging/mismatched-credential') {
        return {
          success: false,
          error: 'FCM credentials do not match the device token',
          errorCode: PushErrorCode.FCM_SENDER_ID_MISMATCH,
        }
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown FCM error',
      errorCode: PushErrorCode.UNKNOWN_ERROR,
    }
  }
}
