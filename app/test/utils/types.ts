import type { Socket as ClientSocket } from 'socket.io-client'
import type { Socket as ServerSocket } from 'socket.io'

export interface TestSockets {
  client: ClientSocket
  server: ServerSocket
}
