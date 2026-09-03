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
  /**
   * Digest of the team keyring this graph was committed with.
   *
   * The graph lives in PostgreSQL and the keyring lives in the secrets manager, with no shared
   * transaction. Recording which keyring a graph was written against lets a cold load say so when
   * the two have drifted apart, instead of failing with an opaque "Can't decrypt link".
   */
  teamKeyringDigest?: string
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

/**
 * One instant of a team's durable state.
 *
 * Both halves are taken from the same `Team` with no await in between, so the keyring written to
 * the secrets manager is exactly the keyring the graph written to PostgreSQL needs. Sampling them
 * on either side of an await can commit a graph whose links require a keyset that was never stored
 * (audit finding M-3).
 */
export interface TeamStateSnapshot {
  /** Hex-encoded serialized graph */
  serializedGraph: string
  /** UTF-8 JSON of the team keyring */
  serializedKeyring: Uint8Array
  /** Canonical digest of the keyring's public half */
  keyringDigest: string
  /** Graph head at the moment of the snapshot */
  head: string[]
}

export type AuthConnectionMap = Map<string, AuthConnection>

export interface ManagedCommunity {
  teamId: string
  sigChain: SigChain
  chainEventHandler: () => Promise<void>
  authConnections?: AuthConnectionMap
  expiryMs?: number
}

export interface LogSyncEntry {
  cid: string
  hashedDbId: string
  communityId: string
  entry: Buffer
  receivedAt: DateTime
  syncSeq?: number
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
