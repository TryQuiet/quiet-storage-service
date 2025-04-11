import type {
  BaseStatusPayload,
  BaseWebsocketMessage,
} from '../../../websocket/ws.types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface CommunitySignInInnerPayload {
  teamId: string
  userId: string
}

export interface CommunitySignInPayload
  extends BaseStatusPayload<CommunitySignInInnerPayload> {
  status: CommunityOperationStatus
  reason?: string
  payload?: CommunitySignInInnerPayload
}

export interface CommunitySignInMessage
  extends BaseWebsocketMessage<CommunitySignInPayload> {
  ts: number
  payload: CommunitySignInPayload
}
