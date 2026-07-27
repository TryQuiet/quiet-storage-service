export function getDeviceId(device: unknown): string {
  if (
    typeof device !== 'object' ||
    device == null ||
    !('deviceId' in device) ||
    typeof device.deviceId !== 'string' ||
    device.deviceId.length === 0
  ) {
    throw new Error('Device ID is missing')
  }

  return device.deviceId
}
