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

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private iosApp: admin.app.App | undefined
  private iosMessaging: admin.messaging.Messaging | undefined
  private iosAvailable = false

  private androidApp: admin.app.App | undefined
  private androidMessaging: admin.messaging.Messaging | undefined
  private androidAvailable = false

  private readonly logger = createLogger(PushService.name)

  constructor(private readonly awsSecretsService: AWSSecretsService) {}

  async onModuleInit(): Promise<void> {
    await Promise.all([this.initializeIos(), this.initializeAndroid()])
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.iosApp?.delete(), this.androidApp?.delete()])
  }

  /**
   * Check if push service is available for the given platform
   */
  isAvailable(platform: 'ios' | 'android' = 'ios'): boolean {
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
        error: `Push service not available for platform: ${platform}`,
        errorCode: PushErrorCode.SERVICE_UNAVAILABLE,
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
    const messaging = this.messagingFor(platform)
    if (!this.isAvailable(platform) || messaging == null) {
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
          const error = resp.error
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
        error: `FCM service not configured for platform: ${platform}`,
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
   * Initialize the iOS FCM client
   */
  private async initializeIos(): Promise<void> {
    const projectId = ConfigService.getString(EnvVars.FIREBASE_IOS_PROJECT_ID)
    const clientEmail = ConfigService.getString(
      EnvVars.FIREBASE_IOS_CLIENT_EMAIL,
    )
    // <DEV|PROD>_FIREBASE_IOS_PRIVATE_KEY to allow separate secrets for different environments if needed without changing code
    const envScopedPrivateKeyName = `${ConfigService.getString(EnvVars.ENV)?.toLowerCase() === 'development' ? 'DEV' : 'PROD'}_${EnvVars.FIREBASE_IOS_PRIVATE_KEY}`
    const privateKey = await this.awsSecretsService.getSecretEnvVar(
      envScopedPrivateKeyName,
    )

    if (projectId == null || clientEmail == null || privateKey == null) {
      this.logger.error(
        `iOS FCM credentials not configured. iOS push notifications will be unavailable. ` +
          `Please configure FIREBASE_IOS_PROJECT_ID, FIREBASE_IOS_CLIENT_EMAIL, and FIREBASE_IOS_PRIVATE_KEY.`,
      )
      this.iosAvailable = false
      return
    }

    try {
      const formattedPrivateKey = privateKey.replace(/\\n/g, '\n')
      const existingApp = admin.apps.find(a => a?.name === 'ios')
      if (existingApp != null) {
        this.iosApp = existingApp
      } else {
        this.iosApp = admin.initializeApp(
          {
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey: formattedPrivateKey,
            }),
          },
          'ios',
        )
      }
      this.iosMessaging = this.iosApp.messaging()
      this.iosAvailable = true
      this.logger.log(`iOS FCM client initialized for project ${projectId}`)
    } catch (error) {
      this.logger.error(`Failed to initialize iOS FCM client`, error)
      this.iosAvailable = false
    }
  }

  /**
   * Initialize the Android FCM client (separate Firebase project)
   */
  private async initializeAndroid(): Promise<void> {
    const projectId = ConfigService.getString(
      EnvVars.FIREBASE_ANDROID_PROJECT_ID,
    )
    const clientEmail = ConfigService.getString(
      EnvVars.FIREBASE_ANDROID_CLIENT_EMAIL,
    )
    // <DEV|PROD>_FIREBASE_ANDROID_PRIVATE_KEY to allow separate secrets for different environments if needed without changing code
    const envScopedPrivateKeyName = `${ConfigService.getString(EnvVars.ENV)?.toLowerCase() === 'development' ? 'DEV' : 'PROD'}_${EnvVars.FIREBASE_ANDROID_PRIVATE_KEY}`
    const privateKey = await this.awsSecretsService.getSecretEnvVar(
      envScopedPrivateKeyName,
    )

    if (projectId == null || clientEmail == null || privateKey == null) {
      this.logger.warn(
        `Android FCM credentials not configured. Android push notifications will be unavailable. ` +
          `Please configure FIREBASE_ANDROID_PROJECT_ID, FIREBASE_ANDROID_CLIENT_EMAIL, and FIREBASE_ANDROID_PRIVATE_KEY.`,
      )
      this.androidAvailable = false
      return
    }

    try {
      const formattedPrivateKey = privateKey.replace(/\\n/g, '\n')
      const existingApp = admin.apps.find(a => a?.name === 'android')
      if (existingApp != null) {
        this.androidApp = existingApp
      } else {
        this.androidApp = admin.initializeApp(
          {
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey: formattedPrivateKey,
            }),
          },
          'android',
        )
      }
      this.androidMessaging = this.androidApp.messaging()
      this.androidAvailable = true
      this.logger.log(`Android FCM client initialized for project ${projectId}`)
    } catch (error) {
      this.logger.error(`Failed to initialize Android FCM client`, error)
      this.androidAvailable = false
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
