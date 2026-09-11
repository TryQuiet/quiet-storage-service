import { jest } from '@jest/globals'
import { createServer as createHttpServer } from 'node:http'
import { Server, type DefaultEventsMap } from 'socket.io'
import { io, type Socket as ClientSocket } from 'socket.io-client'
import { createServer } from '@localfirst/auth'
import { registerCaptchaHandlers } from './captcha.handler.js'
import { registerCommunitiesAuthHandlers } from './auth.handler.js'
import { registerCommunitiesHandlers } from './communities.handler.js'
import { WebsocketEvents, type QuietSocketData } from '../ws.types.js'
import {
  CommunityOperationStatus,
  type CaptchaHandlerConfig,
  type CommunitiesHandlerConfig,
} from './types/common.types.js'
import type { HCaptchaSiteVerifyResponse } from '../../utils/captcha.js'
import type { GeneratePublicKeysMessage } from './types/gen-pub-keys.types.js'
import type { CaptchaVerifyResponse } from './types/captcha.types.js'
import type { CreateCommunityResponse } from './types/create-community.types.js'

interface ClientEvents {
  [WebsocketEvents.VerifyCaptcha]: (
    message: { payload: { token: string } },
    acknowledge: (response: CaptchaVerifyResponse) => void,
  ) => void
  [WebsocketEvents.GeneratePublicKeys]: (
    message: { payload: { teamId: string } },
    acknowledge: (response: GeneratePublicKeysMessage) => void,
  ) => void
  [WebsocketEvents.CreateCommunity]: (
    message: {
      payload: {
        community: { teamId: string }
        teamKeyring: string
        userId: string
      }
    },
    acknowledge: (response: CreateCommunityResponse) => void,
  ) => void
}

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let finish!: () => void
  const promise = new Promise<void>(resolve => {
    finish = resolve
  })
  return { promise, resolve: finish }
}

describe('captcha grants over Socket.IO', () => {
  let socketServer: Server<
    DefaultEventsMap,
    DefaultEventsMap,
    DefaultEventsMap,
    QuietSocketData
  >
  let client: ClientSocket<DefaultEventsMap, ClientEvents>
  let dropNextKeyAck: boolean
  const getServerKeys =
    jest.fn<(_teamId: string) => Promise<ReturnType<typeof createServer>>>()
  const createCommunity = jest.fn<() => Promise<void>>()
  const verifyToken =
    jest.fn<(_token: string) => Promise<HCaptchaSiteVerifyResponse>>()

  beforeEach(async () => {
    getServerKeys
      .mockReset()
      .mockImplementation(
        async () => await Promise.resolve(createServer({ host: 'qss.test' })),
      )
    createCommunity.mockReset().mockResolvedValue()
    const usedTokens = new Set<string>()
    verifyToken.mockReset().mockImplementation(async token => {
      if (token === 'invalid' || usedTokens.has(token)) {
        return await Promise.resolve({
          success: false,
          'error-codes': ['invalid-or-already-seen-response'],
        })
      }
      usedTokens.add(token)
      return await Promise.resolve({ success: true })
    })
    dropNextKeyAck = false
    const httpServer = createHttpServer()
    socketServer = new Server(httpServer, { transports: ['websocket'] })
    socketServer.on('connection', socket => {
      socket.use((packet, next) => {
        if (
          dropNextKeyAck &&
          packet[0] === String(WebsocketEvents.GeneratePublicKeys)
        ) {
          dropNextKeyAck = false
          packet[2] = () => {
            // Deliberately lose the response after provisioning.
          }
        }
        next()
      })
      // Real event registration and grant logic; external verification/storage are
      // controlled to exercise response loss and overlapping asynchronous work.
      registerCaptchaHandlers({
        socketServer,
        socket,
        captchaService: { verifyToken },
      } as unknown as CaptchaHandlerConfig)
      const config = {
        socketServer,
        socket,
        communitiesManager: { getServerKeys, create: createCommunity },
      } as unknown as CommunitiesHandlerConfig
      registerCommunitiesAuthHandlers(config)
      registerCommunitiesHandlers(config)
    })
    await new Promise<void>(resolve =>
      httpServer.listen(0, '127.0.0.1', resolve),
    )
    const address = httpServer.address()
    if (address == null || typeof address === 'string')
      throw new Error('Expected TCP address')
    client = io(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
    })
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve)
      client.once('connect_error', reject)
    })
  })

  afterEach(async () => {
    client.close()
    await new Promise<void>(resolve => {
      void socketServer.close(() => {
        resolve()
      })
    })
  })

  const verify = async (token: string): Promise<CaptchaVerifyResponse> => {
    client.timeout(2000)
    return await client.emitWithAck(WebsocketEvents.VerifyCaptcha, {
      payload: { token },
    })
  }
  const keys = async (teamId: string): Promise<GeneratePublicKeysMessage> => {
    client.timeout(2000)
    return await client.emitWithAck(WebsocketEvents.GeneratePublicKeys, {
      payload: { teamId },
    })
  }
  const create = async (teamId: string): Promise<CreateCommunityResponse> => {
    client.timeout(2000)
    return await client.emitWithAck(WebsocketEvents.CreateCommunity, {
      payload: {
        community: { teamId },
        teamKeyring: 'test-keyring',
        userId: 'test-user',
      },
    })
  }

  it('recovers a lost key response for the same team without granting another team', async () => {
    expect((await verify('first-token')).status).toBe('success')
    dropNextKeyAck = true
    await expect(
      client.timeout(75).emitWithAck(WebsocketEvents.GeneratePublicKeys, {
        payload: { teamId: 'team-a' },
      }),
    ).rejects.toThrow()
    const retry = await keys('team-a')
    expect(retry.status).toBe('success')
    expect(retry.payload?.teamId).toBe('team-a')
    expect(retry.payload?.serverId).toEqual(expect.any(String))
    expect(retry.payload?.identityKeys).not.toHaveProperty(
      'signature.secretKey',
    )
    expect((await keys('team-a')).payload).toEqual(retry.payload)
    expect((await keys('team-b')).reason).toBe('Captcha verification required')
    expect(getServerKeys).toHaveBeenCalledTimes(1)
    expect(verifyToken).toHaveBeenCalledTimes(1)
  })

  it('reserves one team before awaiting keys and shares concurrent same-team requests', async () => {
    await verify('first-token')
    const entered = deferred()
    const release = deferred()
    getServerKeys.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      return createServer({ host: 'qss.test' })
    })
    const first = keys('team-a')
    await entered.promise
    const duplicates = [keys('team-a'), keys('team-a')]
    expect((await keys('team-b')).reason).toBe('Captcha verification required')
    expect(getServerKeys).toHaveBeenCalledTimes(1)
    release.resolve()
    const responses = await Promise.all([first, ...duplicates])
    expect(
      responses.every(
        response => response.status === CommunityOperationStatus.SUCCESS,
      ),
    ).toBe(true)
    expect(responses.map(response => response.payload)).toEqual(
      Array(3).fill(responses[0].payload),
    )
  })

  it('renews consumed grants only after verifying a fresh token, never by replaying a success', async () => {
    await verify('first-token')
    await keys('team-a')
    expect((await verify('first-token')).status).toBe('success')
    expect(verifyToken).toHaveBeenCalledTimes(1)
    expect((await keys('team-b')).reason).toBe('Captcha verification required')
    expect((await verify('invalid')).status).toBe('error')
    expect((await keys('team-b')).reason).toBe('Captcha verification required')
    expect((await verify('fresh-token')).status).toBe('success')
    expect(verifyToken).toHaveBeenCalledWith('fresh-token')
    expect((await keys('team-b')).status).toBe('success')
    expect((await verify('first-token')).status).toBe('error')
    expect((await keys('team-c')).reason).toBe('Captcha verification required')
  })

  it('shares verification of an identical pending token and rejects a competing renewal', async () => {
    const entered = deferred()
    const release = deferred()
    verifyToken.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      return { success: true }
    })
    const first = verify('first-token')
    await entered.promise
    const duplicate = verify('first-token')
    expect((await verify('another-token')).status).toBe('error')
    expect(verifyToken).toHaveBeenCalledTimes(1)
    release.resolve()
    expect(
      (await Promise.all([first, duplicate])).map(response => response.status),
    ).toEqual(['success', 'success'])
  })

  it('does not let old provisioning completion overwrite a renewed grant', async () => {
    await verify('first-token')
    const entered = deferred()
    const release = deferred()
    getServerKeys.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      return createServer({ host: 'qss.test' })
    })
    const oldRequest = keys('team-a')
    await entered.promise
    await verify('fresh-token')
    const newResponse = await keys('team-b')
    release.resolve()
    expect((await oldRequest).status).toBe('success')
    expect((await keys('team-b')).payload).toEqual(newResponse.payload)
    expect((await keys('team-c')).reason).toBe('Captcha verification required')
    expect(getServerKeys).toHaveBeenCalledTimes(2)
  })

  it('retries failed provisioning for its reserved team without allowing cross-team fanout', async () => {
    await verify('first-token')
    getServerKeys.mockRejectedValueOnce(new Error('temporary storage failure'))
    expect((await keys('team-a')).status).toBe('error')
    expect((await keys('team-b')).reason).toBe('Captcha verification required')
    expect((await keys('team-a')).status).toBe('success')
    expect(getServerKeys).toHaveBeenCalledTimes(2)
  })

  it('consumes creation before awaiting it and does not consume a newly verified grant on completion', async () => {
    await verify('first-token')
    const entered = deferred()
    const release = deferred()
    createCommunity.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
    })
    const oldRequest = create('team-a')
    await entered.promise
    expect((await create('team-b')).reason).toBe(
      'Captcha verification required',
    )
    await verify('fresh-token')
    release.resolve()
    expect((await oldRequest).status).toBe('success')
    expect((await create('team-b')).status).toBe('success')
    expect(createCommunity).toHaveBeenCalledTimes(2)
  })

  it('requires a fresh verified captcha after a failed creation', async () => {
    await verify('first-token')
    createCommunity.mockRejectedValueOnce(new Error('storage failed'))
    expect((await create('team-a')).status).toBe('error')
    expect((await create('team-a')).reason).toBe(
      'Captcha verification required',
    )
    await verify('first-token')
    expect((await create('team-a')).reason).toBe(
      'Captcha verification required',
    )
    await verify('fresh-token')
    expect((await create('team-a')).status).toBe('success')
    expect(createCommunity).toHaveBeenCalledTimes(2)
  })

  it('clears failed verification in flight so a later token can be checked', async () => {
    verifyToken.mockRejectedValueOnce(new Error('provider unavailable'))
    expect((await verify('first-token')).status).toBe('error')
    expect((await keys('team-a')).reason).toBe('Captcha verification required')
    expect((await verify('fresh-token')).status).toBe('success')
    expect((await keys('team-a')).status).toBe('success')
    expect(verifyToken).toHaveBeenCalledTimes(2)
  })
})
