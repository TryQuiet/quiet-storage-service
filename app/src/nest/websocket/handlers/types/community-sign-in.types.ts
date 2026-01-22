import type { BaseWebsocketMessage } from '../../ws.types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface CommunitySignInPayload {
  teamId: string
  userId: string
}

export interface CommunitySignInMessage
  extends BaseWebsocketMessage<CommunitySignInPayload> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload?: CommunitySignInPayload
}
