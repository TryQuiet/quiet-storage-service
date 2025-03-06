export interface Community {
  teamId: string
  name: string
  peerList: string[]
  psk: string
  sigChain: Uint8Array | string
}

export type CommunityUpdate = Omit<Partial<Community>, 'teamId'>
