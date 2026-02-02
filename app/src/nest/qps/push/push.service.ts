/**
 * Push notification service using Firebase Cloud Messaging
 *
 * FCM handles push notifications for both iOS (via APNs) and Android.
 * When Firebase credentials are not configured, the service operates in mock mode
 * for testing and development purposes.
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
import { Environment } from '../../utils/config/types.js'

/**
 * Environments where mock mode is allowed
 */
const MOCK_ALLOWED_ENVIRONMENTS: Environment[] = [
  Environment.Local,
  Environment.Test,
]

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private app: admin.app.App | undefined
  private messaging: admin.messaging.Messaging | undefined
  private available = false
  private mockMode = false

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
   * Check if push service is available (either real FCM or mock mode)
   */
  isAvailable(): boolean {
    return this.available
  }

  /**
   * Check if running in mock mode
   */
  isMockMode(): boolean {
    return this.mockMode
  }

  /**
   * Send a push notification to a device via FCM (or simulate in mock mode)
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

    // Mock mode - simulate successful push
    if (this.mockMode) {
      return this.sendMock(deviceToken, payload)
    }

    // Real FCM mode
    return await this.sendFcm(deviceToken, payload)
  }

  /**
   * Mock implementation for testing without Firebase credentials
   */
  private sendMock(deviceToken: string, payload: PushPayload): PushResult {
    // Simulate some error cases for testing
    if (deviceToken === 'invalid-token') {
      this.logger.debug(`[MOCK] Simulating invalid token error`)
      return {
        success: false,
        error: 'Device token is invalid (mock)',
        errorCode: PushErrorCode.FCM_INVALID_REGISTRATION,
      }
    }

    if (deviceToken === 'expired-token') {
      this.logger.debug(`[MOCK] Simulating expired token error`)
      return {
        success: false,
        error: 'Device token is no longer registered (mock)',
        errorCode: PushErrorCode.FCM_NOT_REGISTERED,
      }
    }

    // Log the mock notification for debugging
    this.logger.log(`[MOCK] Push notification sent to device: ${deviceToken}`)
    this.logger.debug(`[MOCK] Payload:`, {
      title: payload.title,
      body: payload.body,
      data: payload.data,
    })

    return { success: true }
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
   * Falls back to mock mode if credentials are not configured
   */
  private initialize(): void {
    const projectId = ConfigService.getString(EnvVars.FIREBASE_PROJECT_ID)
    const clientEmail = ConfigService.getString(EnvVars.FIREBASE_CLIENT_EMAIL)
    const privateKey = ConfigService.getString(EnvVars.FIREBASE_PRIVATE_KEY)

    if (projectId == null || clientEmail == null || privateKey == null) {
      const currentEnv = ConfigService.getEnv()
      const mockAllowed = MOCK_ALLOWED_ENVIRONMENTS.includes(currentEnv)

      if (mockAllowed) {
        this.logger.warn(
          `FCM credentials not configured - running in MOCK mode. ` +
            `Push notifications will be simulated but not actually sent.`,
        )
        this.mockMode = true
        this.available = true
      } else {
        this.logger.error(
          `FCM credentials not configured and mock mode is not allowed in ${currentEnv} environment. ` +
            `Push notifications will be unavailable. ` +
            `Please configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.`,
        )
        this.mockMode = false
        this.available = false
      }
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
      this.mockMode = false

      this.logger.log(`FCM client initialized for project ${projectId}`)
    } catch (error) {
      this.logger.error(`Failed to initialize FCM client`, error)

      const currentEnv = ConfigService.getEnv()
      const mockAllowed = MOCK_ALLOWED_ENVIRONMENTS.includes(currentEnv)

      if (mockAllowed) {
        this.logger.warn(
          `Falling back to MOCK mode due to FCM initialization failure`,
        )
        this.mockMode = true
        this.available = true
      } else {
        this.logger.error(
          `FCM initialization failed and mock mode is not allowed in ${currentEnv} environment. ` +
            `Push notifications will be unavailable.`,
        )
        this.mockMode = false
        this.available = false
      }
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
