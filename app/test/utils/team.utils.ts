import {
  createDevice,
  createKeyset,
  createTeam,
  createUser,
  Keyset,
  redactKeys,
  Server,
  UserWithSecrets,
  Team,
  LocalUserContext,
} from '@localfirst/auth'
import { createLogger } from '../../src/nest/app/logger/logger'
import { ServerKeyManagerService } from '../../src/nest/encryption/server-key-manager.service'
import { TestTeam } from './types'
import { randomUUID } from 'crypto'

const SERVER_HOSTNAME = 'test-server-hostname'

export class TeamTestUtils {
  private readonly logger = createLogger(`Test:${TeamTestUtils.name}`)

  constructor(private readonly serverKeyManager: ServerKeyManagerService) {}

  public async createTestTeam(
    serverHostname: string = SERVER_HOSTNAME,
  ): Promise<TestTeam> {
    const user = createUser('username') as UserWithSecrets
    const device = createDevice({
      userId: user.userId,
      deviceName: randomUUID(),
    })
    const testUserContext: LocalUserContext = { user, device }
    const team = createTeam('foobar', testUserContext) as Team

    const serverKeys = createKeyset(
      { type: 'SERVER', name: SERVER_HOSTNAME },
      this.serverKeyManager.generateRandomBytes(32, 'base64'),
    )
    const server: Server = {
      host: SERVER_HOSTNAME,
      keys: redactKeys(serverKeys) as Keyset,
    }
    team.addServer(server)

    return {
      team,
      serverKeys,
      server,
      testUserContext,
    }
  }
}
