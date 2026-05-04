import type { DefaultEventsMap, Server, Socket } from 'socket.io'

export interface QuietSocketData {
  verifiedCaptcha?: boolean
  usedCaptchaForKeys?: boolean
  usedCaptchaForCreateCommunity?: boolean
  teamId?: string
  userId?: string
  attributionSource?: string
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

interface SocketAttribution {
  teamId?: string
  userId?: string
  source: string
}

export function setSocketAttribution(
  socket: QuietSocket,
  attribution: SocketAttribution,
): boolean {
  const { data } = socket
  const { source, teamId, userId } = attribution
  let attributionChanged = false

  if (teamId != null && teamId !== data.teamId) {
    data.teamId = teamId
    attributionChanged = true
  }

  if (userId != null && userId !== data.userId) {
    data.userId = userId
    attributionChanged = true
  }

  if (attributionChanged || data.attributionSource == null) {
    const sourceChanged = source !== data.attributionSource
    data.attributionSource = source
    return attributionChanged || sourceChanged
  }

  return false
}

export function formatSocketAttribution(socket: QuietSocket): string {
  const { data, id } = socket
  const { attributionSource, teamId, userId } = data

  return [
    `socketId=${formatLogValue(id)}`,
    `teamId=${formatLogValue(teamId)}`,
    `userId=${formatLogValue(userId)}`,
    `attributionSource=${formatLogValue(attributionSource)}`,
  ].join(' ')
}

export function formatSocketPeer(socket: QuietSocket): string {
  const { handshake } = socket
  const { address, headers } = handshake

  return [
    `remoteAddress=${formatLogValue(address)}`,
    `forwardedFor=${formatLogValue(
      headerValueToString(headers['x-forwarded-for']),
    )}`,
    `cfConnectingIp=${formatLogValue(
      headerValueToString(headers['cf-connecting-ip']),
    )}`,
    `userAgent=${formatLogValue(headerValueToString(headers['user-agent']))}`,
  ].join(' ')
}

export function getClientIp(socket: QuietSocket): string {
  const { handshake } = socket
  const { address, headers } = handshake

  const cfIp = headerValueToString(headers['cf-connecting-ip'])
  if (cfIp.length > 0) return cfIp

  const forwardedFor = headerValueToString(headers['x-forwarded-for'])
  if (forwardedFor.length > 0) {
    // x-forwarded-for may be comma-separated; leftmost entry is the originating client
    const first = forwardedFor.split(',')[0].trim()
    if (first.length > 0) return first
  }

  return address
}

function headerValueToString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(',')
  }
  return value ?? ''
}

function formatLogValue(value: string | undefined): string {
  if (value == null || value.length === 0) {
    return '"unknown"'
  }

  const normalizedValue = value.replace(/\s+/g, ' ')
  const truncatedValue =
    normalizedValue.length > 256
      ? `${normalizedValue.slice(0, 253)}...`
      : normalizedValue
  return JSON.stringify(truncatedValue)
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
  QPSSendBatchPush = 'qps-send-batch-push',
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
