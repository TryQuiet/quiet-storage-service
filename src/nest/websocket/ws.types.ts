import type { CryptoKX } from 'libsodium-wrappers-sumo'

/**
 * Quiet-specific websocket event types
 */
export enum WebsocketEvents {
  Ping = 'ping',
  Pong = 'pong',
  Handshake = 'handshake',
}

/**
 * Socket.io client-specific websocket events
 */
export enum NativeClientWebsocketEvents {
  Connect = 'connect',
  Disconnect = 'disconnect',
  Error = 'error',
  Reconnect = 'reconnect',
  Reconnecting = 'reconnecting',
  ReconnectAttempt = 'reconnect_attempt',
  ReconnectError = 'reconnect_error',
  ReconnectFailed = 'reconnect_failed',
}

/**
 * Socket.io server-specific websocket events
 */
export enum NativeServerWebsocketEvents {
  Connection = 'connection',
}

export enum HandshakeStatus {
  Error = 'error',
  Active = 'active',
  Success = 'success',
}

export interface HandshakeMessage {
  status: HandshakeStatus
  reason?: string
  payload?: HandshakePayload
}

export interface HandshakePayload {
  publicKey: string
}

export interface ActiveConnection {
  sessionKey: CryptoKX
}
