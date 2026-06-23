export interface WebsocketRateLimitConfig {
  windowMs: number
  maxAttemptsInWindow: number
  maxConcurrentPerIp: number
  cleanupIntervalMs: number
}
