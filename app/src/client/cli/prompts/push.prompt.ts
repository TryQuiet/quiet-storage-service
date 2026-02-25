import { input } from '@inquirer/prompts'
import { createLogger } from '../../../nest/app/logger/logger.js'
import { promiseWithSpinner } from '../utils/utils.js'
import { WebsocketEvents } from '../../../nest/websocket/ws.types.js'
import { CommunityOperationStatus } from '../../../nest/websocket/handlers/types/common.types.js'
import type { WebsocketClient } from '../../ws.client.js'
import type {
  RegisterDeviceMessage,
  RegisterDeviceResponse,
  SendPushMessage,
  SendPushResponse,
} from '../../../nest/websocket/handlers/types/qps.types.js'
import { DateTime } from 'luxon'

const logger = createLogger('Client:Push')

/**
 * Register a device and get a UCAN token
 */
export const registerDevice = async (
  client: WebsocketClient,
): Promise<string | undefined> => {
  const deviceToken = await input({
    message: 'Enter the FCM device token:',
    validate: (value: string | undefined) => {
      if (value == null || value === '') {
        return 'Device token is required'
      }
      return true
    },
  })

  const bundleId = await input({
    message: 'Enter the app bundle ID:',
    default: 'com.tryquiet.quiet',
    validate: (value: string | undefined) => {
      if (value == null || value === '') {
        return 'Bundle ID is required'
      }
      return true
    },
  })

  const result = await promiseWithSpinner(
    async () => {
      const message: RegisterDeviceMessage = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SENDING,
        payload: { deviceToken, bundleId },
      }

      const response = await client.sendMessage<RegisterDeviceResponse>(
        WebsocketEvents.QPSRegisterDevice,
        message,
        true,
      )

      if (response == null) {
        throw new Error('No response from server')
      }

      if (
        response.status !== CommunityOperationStatus.SUCCESS ||
        response.payload?.ucan == null
      ) {
        throw new Error(
          `Registration failed: ${response.reason ?? 'unknown error'}`,
        )
      }

      return response.payload.ucan
    },
    'Registering device...',
    'Device registered successfully!',
    'Failed to register device',
  )

  if (result != null) {
    logger.log(`UCAN Token:\n${result}`)
    return result
  }

  return undefined
}

/**
 * Send a push notification using a UCAN token
 */
export const sendPushNotification = async (
  client: WebsocketClient,
  existingUcan?: string,
): Promise<boolean> => {
  const ucanInput = await input({
    message: 'Enter the UCAN token:',
    default: existingUcan,
    validate: (value: string | undefined) => {
      if (value == null || value.trim() === '') {
        return 'UCAN token is required'
      }
      return true
    },
  })
  // Trim whitespace and remove any newlines that might have been introduced
  const ucan = ucanInput.trim().replace(/\s+/g, '')

  const title = await input({
    message: 'Enter notification title (optional, press Enter to skip):',
    default: undefined,
  })

  const body = await input({
    message: 'Enter notification body (optional, press Enter to skip):',
    default: undefined,
  })

  const dataInput = await input({
    message:
      'Enter custom data as JSON (optional, press Enter to skip, e.g., {"key":"value"}):',
    default: undefined,
    validate: (value: string | undefined) => {
      if (value == null || value === '') {
        return true
      }
      try {
        JSON.parse(value)
        return true
      } catch {
        return 'Invalid JSON format'
      }
    },
  })

  const payload: SendPushMessage['payload'] = { ucan }
  if (title !== '') {
    payload.title = title
  }
  if (body !== '') {
    payload.body = body
  }
  if (dataInput !== '') {
    const parsed: unknown = JSON.parse(dataInput)
    payload.data = parsed as Record<string, string>
  }

  const result = await promiseWithSpinner(
    async () => {
      const message: SendPushMessage = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SENDING,
        payload,
      }

      const response = await client.sendMessage<SendPushResponse>(
        WebsocketEvents.QPSSendPush,
        message,
        true,
      )

      if (response == null) {
        throw new Error('No response from server')
      }

      if (response.status === CommunityOperationStatus.NOT_FOUND) {
        throw new Error(
          `Device token is no longer valid: ${response.reason ?? 'unknown error'}`,
        )
      }

      if (response.status !== CommunityOperationStatus.SUCCESS) {
        throw new Error(
          `Push notification failed: ${response.reason ?? 'unknown error'}`,
        )
      }

      return true
    },
    'Sending push notification...',
    'Push notification sent successfully!',
    'Failed to send push notification',
  )

  return result === true
}
