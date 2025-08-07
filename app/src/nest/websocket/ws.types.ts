import type { Server, Socket } from 'socket.io'

export interface BaseHandlerConfig {
  socketServer: Server
  socket: Socket
}

/**
 * Quiet-specific websocket event types
 */
export enum WebsocketEvents {
  // bullshit
  Ping = 'ping',
  Pong = 'pong',
  // communities
  CreateCommunity = 'create-community',
  GetCommunity = 'get-community',
  SignInCommunity = 'sign-in-community',
  //// community auth
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
  Disconnect = 'disconnect',
}

export interface BaseWebsocketMessage<T extends object | undefined> {
  ts: number
  status: string
  reason?: string
  payload?: T
}
