import type { Socket } from 'socket.io'
import type { CommunitiesManagerService } from '../communities-manager.service.js'

export interface AuthConnectionConfig {
  socket: Socket
  communitiesManager: CommunitiesManagerService
}

export enum AuthStatus {
  PENDING = 'PENDING',
  JOINING = 'JOINING',
  JOINED = 'JOINED',
  REJECTED_OR_CLOSED = 'REJECTED_OR_CLOSED',
}
