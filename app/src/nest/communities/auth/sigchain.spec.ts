import {
  createKeyset,
  createUser,
  type Keyset,
  redactKeys,
  type KeysetWithSecrets,
  type UserWithSecrets,
} from '@localfirst/crdx'
import { SigChain } from './sigchain.js'
import { randomUUID } from 'crypto'
import {
  createDevice,
  createTeam,
  type Server,
  type Team,
} from '@localfirst/auth'
import { ServerKeyManagerService } from '../../encryption/server-key-manager.service.js'
import { Test, type TestingModule } from '@nestjs/testing'
import { EncryptionModule } from '../../encryption/enc.module.js'
import * as uint8arrays from 'uint8arrays'

describe('SigChain', () => {
  let module: TestingModule | undefined = undefined
  let serverKeyManager: ServerKeyManagerService | undefined = undefined
  let baseTeam: Team | undefined = undefined
  let serverKeys: KeysetWithSecrets | undefined = undefined

  const SERVER_HOSTNAME = 'test-server-hostname'

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [EncryptionModule],
    }).compile()
    await module.init()

    serverKeyManager = module.get<ServerKeyManagerService>(
      ServerKeyManagerService,
    )

    const user = createUser('username') as UserWithSecrets
    const device = createDevice({
      userId: user.userId,
      deviceName: randomUUID(),
    })
    baseTeam = createTeam('foobar', { user, device }) as Team

    serverKeys = createKeyset(
      { type: 'SERVER', name: SERVER_HOSTNAME },
      serverKeyManager.generateRandomBytes(32, 'base64'),
    )
    const server: Server = {
      host: SERVER_HOSTNAME,
      keys: redactKeys(serverKeys) as Keyset,
    }
    baseTeam.addServer(server)
  })

  it('should be defined', () => {
    expect(module).toBeDefined()
    expect(serverKeyManager).toBeDefined()
    expect(baseTeam).toBeDefined()
    expect(serverKeys).toBeDefined()
  })

  it('should load a sig chain from seralized data and have valid serialized form', () => {
    if (baseTeam == null) {
      throw new Error(`Team was not defined!`)
    }
    const sigchain = SigChain.create(
      baseTeam.save(),
      { server: { host: SERVER_HOSTNAME, keys: serverKeys } },
      baseTeam.teamKeyring(),
    )
    expect(sigchain.serialize()).toEqual(baseTeam.save())
  })

  it('should load a sig chain from seralized data and have valid hex form', () => {
    if (baseTeam == null) {
      throw new Error(`Team was not defined!`)
    }
    const sigchain = SigChain.create(
      baseTeam.save(),
      { server: { host: SERVER_HOSTNAME, keys: serverKeys } },
      baseTeam.teamKeyring(),
    )
    const hexChain = sigchain.serialize(true)
    const hexBaseChain = uint8arrays.toString(baseTeam.save(), 'hex')
    expect(hexChain).toEqual(hexBaseChain)
  })
})
