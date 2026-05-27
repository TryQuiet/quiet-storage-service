import type { BaseWebsocketMessage } from '../../ws.types.js'
import type { EncryptedAndSignedPayload } from '../../../communities/types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface LogEntrySyncPayload {
  teamId: string
  hash: string
  hashedDbId: string
  encEntry: EncryptedAndSignedPayload
  receivedAt?: number
  syncSeq?: number
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
  receivedAt?: number
  syncSeq?: number
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
  cursor?: string
  startSeq?: number
  endSeq?: number
  startTs?: number
  endTs?: number
  limit?: number
  hash?: string
  hashedDbId?: string
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
  highestSyncSeq?: number
  resolvedStartSeq?: number
}

export interface LogEntryPullResponseMessage
  extends BaseWebsocketMessage<LogEntryPullResponsePayload> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload: LogEntryPullResponsePayload
}
