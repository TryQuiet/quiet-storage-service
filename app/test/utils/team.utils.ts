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
import { createLogger } from '../../src/nest/app/logger/logger.js'
import { ServerKeyManagerService } from '../../src/nest/encryption/server-key-manager.service.js'
import { SigChainWithTestTeam, TestTeam } from './types.js'
import { randomUUID } from 'crypto'
import { SigChain } from '../../src/nest/communities/auth/sigchain.js'

const SERVER_HOSTNAME = 'test-server-hostname'
const TEAM_NAME = 'test-team-name'
export class TeamTestUtils {
  private readonly logger = createLogger(`Test:${TeamTestUtils.name}`)

  constructor(private readonly serverKeyManager: ServerKeyManagerService) {}

  public async createTestTeam(
    teamName: string = TEAM_NAME,
    serverHostname: string = SERVER_HOSTNAME,
  ): Promise<TestTeam> {
    this.logger.debug(`Creating test team`, teamName, serverHostname)
    const user = createUser('username') as UserWithSecrets
    const device = createDevice({
      userId: user.userId,
      deviceName: randomUUID(),
    })
    const testUserContext: LocalUserContext = { user, device }
    const team = createTeam(teamName, testUserContext) as Team

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

  public async createSigchainFromTestTeam(
    testTeam?: TestTeam,
  ): Promise<SigChainWithTestTeam> {
    this.logger.debug(
      `Creating sigchain from test team`,
      testTeam?.team.teamName,
    )
    let thisTestTeam: TestTeam | undefined = testTeam
    if (thisTestTeam == null) {
      this.logger.debug(
        `Test team was undefined, creating a new one`,
        TEAM_NAME,
        SERVER_HOSTNAME,
      )
      thisTestTeam = await this.createTestTeam()
    }
    const sigchain = SigChain.create(
      thisTestTeam.team.save(),
      { server: thisTestTeam.server },
      thisTestTeam.team.teamKeyring(),
    )
    return {
      testTeam: thisTestTeam,
      sigchain,
    }
  }
}
