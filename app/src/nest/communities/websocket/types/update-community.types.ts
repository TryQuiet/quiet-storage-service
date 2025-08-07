import type { CommunityUpdate } from '../../types.js'
import type { BaseWebsocketMessage } from '../../../websocket/ws.types.js'
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

export interface UpdateCommunityResponse
  extends BaseWebsocketMessage<undefined> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
}
