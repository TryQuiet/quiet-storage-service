import type { Community } from '../../types.js'
import type { BaseWebsocketMessage } from '../../../websocket/ws.types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface GetCommunity
  extends BaseWebsocketMessage<GetCommunityPayload> {
  ts: number
  payload: GetCommunityPayload
}

export interface GetCommunityPayload {
  id: string
}

export interface GetCommunityResponse extends BaseWebsocketMessage<Community> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload?: Community
}
