import type { BaseWebsocketMessage } from '../../../websocket/ws.types.js'
import type { EncryptedAndSignedPayload } from '../../types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface DataSyncPayload {
  teamId: string
  hash: string
  hashedDbId: string
  encEntry: EncryptedAndSignedPayload
}

export interface DataSyncMessage extends BaseWebsocketMessage<DataSyncPayload> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload: DataSyncPayload
}

export interface DataSyncResponsePayload {
  teamId: string
  hash: string
  hashedDbId: string
}

export interface DataSyncResponseMessage
  extends BaseWebsocketMessage<DataSyncResponsePayload> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload: DataSyncResponsePayload
}
