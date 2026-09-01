import admin from 'firebase-admin'
import { createLogger } from '../../app/logger/logger.js'
import type { AWSSecretsService } from '../../utils/aws/aws-secrets.service.js'
import { ConfigService } from '../../utils/config/config.service.js'
import { EnvVars } from '../../utils/config/env_vars.js'
import type { PushPlatform } from './push-relay.types.js'

export interface DirectFirebaseClient {
  app: admin.app.App
  messaging: admin.messaging.Messaging
}

const configByPlatform = {
  ios: {
    label: 'iOS',
    projectId: EnvVars.FIREBASE_IOS_PROJECT_ID,
    clientEmail: EnvVars.FIREBASE_IOS_CLIENT_EMAIL,
    privateKey: EnvVars.FIREBASE_IOS_PRIVATE_KEY,
  },
  android: {
    label: 'Android',
    projectId: EnvVars.FIREBASE_ANDROID_PROJECT_ID,
    clientEmail: EnvVars.FIREBASE_ANDROID_CLIENT_EMAIL,
    privateKey: EnvVars.FIREBASE_ANDROID_PRIVATE_KEY,
  },
} as const

const logger = createLogger('DirectFirebaseClient')

/** Local/test-only direct Firebase initialization. */
export async function initializeDirectFirebase(
  platform: PushPlatform,
  awsSecretsService: AWSSecretsService,
): Promise<DirectFirebaseClient | undefined> {
  const config = configByPlatform[platform]
  const projectId = ConfigService.getString(config.projectId)
  const clientEmail = ConfigService.getString(config.clientEmail)
  let privateKey: string | undefined
  try {
    privateKey = await awsSecretsService.getSecretEnvVar(config.privateKey)
  } catch (error) {
    logger.error(
      `Failed to retrieve ${config.label} FCM private key. ${config.label} push notifications will be unavailable.`,
      error,
    )
    return undefined
  }

  if (projectId == null || clientEmail == null || privateKey == null) {
    logger.warn(
      `${config.label} FCM credentials not configured. ${config.label} push notifications will be unavailable.`,
    )
    return undefined
  }

  try {
    const existingApp = admin.apps.find(app => app?.name === platform)
    const app =
      existingApp ??
      admin.initializeApp(
        {
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        },
        platform,
      )
    logger.log(
      `${config.label} FCM client initialized for project ${projectId}`,
    )
    return { app, messaging: app.messaging() }
  } catch (error) {
    logger.error(`Failed to initialize ${config.label} FCM client`, error)
    return undefined
  }
}
