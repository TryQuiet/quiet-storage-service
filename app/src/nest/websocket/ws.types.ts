import type { CryptoKX } from 'libsodium-wrappers-sumo'
import type { Server, Socket } from 'socket.io'
import type { WebsocketEncryptionService } from '../encryption/ws.enc.service.js'

export interface BaseHandlerOptions {
  socketServer: Server
  socket: Socket
  sessionKey: CryptoKX
  encryption: WebsocketEncryptionService
}

/**
 * Quiet-specific websocket event types
 */
export enum WebsocketEvents {
  Ping = 'ping',
  Pong = 'pong',
  Handshake = 'handshake',
  CreateCommunity = 'create-community',
  UpdateCommunity = 'update-community',
  GetCommunity = 'get-community',
  GeneratePublicKeys = 'generate-public-keys',
  AuthSync = 'auth-sync',
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

export interface BaseWebsocketMessage<T extends object | undefined> {
  ts: number
  payload: T
}

export interface BaseStatusPayload<T extends object | undefined> {
  status: string
  reason?: string
  payload?: T
}

export enum HandshakeStatus {
  Error = 'error',
  Active = 'active',
  Success = 'success',
}

export interface InnerHandshakePayload {
  publicKey: string
}
export interface HandshakePayload
  extends BaseStatusPayload<InnerHandshakePayload> {
  status: HandshakeStatus
  reason?: string
  payload?: InnerHandshakePayload
}

export interface HandshakeMessage
  extends BaseWebsocketMessage<HandshakePayload> {
  ts: number
  payload: HandshakePayload
}

export interface ActiveConnection {
  sessionKey: CryptoKX
}
