import { SigChain } from './sigchain.js'
import { ServerKeyManagerService } from '../../encryption/server-key-manager.service.js'
import { Test, type TestingModule } from '@nestjs/testing'
import { EncryptionModule } from '../../encryption/enc.module.js'
import { TeamTestUtils } from '../../../../test/utils/team.utils.js'
import type { TestTeam } from '../../../../test/utils/types.js'
import * as uint8arrays from 'uint8arrays'

describe('SigChain', () => {
  let module: TestingModule | undefined = undefined
  let serverKeyManager: ServerKeyManagerService | undefined = undefined
  let testTeamUtils: TeamTestUtils | undefined = undefined

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [EncryptionModule],
    }).compile()
    await module.init()

    serverKeyManager = module.get<ServerKeyManagerService>(
      ServerKeyManagerService,
    )

    testTeamUtils = new TeamTestUtils(serverKeyManager)
  })

  afterEach(async () => {
    await module?.close()
  })

  it('should be defined', () => {
    expect(module).toBeDefined()
    expect(serverKeyManager).toBeDefined()
    expect(testTeamUtils).toBeDefined()
  })

  it('should load a sig chain from seralized data and have valid serialized form', async () => {
    if (testTeamUtils == null) {
      throw new Error(`Didn't initialize team test utils!`)
    }

    const testTeam: TestTeam = await testTeamUtils.createTestTeam()
    const sigchain = SigChain.create(
      testTeam.team.save(),
      { server: testTeam.server },
      testTeam.team.teamKeyring(),
    )
    expect(sigchain.serialize()).toEqual(testTeam.team.save())
  })

  it('should load a sig chain from seralized data and have valid hex form', async () => {
    if (testTeamUtils == null) {
      throw new Error(`Didn't initialize team test utils!`)
    }

    const testTeam: TestTeam = await testTeamUtils.createTestTeam()
    const sigchain = SigChain.create(
      testTeam.team.save(),
      { server: testTeam.server },
      testTeam.team.teamKeyring(),
    )
    const hexChain = sigchain.serialize(true)
    const hexBaseChain = uint8arrays.toString(testTeam.team.save(), 'hex')
    expect(hexChain).toEqual(hexBaseChain)
  })
})
