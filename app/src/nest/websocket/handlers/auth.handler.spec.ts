import { jest } from '@jest/globals'
import { WebsocketEvents } from '../ws.types.js'
import { CommunityOperationStatus } from './types/common.types.js'
import type { AuthConnection } from '../../communities/auth/auth.connection.js'
import type { CommunitiesManagerService } from '../../communities/communities-manager.service.js'
import type { ManagedCommunity } from '../../communities/types.js'
import type { Server } from 'socket.io'
import type { CommunitiesHandlerConfig } from './types/common.types.js'
import type { QuietSocket } from '../ws.types.js'

const mockDecodedPayload = new Uint8Array([1, 2, 3])
const mockFromString = jest.fn(() => mockDecodedPayload)

jest.unstable_mockModule('uint8arrays', () => ({
  fromString: mockFromString,
}))

const { registerCommunitiesAuthHandlers } = await import('./auth.handler.js')

describe('Communities auth WebSocket handlers', () => {
  let mockCommunitiesManager: jest.Mocked<
    Pick<CommunitiesManagerService, 'get'>
  >
  let mockSocket: jest.Mocked<QuietSocket>
  let mockServer: jest.Mocked<Server>
  let handlers: Map<string, (...args: unknown[]) => unknown>

  const teamId = 'team-1'
  const userId = 'user-1'
  const encodedMessage = 'base64-auth-sync-payload'

  beforeEach(() => {
    handlers = new Map()
    mockFromString.mockClear()

    mockCommunitiesManager = {
      get: jest.fn(),
    } as unknown as jest.Mocked<Pick<CommunitiesManagerService, 'get'>>

    mockSocket = {
      id: 'message-socket-id',
      data: {},
      on: jest.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(event, handler)
        return mockSocket
      }),
    } as unknown as jest.Mocked<QuietSocket>

    mockServer = {} as unknown as jest.Mocked<Server>
    const mockStorage = Object.create(
      null,
    ) as CommunitiesHandlerConfig['storage']
    const mockDataSyncStorage = Object.create(
      null,
    ) as CommunitiesHandlerConfig['dataSyncStorage']

    const config: CommunitiesHandlerConfig = {
      socketServer: mockServer,
      socket: mockSocket,
      communitiesManager:
        mockCommunitiesManager as unknown as CommunitiesManagerService,
      storage: mockStorage,
      dataSyncStorage: mockDataSyncStorage,
    }

    registerCommunitiesAuthHandlers(config)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  function buildAuthConnection(socketId: string): {
    authConnection: AuthConnection
    deliver: jest.Mock
    emit: jest.Mock
  } {
    const deliver = jest.fn()
    const emit = jest.fn()
    const authConnection = {
      socketId,
      lfaConnection: {
        deliver,
        emit,
      },
    } as unknown as AuthConnection

    return { authConnection, deliver, emit }
  }

  function buildCommunity(authConnection: AuthConnection): ManagedCommunity {
    return {
      authConnections: new Map([[userId, authConnection]]),
    } as unknown as ManagedCommunity
  }

  async function callAuthSyncHandler(): Promise<void> {
    const handler = handlers.get(WebsocketEvents.AuthSync)!
    await handler({
      ts: Date.now(),
      status: CommunityOperationStatus.SUCCESS,
      payload: {
        teamId,
        userId,
        message: encodedMessage,
      },
    })
  }

  it('should reject auth-sync for an auth connection owned by a different socket without decoding or delivering', async () => {
    const { authConnection, deliver, emit } =
      buildAuthConnection('owning-socket-id')
    mockCommunitiesManager.get.mockResolvedValue(buildCommunity(authConnection))

    await callAuthSyncHandler()

    // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
    expect(mockCommunitiesManager.get).toHaveBeenCalledWith(teamId)
    expect(mockFromString).not.toHaveBeenCalled()
    expect(deliver).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })

  it('should decode and deliver auth-sync for the socket that owns the auth connection', async () => {
    const { authConnection, deliver, emit } = buildAuthConnection(mockSocket.id)
    mockCommunitiesManager.get.mockResolvedValue(buildCommunity(authConnection))

    await callAuthSyncHandler()

    expect(mockFromString).toHaveBeenCalledWith(encodedMessage, 'base64')
    expect(deliver).toHaveBeenCalledWith(mockDecodedPayload)
    expect(emit).not.toHaveBeenCalled()
  })
})
