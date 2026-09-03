import type { Socket } from 'socket.io'
import type { Team } from '@localfirst/auth'
import type { CommunitiesManagerService } from '../communities-manager.service.js'

/**
 * Durably persist a team's current sigchain and team keyring.
 *
 * This binds membership to its record: nobody may hold a community's keys without a durable record
 * of their admission on the server that admitted them. localfirst/auth calls this on the admitting
 * side after it has appended an ADMIT_* link to the in-memory team and before it queues the
 * acceptance that hands the invitee the graph and the team keyring. It must resolve only once both
 * are on disk, and reject if either write fails, so that a QSS crash can never produce a member
 * with keys but no record (QSS-006 / private#203, threat-model C3 "Option A").
 */
export type PersistAdmission = (team: Team) => Promise<void>

export interface AuthConnectionConfig {
  socket: Socket
  communitiesManager: CommunitiesManagerService
}

/**
 * What an {@link AuthConnection} actually needs.
 *
 * The durable-admission gate is required here, not optional. The library treats a missing hook as
 * "nothing to wait for" and releases the acceptance immediately, so leaving it off would silently
 * reopen the finding. `CommunitiesManagerService` is the only place connections are built, and it
 * always supplies one.
 */
export type AuthConnectionParams = AuthConnectionConfig & {
  persistAdmission: PersistAdmission
}

export enum AuthStatus {
  PENDING = 'PENDING',
  JOINING = 'JOINING',
  JOINED = 'JOINED',
  REJECTED_OR_CLOSED = 'REJECTED_OR_CLOSED',
}

/**
 * Native LFA Events
 */
export enum LFAEvents {
  UPDATED = 'updated',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  JOINED = 'joined',
  CHANGE = 'change',
  LOCAL_ERROR = 'localError',
  REMOTE_ERROR = 'remoteError',
}

/**
 * Events emitted by Sigchains
 */
export enum SigchainEvents {
  UPDATED = 'sigchainUpdated',
  /**
   * Emitted when a chain update could not be written to durable storage. LFA emits its `updated`
   * event synchronously and discards whatever the listener returns, so without this a failed write
   * would be invisible outside the logs.
   */
  PERSIST_FAILED = 'sigchainPersistFailed',
}
