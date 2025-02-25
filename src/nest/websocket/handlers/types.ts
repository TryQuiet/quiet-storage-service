export interface Ping {
  ts: number
}

export interface Pong {
  success: boolean
  reason?: string
  ts: number
}
