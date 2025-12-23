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

export interface LogEntryPullPayload {
  teamId: string
  userId: string
  direction?: 'forward' | 'backward'
  startTs?: number
  endTs?: number
  limit?: number
  hash?: string
  hashedDbId?: string
  cursor?: string
}

export interface LogEntryPullMessage
  extends BaseWebsocketMessage<LogEntryPullPayload> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload: LogEntryPullPayload
}

export interface LogEntryPullResponsePayload {
  cursor?: string
  hasNextPage: boolean
  entries: Buffer[]
}

export interface LogEntryPullResponseMessage
  extends BaseWebsocketMessage<LogEntryPullResponsePayload> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload: LogEntryPullResponsePayload
}
