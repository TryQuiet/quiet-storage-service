import type { Socket } from 'socket.io'
import type { CommunitiesManagerService } from '../communities-manager.service.js'

export interface AuthConnectionConfig {
  socket: Socket
  communitiesManager: CommunitiesManagerService
  /**
   * Durably persist this team's current sigchain and team keyring.
   *
   * localfirst/auth calls this after it has appended an ADMIT_* link in memory and before it
   * queues the acceptance that hands the invitee the graph and the team keyring. It must resolve
   * only once both are on disk, and reject if either write fails, so that a QSS crash can never
   * leave an invitee holding keys for an admission the server has forgotten.
   */
  persistAdmission?: () => Promise<void>
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
