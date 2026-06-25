import { EnvVars } from '../utils/config/env_vars.js'
import {
  DEFAULT_WEBSOCKET_RATE_LIMIT_CONFIG,
  getWebsocketRateLimitConfig,
} from './ws-rate-limit.config.js'

describe('websocket rate limit config', () => {
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

  afterAll(() => {
    restoreRateLimitEnv({
      connectionRateWindowMs: originalConnectionRateWindowMs,
      connectionRateMaxAttempts: originalConnectionRateMaxAttempts,
      maxConcurrentConnectionsPerIp: originalMaxConcurrentConnectionsPerIp,
      connectionRateCleanupIntervalMs: originalConnectionRateCleanupIntervalMs,
    })
  })

  it('uses generous defaults when websocket rate limit env vars are not set', () => {
    expect(getWebsocketRateLimitConfig()).toEqual(
      DEFAULT_WEBSOCKET_RATE_LIMIT_CONFIG,
    )
  })

  it('uses explicit positive integer env overrides', () => {
    process.env[EnvVars.WS_CONNECTION_RATE_WINDOW_MS] = '120000'
    process.env[EnvVars.WS_CONNECTION_RATE_MAX_ATTEMPTS] = '400'
    process.env[EnvVars.WS_MAX_CONCURRENT_CONNECTIONS_PER_IP] = '300'
    process.env[EnvVars.WS_CONNECTION_RATE_CLEANUP_INTERVAL_MS] = '30000'

    expect(getWebsocketRateLimitConfig()).toEqual({
      windowMs: 120_000,
      maxAttemptsInWindow: 400,
      maxConcurrentPerIp: 300,
      cleanupIntervalMs: 30_000,
    })
  })

  it('rejects invalid explicit env overrides', () => {
    for (const value of ['0', '-1', '1.5', '10abc', 'Infinity']) {
      process.env[EnvVars.WS_CONNECTION_RATE_WINDOW_MS] = value

      expect(() => getWebsocketRateLimitConfig()).toThrow(
        `${EnvVars.WS_CONNECTION_RATE_WINDOW_MS} must be a positive integer`,
      )
    }
  })
})

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
