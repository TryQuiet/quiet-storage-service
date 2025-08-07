import type { Socket } from 'socket.io'
import type { CommunitiesManagerService } from '../communities-manager.service.js'

export interface AuthConnectionConfig {
  socket: Socket
  communitiesManager: CommunitiesManagerService
}
