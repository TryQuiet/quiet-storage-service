import { WebsocketEvents } from '../ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../app/logger/logger.js'
import { CommunityOperationStatus } from './types/common.types.js'
import { AuthStatus } from '../../communities/auth/types.js'
import type {
  QPSHandlerConfig,
  RegisterDeviceMessage,
  RegisterDeviceResponse,
  SendBatchPushMessage,
  SendBatchPushResponse,
  SendPushMessage,
  SendPushResponse,
} from './types/qps.types.js'

const baseLogger = createLogger('Websocket:Event:QPS')
const UNAUTHORIZED_QPS_REASON = 'Authentication required'

export function registerQpsHandlers(config: QPSHandlerConfig): void {
  const _logger = baseLogger.extend(config.socket.id)
  _logger.debug(`Initializing QPS WS event handlers`)

  async function hasJoinedAuthConnection(): Promise<boolean> {
    const { socket } = config
    const { data } = socket
    const { teamId, userId } = data
    if (teamId == null || userId == null) {
      return false
    }

    const community = await config.communitiesManager.get(teamId)
    const authConnection = community?.authConnections?.get(userId)

    return (
      authConnection?.socketId === socket.id &&
      authConnection.status === AuthStatus.JOINED
    )
  }

  async function isAuthorizedForQps(): Promise<boolean> {
    try {
      return await hasJoinedAuthConnection()
    } catch (error) {
      _logger.warn('Error checking QPS auth state', error)
      return false
    }
  }

  async function handleRegisterDevice(
    message: RegisterDeviceMessage,
    callback: (response: RegisterDeviceResponse) => void,
  ): Promise<void> {
    try {
      if (!(await isAuthorizedForQps())) {
        const response: RegisterDeviceResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: UNAUTHORIZED_QPS_REASON,
        }
        callback(response)
        return
      }

      const result = await config.qpsService.registerDevice(
        message.payload.deviceToken,
        message.payload.bundleId,
        message.payload.platform,
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
      if (!(await isAuthorizedForQps())) {
        const response: SendPushResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: UNAUTHORIZED_QPS_REASON,
        }
        callback(response)
        return
      }

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

  async function handleSendBatchPush(
    message: SendBatchPushMessage,
    callback: (response: SendBatchPushResponse) => void,
  ): Promise<void> {
    try {
      if (!(await isAuthorizedForQps())) {
        const response: SendBatchPushResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: UNAUTHORIZED_QPS_REASON,
          payload: { invalidTokens: [] },
        }
        callback(response)
        return
      }

      const result = await config.qpsService.sendBatchPush(
        message.payload.ucans,
        message.payload.title,
        message.payload.body,
        message.payload.data,
      )

      if (!result.success) {
        const response: SendBatchPushResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: result.error ?? 'Batch push failed',
          payload: { invalidTokens: result.invalidTokens ?? [] },
        }
        callback(response)
        return
      }

      const response: SendBatchPushResponse = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SUCCESS,
        payload: { invalidTokens: result.invalidTokens ?? [] },
      }
      callback(response)
    } catch (error) {
      _logger.error('Error handling send batch push', error)
      const response: SendBatchPushResponse = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.ERROR,
        reason: 'Batch push failed',
        payload: { invalidTokens: [] },
      }
      callback(response)
    }
  }

  config.socket.on(WebsocketEvents.QPSRegisterDevice, handleRegisterDevice)
  config.socket.on(WebsocketEvents.QPSSendPush, handleSendPush)
  config.socket.on(WebsocketEvents.QPSSendBatchPush, handleSendBatchPush)
}
