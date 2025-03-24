import type { Community } from '../../types.js'
import type {
  BaseStatusPayload,
  BaseWebsocketMessage,
} from '../../../websocket/ws.types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface GetCommunity
  extends BaseWebsocketMessage<GetCommunityPayload> {
  ts: number
  payload: GetCommunityPayload
}

export interface GetCommunityPayload {
  id: string
}

export interface GetCommunityResponsePayload
  extends BaseStatusPayload<Community> {
  status: CommunityOperationStatus
  reason?: string
  payload?: Community
}
export interface GetCommunityResponse
  extends BaseWebsocketMessage<GetCommunityResponsePayload> {
  ts: number
  payload: GetCommunityResponsePayload
}
