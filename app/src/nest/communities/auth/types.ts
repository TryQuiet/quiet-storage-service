import type { CommunitiesManagerService } from '../communities-manager.service.js'
import type { QuietSocket } from '../../websocket/ws.types.js'

export interface AuthConnectionConfig {
  socket: QuietSocket
  communitiesManager: CommunitiesManagerService
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
}

export interface SigChainPersistenceSnapshot {
  teamId: string
  sigChain: string
  teamKeyring: Uint8Array
}
