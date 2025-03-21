import type { BaseHandlerOptions } from '../../ws.types.js'

export interface PingHandlerOptions extends BaseHandlerOptions {}

export interface Ping {
  ts: number
}

export interface Pong {
  success: boolean
  reason?: string
  ts: number
}
