export function pruneConnectionRates(
  connectionRates: Map<string, number[]>,
  windowStart: number,
): void {
  for (const [ip, timestamps] of connectionRates) {
    const recentTimestamps = timestamps.filter(t => t >= windowStart)
    if (recentTimestamps.length > 0) {
      connectionRates.set(ip, recentTimestamps)
    } else {
      connectionRates.delete(ip)
    }
  }
}
