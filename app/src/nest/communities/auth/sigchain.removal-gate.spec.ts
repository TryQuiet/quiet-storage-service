import { jest } from '@jest/globals'
import {
  createFirstUseDevice,
  createServer,
  createTeam,
  createUser,
  deriveUserId,
  deviceSigner,
  redactServer,
  type Keyring,
  type Team,
  type TeamAction,
  type UserWithSecrets,
} from '@localfirst/auth'
import { append, serialize } from '@localfirst/crdx'
import { SigChain } from './sigchain.js'

describe('QSS removal policy', () => {
  it('keeps a server and its original keys after a signed removal, including reload', () => {
    const foundingDevice = createFirstUseDevice({ deviceName: 'owner' })
    const userId = deriveUserId(foundingDevice.deviceId)
    const user = createUser('owner', userId) as UserWithSecrets
    const device = { ...foundingDevice, userId }
    const owner = createTeam('removal gate', { user, device }) as Team
    const server = createServer({ host: 'relay.example' })
    owner.addServer(redactServer(server))
    const keyring = owner.teamKeyring() as Keyring
    const relay = SigChain.create(owner.save(), { server }, keyring)

    // Capture a real producer's removal/rotation payload, then sign it below
    // without going through the honest client's outbound gate.
    let action: TeamAction | undefined
    const captured = new Error('captured removal')
    const dispatch = jest.spyOn(owner, 'dispatch').mockImplementation(value => {
      action = value
      throw captured
    })
    try {
      expect(() => {
        owner.removeServer(server.serverId)
      }).toThrow(captured)
    } finally {
      dispatch.mockRestore()
    }
    if (action == null) throw new Error('Expected a removal action')
    const modifiedGraph = append({
      graph: owner.graph,
      action,
      signer: deviceSigner(device),
      keys: owner.teamKeys(),
    })

    relay.team.merge(modifiedGraph)
    const fromPeerBytes = SigChain.create(
      serialize(modifiedGraph),
      { server },
      keyring,
    )
    const restarted = SigChain.create(relay.serialize(), { server }, keyring)
    for (const replica of [relay, fromPeerBytes, restarted]) {
      expect(replica.team.hasServer(server.serverId)).toBe(true)
      expect(replica.team.teamKeys().generation).toBe(0)
      replica.clearListeners()
    }
  })
})
