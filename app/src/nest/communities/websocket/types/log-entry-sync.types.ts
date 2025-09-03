import type { BaseWebsocketMessage } from '../../../websocket/ws.types.js'
import type { EncryptedAndSignedPayload } from '../../types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface LogEntrySyncPayload {
  teamId: string
  hash: string
  hashedDbId: string
  encEntry: EncryptedAndSignedPayload
}

export interface LogEntrySyncMessage
  extends BaseWebsocketMessage<LogEntrySyncPayload> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload: LogEntrySyncPayload
}

export interface LogEntrySyncResponsePayload {
  teamId: string
  hash: string
  hashedDbId: string
}

export interface LogEntrySyncResponseMessage
  extends BaseWebsocketMessage<LogEntrySyncResponsePayload> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload: LogEntrySyncResponsePayload
}
