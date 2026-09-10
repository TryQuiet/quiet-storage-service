import type { Socket as ClientSocket } from 'socket.io-client'
import type { Socket as ServerSocket } from 'socket.io'
import {
  LocalUserContext,
  Server,
  ServerWithSecrets,
  Team,
} from '@localfirst/auth'
import { SigChain } from '../../src/nest/communities/auth/sigchain.js'
import { WebsocketClient } from '../../src/client/ws.client.js'
import { QSSClientAuthConnection } from '../../src/client/client-auth-conn.js'

export interface TestSockets {
  client: ClientSocket
  server: ServerSocket
}

export interface TestTeam {
  team: Team
  server?: Server
  serverWithSecrets?: ServerWithSecrets
  testUserContext: LocalUserContext
  otherUsers: LocalUserContext[]
}

export interface SigChainWithTestTeam {
  testTeam: TestTeam
  sigchain: SigChain
}

export interface TestClient {
  client: WebsocketClient
  sockets: TestSockets
  authConnection?: QSSClientAuthConnection
}
