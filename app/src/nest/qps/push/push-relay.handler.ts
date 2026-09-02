/**
 * Trusted QPS push relay entry point.
 *
 * Deploy this as a separate Lambda and give only this function access to the
 * Firebase service-account credentials. QSS receives lambda:InvokeFunction on
 * this function, but must not retain access to the Firebase credentials.
 */
import admin from 'firebase-admin'
import {
  IOS_FALLBACK_BODY,
  IOS_FALLBACK_TITLE,
  QPS_PUSH_RELAY_VERSION,
  type PushPlatform,
  type PushRelayRequest,
  type PushRelayResponse,
} from './push-relay.types.js'

const MAX_DEVICE_TOKENS = 500
const MAX_TEAM_ID_LENGTH = 512

const messagingByPlatform = new Map<PushPlatform, admin.messaging.Messaging>()

export async function handler(input: unknown): Promise<PushRelayResponse> {
  const request = parseRequest(input)
  const messaging = initializeMessaging(request.platform)
  const result = await messaging.sendEachForMulticast(makeMessage(request))
  const invalidTokens: string[] = []
  result.responses.forEach((response, index) => {
    if (
      !response.success &&
      (response.error?.code === 'messaging/invalid-registration-token' ||
        response.error?.code === 'messaging/registration-token-not-registered')
    ) {
      invalidTokens.push(request.deviceTokens[index])
    }
  })

  return {
    successCount: result.successCount,
    failureCount: result.failureCount,
    invalidTokens,
  }
}

export function makeMessage(
  request: PushRelayRequest,
): admin.messaging.MulticastMessage {
  return {
    tokens: request.deviceTokens,
    data: { teamId: request.teamId },
    notification:
      request.platform === 'ios'
        ? { title: IOS_FALLBACK_TITLE, body: IOS_FALLBACK_BODY }
        : undefined,
    android:
      request.platform === 'android'
        ? {
            priority: 'high',
          }
        : undefined,
    apns:
      request.platform === 'ios'
        ? {
            payload: {
              aps: {
                contentAvailable: true,
                mutableContent: true,
              },
            },
          }
        : undefined,
  }
}

export function parseRequest(input: unknown): PushRelayRequest {
  if (!isRecord(input)) {
    throw new Error('Push relay request must be an object')
  }

  const expectedKeys = ['deviceTokens', 'platform', 'teamId', 'version']
  const keys = Object.keys(input).sort()
  if (
    keys.length !== expectedKeys.length ||
    !keys.every((key, index) => key === expectedKeys[index])
  ) {
    throw new Error('Push relay request contains unsupported fields')
  }
  const { version, platform, teamId, deviceTokens } = input
  if (version !== QPS_PUSH_RELAY_VERSION) {
    throw new Error('Unsupported push relay protocol version')
  }
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error('Invalid push relay platform')
  }
  if (
    typeof teamId !== 'string' ||
    teamId.length === 0 ||
    teamId.length > MAX_TEAM_ID_LENGTH
  ) {
    throw new Error('Invalid push relay teamId')
  }
  if (
    !isNonEmptyStringArray(deviceTokens) ||
    deviceTokens.length > MAX_DEVICE_TOKENS
  ) {
    throw new Error('Invalid push relay deviceTokens')
  }

  return {
    version: QPS_PUSH_RELAY_VERSION,
    platform,
    teamId,
    deviceTokens,
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input != null && typeof input === 'object' && !Array.isArray(input)
}

function isNonEmptyStringArray(input: unknown): input is string[] {
  return (
    Array.isArray(input) &&
    input.length > 0 &&
    input.every(token => typeof token === 'string' && token.length > 0)
  )
}

function initializeMessaging(
  platform: PushPlatform,
): admin.messaging.Messaging {
  const existing = messagingByPlatform.get(platform)
  if (existing != null) return existing

  const prefix = platform === 'ios' ? 'FIREBASE_IOS' : 'FIREBASE_ANDROID'
  const projectId = requiredEnv(`${prefix}_PROJECT_ID`)
  const clientEmail = requiredEnv(`${prefix}_CLIENT_EMAIL`)
  const privateKey = requiredEnv(`${prefix}_PRIVATE_KEY`).replace(/\\n/g, '\n')
  const appName = `qps-push-relay-${platform}`
  const existingApp = admin.apps.find(app => app?.name === appName)
  const app =
    existingApp ??
    admin.initializeApp(
      {
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      },
      appName,
    )
  const messaging = app.messaging()
  messagingByPlatform.set(platform, messaging)
  return messaging
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required by the QPS push relay`)
  }
  return value
}
