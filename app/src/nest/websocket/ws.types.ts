import type { DefaultEventsMap, Server, Socket } from 'socket.io'

export interface QuietSocketData {
  verifiedCaptcha?: boolean
  usedCaptchaForKeys?: boolean
  usedCaptchaForCreateCommunity?: boolean
}

// TODO: lock down events maps to set of known events
export type QuietSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  QuietSocketData
>

export interface BaseHandlerConfig {
  socketServer: Server
  socket: QuietSocket
}

/**
 * Quiet-specific websocket event types
 */
export enum WebsocketEvents {
  // communities
  CreateCommunity = 'create-community',
  GetCommunity = 'get-community',
  SignInCommunity = 'sign-in-community',
  //// community auth
  GeneratePublicKeys = 'generate-public-keys',
  AuthSync = 'auth-sync',
  //// community log entry sync
  LogEntrySync = 'log-entry-sync',
  LogEntryPull = 'log-entry-pull',
  // captcha
  VerifyCaptcha = 'verify-captcha',
  GetCaptchaSiteKey = 'get-captcha-site-key',
  // QPS (push notifications)
  QPSRegisterDevice = 'register-device-token',
  QPSSendPush = 'qps-send-push',
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
