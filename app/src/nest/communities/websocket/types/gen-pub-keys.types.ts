import type { Keyset } from '@localfirst/crdx'
import type {
  BaseStatusPayload,
  BaseWebsocketMessage,
} from '../../../websocket/ws.types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface GeneratePublicKeysMessagePayload {
  teamId: string
}

export interface GeneratePublicKeysMessage {
  ts: number
  payload: GeneratePublicKeysMessagePayload
}

export interface GeneratePublicKeysResponseInnerPayload {
  teamId: string
  keys: Keyset
}

export interface GeneratePublicKeysResponsePayload
  extends BaseStatusPayload<GeneratePublicKeysResponseInnerPayload> {
  status: CommunityOperationStatus
  reason?: string
  payload?: GeneratePublicKeysResponseInnerPayload
}

export interface GeneratePublicKeysResponse
  extends BaseWebsocketMessage<GeneratePublicKeysResponsePayload> {
  ts: number
  payload: GeneratePublicKeysResponsePayload
}
