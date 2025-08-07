import type { BaseWebsocketMessage } from '../../../websocket/ws.types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface AuthSyncMessagePayload {
  userId: string
  teamId: string
  message: string
}

export interface AuthSyncMessage
  extends BaseWebsocketMessage<AuthSyncMessagePayload> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload: AuthSyncMessagePayload
}
