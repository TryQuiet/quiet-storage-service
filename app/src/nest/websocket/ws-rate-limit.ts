export function countConcurrentConnections(
  socketIps: Iterable<string>,
  ip: string,
): number {
  let count = 0
  for (const socketIp of socketIps) {
    if (socketIp === ip) {
      count++
    }
  }
  return count
}

export function recordConnectionAttempt(
  connectionRates: Map<string, number[]>,
  ip: string,
  now: number,
  windowMs: number,
): number {
  const windowStart = now - windowMs
  const recentTimestamps = (connectionRates.get(ip) ?? []).filter(
    timestamp => timestamp >= windowStart,
  )

  recentTimestamps.push(now)
  connectionRates.set(ip, recentTimestamps)
  return recentTimestamps.length
}

export function pruneConnectionRates(
  connectionRates: Map<string, number[]>,
  now: number,
  windowMs: number,
): void {
  const windowStart = now - windowMs

  for (const [ip, timestamps] of connectionRates.entries()) {
    const recentTimestamps = timestamps.filter(
      timestamp => timestamp >= windowStart,
    )

    if (recentTimestamps.length === 0) {
      connectionRates.delete(ip)
      continue
    }

    connectionRates.set(ip, recentTimestamps)
  }
}
