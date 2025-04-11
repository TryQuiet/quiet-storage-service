import type { Keyset } from '@localfirst/auth'
import type { SigChain } from './auth/sigchain.js'
import type { AuthConnection } from './auth/auth.connection.js'
import type { CommunitiesHandlerOptions } from './websocket/types/index.js'

export enum AllowedServerKeyState {
  ANY = 'Any',
  STORED_ONLY = 'StoredOnly',
  NOT_STORED = 'NotStored',
}

export interface Community {
  teamId: string
  name: string
  peerList: string[]
  psk: string
  sigChain: string
}

export interface EncryptedCommunity {
  teamId: string
  name: string
  peerList: string
  psk: string
  sigChain: string
}

export interface CreatedCommunity {
  community: Community
  serverKeys: Keyset
}

export type CommunityUpdate = Omit<Partial<Community>, 'teamId'>
export type EncryptedCommunityUpdate = Omit<
  Partial<EncryptedCommunity>,
  'teamId'
>

export type AuthConnectionMap = Map<string, AuthConnection>

export interface ManagedCommunity {
  teamId: string
  community: Community
  sigChain: SigChain
  authConnections?: AuthConnectionMap
  wsOptions: CommunitiesHandlerOptions
}
