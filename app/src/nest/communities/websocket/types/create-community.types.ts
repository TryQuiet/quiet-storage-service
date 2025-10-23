import type { BaseWebsocketMessage } from '../../../websocket/ws.types.js'
import type { Community } from '../../types.js'

export interface CreateCommunityPayload {
  community: Community
  teamKeyring: string
  userId: string
  hcaptchaToken?: string
}

export interface CreateCommunity {
  ts: number
  payload: CreateCommunityPayload
}

export enum CreateCommunityStatus {
  ERROR = 'error',
  SUCCESS = 'success',
}
export interface CreateCommunityResponse
  extends BaseWebsocketMessage<undefined> {
  ts: number
  status: CreateCommunityStatus
  reason?: string
}
