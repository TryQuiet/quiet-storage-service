import type { CryptoKX } from 'libsodium-wrappers-sumo'
import type { Server, Socket } from 'socket.io'
import type { WebsocketEncryptionService } from '../../encryption/ws.enc.service.js'

export interface BaseHandlerOptions {
  socketServer: Server
  socket: Socket
  sessionKey: CryptoKX
  encryption: WebsocketEncryptionService
}
