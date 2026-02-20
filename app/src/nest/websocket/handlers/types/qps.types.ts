import type { BaseHandlerConfig, BaseWebsocketMessage } from '../../ws.types.js'
import type { QPSService } from '../../../qps/qps.service.js'

export interface QPSHandlerConfig extends BaseHandlerConfig {
  qpsService: QPSService
}

export interface RegisterDevicePayload {
  deviceToken: string
  bundleId: string
}

export interface RegisterDeviceMessage
  extends BaseWebsocketMessage<RegisterDevicePayload> {
  payload: RegisterDevicePayload
}

export interface RegisterDeviceResponsePayload {
  ucan: string
}

export interface RegisterDeviceResponse
  extends BaseWebsocketMessage<RegisterDeviceResponsePayload> {}

export interface SendPushPayload {
  ucan: string
  title?: string
  body?: string
  data?: Record<string, string>
}

export interface SendPushMessage
  extends BaseWebsocketMessage<SendPushPayload> {
  payload: SendPushPayload
}

export interface SendPushResponse
  extends BaseWebsocketMessage<undefined> {}
