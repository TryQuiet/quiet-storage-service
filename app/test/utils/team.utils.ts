import {
  createFirstUseDevice,
  createServer,
  createTeam,
  createUser,
  deriveUserId,
  invitation,
  MemberInvitationClaim,
  redactDevice,
  redactKeys,
  redactServer,
  Server,
  ServerWithSecrets,
  UserWithSecrets,
  Team,
  LocalUserContext,
} from '@localfirst/auth'
import { randomKey, type Base58 } from '@localfirst/crypto'
import { createLogger } from '../../src/nest/app/logger/logger.js'
import { ServerKeyManagerService } from '../../src/nest/encryption/server-key-manager.service.js'
import { SigChainWithTestTeam, TestTeam } from './types.js'
import { randomUUID } from 'crypto'
import { SigChain } from '../../src/nest/communities/auth/sigchain.js'

const SERVER_HOSTNAME = 'test-server-hostname'
const TEAM_NAME = 'test-team-name'

/**
 * Mint an identity the way local-first-auth requires: a user's id is derived from their founding
 * device, so the device has to exist before the id is known. Mint the first-use device, derive the
 * userId from it, create the user, then attach the userId to the device.
 */
function mintIdentity(userName: string, deviceName: string): LocalUserContext {
  const foundingDevice = createFirstUseDevice({ deviceName })
  const userId = deriveUserId(foundingDevice.deviceId)
  const user = createUser(userName, userId) as UserWithSecrets
  const device = { ...foundingDevice, userId }
  return { user, device }
}

/**
 * Build the material an invitee hands an admin to be admitted: a nonce-bound proof of invitation,
 * the identity claim it was signed over, and a possession proof signed by the new device.
 */
function buildMemberAdmission(seed: string, context: LocalUserContext) {
  const claim: MemberInvitationClaim = {
    invitationKind: 'member',
    userName: context.user.userName,
    memberKeys: redactKeys(context.user.keys),
    device: redactDevice(context.device),
  }
  const nonces = {
    acceptorNonce: randomKey() as Base58,
    inviteeNonce: randomKey() as Base58,
  }
  const proof = invitation.generateProof({ seed, claim, ...nonces })
  const possessionProof = invitation.createPossessionProof({
    invitationId: invitation.deriveId(seed),
    claim,
    device: context.device,
  })
  return { proof, claim, possessionProof }
}

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
    const testUserContext = mintIdentity(userName, deviceName)
    const { user } = testUserContext
    const team = createTeam(teamName, testUserContext, undefined, {
      selfAssignableRoles: ['member'],
    }) as Team
    team.addRole('member')
    team.addMemberRole(user.userId, 'member')

    let serverWithSecrets: ServerWithSecrets | undefined = undefined
    let server: Server | undefined = undefined

    if (withServer) {
      // A server has a self-certifying identity (identityKeys, fingerprinted as serverId) plus a
      // rotatable member keyset; the public record we register is the redaction.
      serverWithSecrets = createServer({
        host: SERVER_HOSTNAME,
        seed: this.serverKeyManager.generateRandomBytes(32, 'base64'),
      })
      server = redactServer(serverWithSecrets)
      team.addServer(server)
    }

    return {
      team,
      serverWithSecrets,
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
    const testUserContext = mintIdentity(userName, deviceName)
    const invite = testTeam.team.inviteMember()
    // Under key-bound invitations, admission takes the proof, the identity claim it was signed over,
    // and a possession proof signed by the new device.
    const admission = buildMemberAdmission(invite.seed, testUserContext)
    testTeam.team.admitMember(
      admission.proof,
      admission.claim,
      admission.possessionProof,
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
      { server: thisTestTeam.serverWithSecrets! },
      thisTestTeam.team.teamKeyring(),
    )
    return {
      testTeam: thisTestTeam,
      sigchain,
    }
  }
}
