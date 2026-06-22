import { WebsocketEvents } from '../ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../app/logger/logger.js'
import { CommunityOperationStatus } from './types/common.types.js'
import { AuthStatus } from '../../communities/auth/types.js'
import { QPS_MAX_BATCH_UCANS, QpsErrorReason } from '../../qps/qps.types.js'
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

export function registerQpsHandlers(config: QPSHandlerConfig): void {
  const _logger = baseLogger.extend(config.socket.id)
  _logger.debug(`Initializing QPS WS event handlers`)

  async function hasJoinedAuthConnection(teamId: string): Promise<boolean> {
    const { socket } = config
    const { data } = socket
    const { userId } = data
    if (userId == null) {
      return false
    }

    const community = await config.communitiesManager.get(teamId)
    const authConnection = community?.authConnections?.get(userId)

    return (
      authConnection?.socketId === socket.id &&
      authConnection.status === AuthStatus.JOINED
    )
  }

  async function isAuthorizedForTeam(teamId: string): Promise<boolean> {
    try {
      return await hasJoinedAuthConnection(teamId)
    } catch (error) {
      _logger.warn(`Error checking QPS auth state for team ${teamId}`, error)
      return false
    }
  }

  async function handleRegisterDevice(
    message: RegisterDeviceMessage,
    callback: (response: RegisterDeviceResponse) => void,
  ): Promise<void> {
    try {
      const { deviceToken, bundleId, platform, teamId } = message.payload

      if (!(await isAuthorizedForTeam(teamId))) {
        const response: RegisterDeviceResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.UNAUTHORIZED,
          reason: QpsErrorReason.SocketNotSignedIntoTeam,
        }
        callback(response)
        return
      }

      const result = await config.qpsService.registerDevice(
        deviceToken,
        bundleId,
        platform,
        teamId,
      )

      if (!result.success || result.ucan == null) {
        const response: RegisterDeviceResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: result.error ?? QpsErrorReason.RegistrationFailed,
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
        reason: QpsErrorReason.RegistrationFailed,
      }
      callback(response)
    }
  }

  async function handleSendPush(
    message: SendPushMessage,
    callback: (response: SendPushResponse) => void,
  ): Promise<void> {
    try {
      const ucanInfo = await config.qpsService.validateUcan(
        message.payload.ucan,
      )
      if (!ucanInfo.valid) {
        const response: SendPushResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: ucanInfo.error ?? QpsErrorReason.InvalidUcanToken,
        }
        callback(response)
        return
      }

      const teamId = ucanInfo.teamId
      if (teamId == null || !(await isAuthorizedForTeam(teamId))) {
        const response: SendPushResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.UNAUTHORIZED,
          reason: QpsErrorReason.SocketNotSignedIntoUcanTeam,
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
            reason: result.error ?? QpsErrorReason.DeviceTokenNoLongerValid,
          }
          callback(response)
          return
        }

        const response: SendPushResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: result.error ?? QpsErrorReason.PushNotificationFailed,
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
        reason: QpsErrorReason.PushNotificationFailed,
      }
      callback(response)
    }
  }

  async function handleSendBatchPush(
    message: SendBatchPushMessage,
    callback: (response: SendBatchPushResponse) => void,
  ): Promise<void> {
    try {
      const { ucans } = message.payload
      if (!Array.isArray(ucans)) {
        const response: SendBatchPushResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: QpsErrorReason.InvalidBatchPayload,
          payload: { invalidTokens: [] },
        }
        callback(response)
        return
      }
      if (ucans.length > QPS_MAX_BATCH_UCANS) {
        const response: SendBatchPushResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: QpsErrorReason.BatchSizeExceedsLimit,
          payload: { invalidTokens: [] },
        }
        callback(response)
        return
      }

      const authorizedUcans: string[] = []
      for (const ucan of ucans) {
        const ucanInfo = await config.qpsService.validateUcan(ucan)
        const teamId = ucanInfo.teamId

        if (
          ucanInfo.valid &&
          teamId != null &&
          (await isAuthorizedForTeam(teamId))
        ) {
          authorizedUcans.push(ucan)
        }
      }

      if (authorizedUcans.length === 0) {
        const response: SendBatchPushResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.UNAUTHORIZED,
          reason: QpsErrorReason.SocketNotSignedIntoAnyUcanTeam,
          payload: { invalidTokens: [] },
        }
        callback(response)
        return
      }

      const result = await config.qpsService.sendBatchPush(
        authorizedUcans,
        message.payload.title,
        message.payload.body,
        message.payload.data,
      )

      if (!result.success) {
        const response: SendBatchPushResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: result.error ?? QpsErrorReason.BatchPushFailed,
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
        reason: QpsErrorReason.BatchPushFailed,
        payload: { invalidTokens: [] },
      }
      callback(response)
    }
  }

  config.socket.on(WebsocketEvents.QPSRegisterDevice, handleRegisterDevice)
  config.socket.on(WebsocketEvents.QPSSendPush, handleSendPush)
  config.socket.on(WebsocketEvents.QPSSendBatchPush, handleSendBatchPush)
}
