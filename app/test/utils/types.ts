import type { Socket as ClientSocket } from 'socket.io-client'
import type { Socket as ServerSocket } from 'socket.io'
import {
  KeysetWithSecrets,
  LocalUserContext,
  Server,
  Team,
} from '@localfirst/auth'
import { SigChain } from '../../src/nest/communities/auth/sigchain.js'

export interface TestSockets {
  client: ClientSocket
  server: ServerSocket
}

export interface TestTeam {
  team: Team
  server: Server
  serverKeys: KeysetWithSecrets
  testUserContext: LocalUserContext
}

export interface SigChainWithTestTeam {
  testTeam: TestTeam
  sigchain: SigChain
}
