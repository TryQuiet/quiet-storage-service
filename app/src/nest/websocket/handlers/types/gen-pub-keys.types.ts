import type { Keyset } from '@localfirst/crdx'
import type { BaseWebsocketMessage } from '../../ws.types.js'
import type { CommunityOperationStatus } from './common.types.js'

export interface GeneratePublicKeysMessagePayload {
  teamId: string
  // A server now has a self-certifying identity: `serverId` is the fingerprint of its immutable
  // `identityKeys` (which sign its links and answer connection challenges), separate from `keys`
  // (its rotatable member keyset that lockboxes are addressed to). We provision and return all
  // three; `host` is only a routing/display label.
  serverId?: string
  identityKeys?: Keyset
  keys?: Keyset
}

export interface GeneratePublicKeysMessage
  extends BaseWebsocketMessage<GeneratePublicKeysMessagePayload> {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload?: GeneratePublicKeysMessagePayload
}
