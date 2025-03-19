import type {
  Keyset,
  LocalServerContext,
  ServerContext,
} from '@localfirst/auth'

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
  serverContext: ServerContext
  localServerContext: LocalServerContext
}
