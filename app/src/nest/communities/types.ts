import type { Keyset } from '@localfirst/auth'
import type { SigChain } from './auth/sigchain.js'
import type { AuthConnection } from './auth/auth.connection.js'
import type { CommunitiesHandlerOptions } from './websocket/types/index.js'

export enum AllowedServerKeyState {
  Any = 'Any',
  StoredOnly = 'StoredOnly',
  NotStored = 'NotStored',
}

export interface Community {
  teamId: string
  name: string
  peerList: string[]
  psk: string
  sigChain: string
}

export interface CreatedCommunity {
  community: Community
  serverKeys: Keyset
}

export type CommunityUpdate = Omit<Partial<Community>, 'teamId'>

export interface ManagedCommunity {
  teamId: string
  sigChain: SigChain
  authConnection?: AuthConnection
  wsOptions: CommunitiesHandlerOptions
}
