import { jest } from '@jest/globals'
import type { Server } from 'socket.io'

import type { CommunitiesManagerService } from '../communities/communities-manager.service.js'
import type { LogEntrySyncStorageService } from '../communities/storage/log-entry-sync.storage.service.js'
import type { CommunitiesStorageService } from '../communities/storage/communities.storage.service.js'
import type { LogEntrySyncManager } from '../communities/sync/log-entry-sync.service.js'
import type { CaptchaService } from '../utils/captcha.js'
import { EnvVars } from '../utils/config/env_vars.js'
import { WebsocketGateway } from './ws.gateway.js'
import type { QuietSocket } from './ws.types.js'

describe('WebsocketGateway rate limiting', () => {
  let originalConnectionRateWindowMs: string | undefined
  let originalConnectionRateMaxAttempts: string | undefined
  let originalMaxConcurrentConnectionsPerIp: string | undefined
  let originalConnectionRateCleanupIntervalMs: string | undefined

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- grouped env snapshot is clearer than four separate reads
    const {
      WS_CONNECTION_RATE_WINDOW_MS,
      WS_CONNECTION_RATE_MAX_ATTEMPTS,
      WS_MAX_CONCURRENT_CONNECTIONS_PER_IP,
      WS_CONNECTION_RATE_CLEANUP_INTERVAL_MS,
    } = process.env

    originalConnectionRateWindowMs = WS_CONNECTION_RATE_WINDOW_MS
    originalConnectionRateMaxAttempts = WS_CONNECTION_RATE_MAX_ATTEMPTS
    originalMaxConcurrentConnectionsPerIp = WS_MAX_CONCURRENT_CONNECTIONS_PER_IP
    originalConnectionRateCleanupIntervalMs =
      WS_CONNECTION_RATE_CLEANUP_INTERVAL_MS
  })

  beforeEach(() => {
    clearRateLimitEnv()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    restoreRateLimitEnv({
      connectionRateWindowMs: originalConnectionRateWindowMs,
      connectionRateMaxAttempts: originalConnectionRateMaxAttempts,
      maxConcurrentConnectionsPerIp: originalMaxConcurrentConnectionsPerIp,
      connectionRateCleanupIntervalMs: originalConnectionRateCleanupIntervalMs,
    })
  })

  it('does not let spoofed forwarded headers bypass the per-peer concurrent limit', () => {
    process.env[EnvVars.WS_MAX_CONCURRENT_CONNECTIONS_PER_IP] = '1'

    const gateway = createGateway()
    const firstClient = createSocket({
      id: 'first-socket',
      address: '203.0.113.10',
      forwardedFor: '198.51.100.10',
    })
    const secondClient = createSocket({
      id: 'second-socket',
      address: '203.0.113.10',
      forwardedFor: '198.51.100.20',
    })

    gateway.handleConnection(firstClient)
    gateway.handleConnection(secondClient)

    // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
    expect(firstClient.disconnect).not.toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock assertion
    expect(secondClient.disconnect).toHaveBeenCalledWith(true)
  })
})

function createGateway(): WebsocketGateway {
  const gateway = new WebsocketGateway(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- constructor deps are not used by this rate-limit test
    {} as unknown as CommunitiesStorageService,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- constructor deps are not used by this rate-limit test
    {} as unknown as LogEntrySyncStorageService,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- constructor deps are not used by this rate-limit test
    {} as unknown as CommunitiesManagerService,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- constructor deps are not used by this rate-limit test
    {} as unknown as LogEntrySyncManager,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- constructor deps are not used by this rate-limit test
    {} as unknown as CaptchaService,
  )
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- minimal Socket.IO server shape used by handleConnection logging
  gateway.io = {
    sockets: {
      sockets: new Map(),
    },
  } as unknown as Server
  return gateway
}

function createSocket(config: {
  id: string
  address: string
  forwardedFor: string
}): jest.Mocked<QuietSocket> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- minimal socket shape used by gateway rate-limit path
  return {
    id: config.id,
    rooms: new Set([config.id]),
    data: {},
    handshake: {
      address: config.address,
      headers: {
        'x-forwarded-for': config.forwardedFor,
        'cf-connecting-ip': config.forwardedFor,
        'user-agent': 'Quiet Test',
      },
    },
    on: jest.fn(),
    disconnect: jest.fn(),
  } as unknown as jest.Mocked<QuietSocket>
}

function clearRateLimitEnv(): void {
  delete process.env.WS_CONNECTION_RATE_WINDOW_MS
  delete process.env.WS_CONNECTION_RATE_MAX_ATTEMPTS
  delete process.env.WS_MAX_CONCURRENT_CONNECTIONS_PER_IP
  delete process.env.WS_CONNECTION_RATE_CLEANUP_INTERVAL_MS
}

function restoreRateLimitEnv(config: {
  connectionRateWindowMs: string | undefined
  connectionRateMaxAttempts: string | undefined
  maxConcurrentConnectionsPerIp: string | undefined
  connectionRateCleanupIntervalMs: string | undefined
}): void {
  clearRateLimitEnv()

  const {
    connectionRateWindowMs,
    connectionRateMaxAttempts,
    maxConcurrentConnectionsPerIp,
    connectionRateCleanupIntervalMs,
  } = config

  if (connectionRateWindowMs != null) {
    process.env.WS_CONNECTION_RATE_WINDOW_MS = connectionRateWindowMs
  }
  if (connectionRateMaxAttempts != null) {
    process.env.WS_CONNECTION_RATE_MAX_ATTEMPTS = connectionRateMaxAttempts
  }
  if (maxConcurrentConnectionsPerIp != null) {
    process.env.WS_MAX_CONCURRENT_CONNECTIONS_PER_IP =
      maxConcurrentConnectionsPerIp
  }
  if (connectionRateCleanupIntervalMs != null) {
    process.env.WS_CONNECTION_RATE_CLEANUP_INTERVAL_MS =
      connectionRateCleanupIntervalMs
  }
}
