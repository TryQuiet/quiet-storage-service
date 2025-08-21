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
  KeysetWithSecrets,
  generateProof,
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
    withServer: boolean = true,
    teamName: string = TEAM_NAME,
    serverHostname: string = SERVER_HOSTNAME,
    userName: string = 'username',
    deviceName: string = randomUUID(),
  ): Promise<TestTeam> {
    this.logger.debug(
      `Creating test team`,
      teamName,
      serverHostname,
      userName,
      deviceName,
    )
    const user = createUser(userName) as UserWithSecrets
    const device = createDevice({
      userId: user.userId,
      deviceName: deviceName,
    })
    const testUserContext: LocalUserContext = { user, device }
    const team = createTeam(teamName, testUserContext) as Team
    team.addRole('member')
    team.addMemberRole(user.userId, 'member')

    let serverKeys: KeysetWithSecrets | undefined = undefined
    let server: Server | undefined = undefined

    if (withServer) {
      serverKeys = createKeyset(
        { type: 'SERVER', name: SERVER_HOSTNAME },
        this.serverKeyManager.generateRandomBytes(32, 'base64'),
      )
      server = {
        host: SERVER_HOSTNAME,
        keys: redactKeys(serverKeys) as Keyset,
      }
      team.addServer(server)
    }

    return {
      team,
      serverKeys,
      server,
      testUserContext,
      otherUsers: [],
    }
  }

  public async addUserToTeam(
    testTeam: TestTeam,
    userName: string,
    deviceName: string = randomUUID(),
  ): Promise<TestTeam> {
    this.logger.info(
      'Adding new user to the test team',
      userName,
      testTeam.team.id,
    )
    const user = createUser(userName) as UserWithSecrets
    const device = createDevice({
      userId: user.userId,
      deviceName: deviceName,
    })
    const testUserContext: LocalUserContext = { user, device }
    const invitation = testTeam.team.inviteMember()
    testTeam.team.admitMember(
      generateProof(invitation.seed),
      user.keys,
      userName,
    )
    testTeam.otherUsers.push(testUserContext)
    return testTeam
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
