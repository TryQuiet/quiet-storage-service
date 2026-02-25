import { WebsocketEvents } from '../ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../app/logger/logger.js'
import { CommunityOperationStatus } from './types/common.types.js'
import type {
  QPSHandlerConfig,
  RegisterDeviceMessage,
  RegisterDeviceResponse,
  SendPushMessage,
  SendPushResponse,
} from './types/qps.types.js'

const baseLogger = createLogger('Websocket:Event:QPS')

export function registerQpsHandlers(config: QPSHandlerConfig): void {
  const _logger = baseLogger.extend(config.socket.id)
  _logger.debug(`Initializing QPS WS event handlers`)

  async function handleRegisterDevice(
    message: RegisterDeviceMessage,
    callback: (response: RegisterDeviceResponse) => void,
  ): Promise<void> {
    try {
      const result = await config.qpsService.registerDevice(
        message.payload.deviceToken,
        message.payload.bundleId,
      )

      if (!result.success || result.ucan == null) {
        const response: RegisterDeviceResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: result.error ?? 'Registration failed',
        }
        callback(response)
        return
      }

      const response: RegisterDeviceResponse = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SUCCESS,
        payload: { ucan: result.ucan },
      }
      callback(response)
    } catch (error) {
      _logger.error('Error handling register device', error)
      const response: RegisterDeviceResponse = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.ERROR,
        reason: 'Registration failed',
      }
      callback(response)
    }
  }

  async function handleSendPush(
    message: SendPushMessage,
    callback: (response: SendPushResponse) => void,
  ): Promise<void> {
    try {
      const result = await config.qpsService.sendPush(
        message.payload.ucan,
        message.payload.title,
        message.payload.body,
        message.payload.data,
      )

      if (!result.success) {
        if (result.tokenInvalid === true) {
          const response: SendPushResponse = {
            ts: DateTime.utc().toMillis(),
            status: CommunityOperationStatus.NOT_FOUND,
            reason: result.error ?? 'Device token no longer valid',
          }
          callback(response)
          return
        }

        const response: SendPushResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: result.error ?? 'Push notification failed',
        }
        callback(response)
        return
      }

      const response: SendPushResponse = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SUCCESS,
      }
      callback(response)
    } catch (error) {
      _logger.error('Error handling send push', error)
      const response: SendPushResponse = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.ERROR,
        reason: 'Push notification failed',
      }
      callback(response)
    }
  }

  config.socket.on(WebsocketEvents.QPSRegisterDevice, handleRegisterDevice)
  config.socket.on(WebsocketEvents.QPSSendPush, handleSendPush)
}
