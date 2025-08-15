import type { BaseWebsocketMessage } from '../../../websocket/ws.types.js'
import type { EncryptedAndSignedPayload } from '../../types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface QSSDataSyncPayload {
  teamId: string
  hash: string
  hashedDbId: string
  encEntry: EncryptedAndSignedPayload
}

export interface QSSDataSyncMessage
  extends BaseWebsocketMessage<QSSDataSyncPayload> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload: QSSDataSyncPayload
}
