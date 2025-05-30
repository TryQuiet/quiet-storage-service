import type { Socket } from 'socket.io'
import type { CommunitiesManagerService } from '../communities-manager.service.js'

export interface AuthConnectionOptions {
  socket: Socket
  communitiesManager: CommunitiesManagerService
}
