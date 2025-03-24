import type { CommunityUpdate } from '../../types.js'
import type {
  BaseStatusPayload,
  BaseWebsocketMessage,
} from '../../../websocket/ws.types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface UpdateCommunity
  extends BaseWebsocketMessage<UpdateCommunityPayload> {
  ts: number
  payload: UpdateCommunityPayload
}

export interface UpdateCommunityPayload {
  teamId: string
  updates: CommunityUpdate
}

export interface UpdateCommunityResponsePayload
  extends BaseStatusPayload<undefined> {
  status: CommunityOperationStatus
  reason?: string
}

export interface UpdateCommunityResponse
  extends BaseWebsocketMessage<UpdateCommunityResponsePayload> {
  ts: number
  payload: UpdateCommunityResponsePayload
}
