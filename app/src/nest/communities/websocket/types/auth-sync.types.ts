import type {
  BaseStatusPayload,
  BaseWebsocketMessage,
} from '../../../websocket/ws.types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface AuthSyncMessageInnerPayload {
  userId: string
  teamId: string
  message: string
}
export interface AuthSyncMessagePayload
  extends BaseStatusPayload<AuthSyncMessageInnerPayload> {
  status: CommunityOperationStatus
  reason?: string
  payload?: AuthSyncMessageInnerPayload
}

export interface AuthSyncMessage
  extends BaseWebsocketMessage<AuthSyncMessagePayload> {
  ts: number
  payload: AuthSyncMessagePayload
}
