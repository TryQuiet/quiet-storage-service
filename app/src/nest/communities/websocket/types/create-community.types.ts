import type {
  BaseStatusPayload,
  BaseWebsocketMessage,
} from '../../../websocket/ws.types.js'
import type { Community } from '../../types.js'

export interface CreateCommunityPayload {
  community: Community
  teamKeyring: string
}

export interface CreateCommunity {
  ts: number
  payload: CreateCommunityPayload
}

export enum CreateCommunityStatus {
  Error = 'error',
  Success = 'success',
}

export interface CreateCommunityResponsePayload
  extends BaseStatusPayload<undefined> {
  status: CreateCommunityStatus
  reason?: string
}
export interface CreateCommunityResponse
  extends BaseWebsocketMessage<CreateCommunityResponsePayload> {
  ts: number
  payload: CreateCommunityResponsePayload
}
