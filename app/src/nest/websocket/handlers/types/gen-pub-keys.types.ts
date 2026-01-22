import type { Keyset } from '@localfirst/crdx'
import type { BaseWebsocketMessage } from '../../ws.types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface GeneratePublicKeysMessagePayload {
  teamId: string
  keys?: Keyset
}

export interface GeneratePublicKeysMessage
  extends BaseWebsocketMessage<GeneratePublicKeysMessagePayload> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload?: GeneratePublicKeysMessagePayload
}
