/**
 * Push notification service using Firebase Cloud Messaging
 *
 * FCM handles push notifications for both iOS (via APNs) and Android.
 */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import admin from 'firebase-admin'
import { createLogger } from '../../app/logger/logger.js'
import { ConfigService } from '../../utils/config/config.service.js'
import { EnvVars } from '../../utils/config/env_vars.js'
import {
  type PushPayload,
  type PushResult,
  PushErrorCode,
} from './push.types.js'

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private app: admin.app.App | undefined
  private messaging: admin.messaging.Messaging | undefined
  private available = false

  private readonly logger = createLogger(PushService.name)

  onModuleInit(): void {
    this.initialize()
  }

  async onModuleDestroy(): Promise<void> {
    if (this.app != null) {
      await this.app.delete()
    }
  }

  /**
   * Check if push service is available
   */
  isAvailable(): boolean {
    return this.available
  }

  /**
   * Send a push notification to a device via FCM
   *
   * @param deviceToken The FCM device token
   * @param payload The notification payload
   * @returns Result of the push operation
   */
  async send(deviceToken: string, payload: PushPayload): Promise<PushResult> {
    if (!this.available) {
      return {
        success: false,
        error: 'Push service not available',
        errorCode: PushErrorCode.SERVICE_UNAVAILABLE,
      }
    }

    return await this.sendFcm(deviceToken, payload)
  }

  /**
   * Send via real FCM
   */
  private async sendFcm(
    deviceToken: string,
    payload: PushPayload,
  ): Promise<PushResult> {
    if (this.messaging == null) {
      return {
        success: false,
        error: 'FCM service not configured',
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
        // High priority for Android
        android: {
          priority: 'high',
        },
        // iOS/APNs configuration
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
        `Sending push notification to token: ${deviceToken.substring(0, 20)}...`,
      )
      this.logger.debug(`Push payload:`, { payload, message })

      const messageId = await this.messaging.send(message)

      this.logger.log(
        `Push notification sent successfully, messageId: ${messageId}`,
      )
      return { success: true }
    } catch (error) {
      return this.handleFcmError(error, deviceToken)
    }
  }

  /**
   * Initialize the FCM client with configuration from environment
   */
  private initialize(): void {
    const projectId = ConfigService.getString(EnvVars.FIREBASE_PROJECT_ID)
    const clientEmail = ConfigService.getString(EnvVars.FIREBASE_CLIENT_EMAIL)
    const privateKey = ConfigService.getString(EnvVars.FIREBASE_PRIVATE_KEY)

    if (projectId == null || clientEmail == null || privateKey == null) {
      this.logger.error(
        `FCM credentials not configured. Push notifications will be unavailable. ` +
          `Please configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.`,
      )
      this.available = false
      return
    }

    try {
      // The private key may be stored with escaped newlines in environment variables
      const formattedPrivateKey = privateKey.replace(/\\n/g, '\n')

      // Check if app already exists (e.g., from hot reload or multiple instances)
      const existingApps = admin.apps
      if (existingApps.length > 0 && existingApps[0] != null) {
        this.app = existingApps[0]
      } else {
        this.app = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: formattedPrivateKey,
          }),
        })
      }

      this.messaging = this.app.messaging()
      this.available = true

      this.logger.log(`FCM client initialized for project ${projectId}`)
    } catch (error) {
      this.logger.error(`Failed to initialize FCM client`, error)
      this.available = false
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
