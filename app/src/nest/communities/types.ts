import type { Base58, Keyset } from '@localfirst/auth'
import type { SigChain } from './auth/sigchain.js'
import type { AuthConnection } from './auth/auth.connection.js'
import type { DateTime } from 'luxon'
import type { KeyMetadata } from '@localfirst/crdx'

export const MANAGED_COMMUNITY_TTL_MS = 300_000 // i.e. expire locally stored communities 5 minutes after losing all auth connections

export enum AllowedServerKeyState {
  ANY = 'Any', // keys can be new or old
  STORED_ONLY = 'StoredOnly', // keys must already exist
  NOT_STORED = 'NotStored', // keys must not already exist
}

export interface Community {
  teamId: string
  sigChain: string
}

export interface EncryptedCommunity {
  teamId: string
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
  sigChain: SigChain
  authConnections?: AuthConnectionMap
  expiryMs?: number
}

export interface CommunitiesData {
  cid: string
  communityId: string
  entry: Buffer
  receivedAt: DateTime
}

export enum EncryptionScopeType {
  ROLE = 'ROLE',
  CHANNEL = 'CHANNEL',
  USER = 'USER',
  TEAM = 'TEAM',
}

export interface EncryptionScope {
  type: EncryptionScopeType
  name?: string
}

export type EncryptionScopeDetail = EncryptionScope & {
  generation: number
}

export interface Signature {
  signature: Base58
  author: KeyMetadata
}

export interface LFAEncryptedPayload {
  contents: Uint8Array
  scope: EncryptionScopeDetail
}

export interface EncryptedAndSignedPayload {
  encrypted: LFAEncryptedPayload
  signature: Signature
  ts: number
  userId: string
  teamId: string
}
