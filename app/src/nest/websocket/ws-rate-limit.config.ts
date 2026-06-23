import { ConfigService } from '../utils/config/config.service.js'
import { EnvVars } from '../utils/config/env_vars.js'
import type { WebsocketRateLimitConfig } from './ws-rate-limit.types.js'

export const DEFAULT_WEBSOCKET_RATE_LIMIT_CONFIG: WebsocketRateLimitConfig = {
  windowMs: 60_000,
  maxAttemptsInWindow: 300,
  maxConcurrentPerIp: 250,
  cleanupIntervalMs: 60_000,
}

export function getWebsocketRateLimitConfig(): WebsocketRateLimitConfig {
  return {
    windowMs: getPositiveInteger(
      EnvVars.WS_CONNECTION_RATE_WINDOW_MS,
      DEFAULT_WEBSOCKET_RATE_LIMIT_CONFIG.windowMs,
    ),
    maxAttemptsInWindow: getPositiveInteger(
      EnvVars.WS_CONNECTION_RATE_MAX_ATTEMPTS,
      DEFAULT_WEBSOCKET_RATE_LIMIT_CONFIG.maxAttemptsInWindow,
    ),
    maxConcurrentPerIp: getPositiveInteger(
      EnvVars.WS_MAX_CONCURRENT_CONNECTIONS_PER_IP,
      DEFAULT_WEBSOCKET_RATE_LIMIT_CONFIG.maxConcurrentPerIp,
    ),
    cleanupIntervalMs: getPositiveInteger(
      EnvVars.WS_CONNECTION_RATE_CLEANUP_INTERVAL_MS,
      DEFAULT_WEBSOCKET_RATE_LIMIT_CONFIG.cleanupIntervalMs,
    ),
  }
}

function getPositiveInteger(key: EnvVars, defaultValue: number): number {
  const rawValue = ConfigService.getString(key)
  if (rawValue == null) {
    return defaultValue
  }

  const value = Number(rawValue)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`)
  }

  return value
}
