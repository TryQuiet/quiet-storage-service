export const QPS_MAX_BATCH_UCANS = 500

export enum QpsErrorReason {
  PushNotificationServiceNotAvailable = 'Push notification service not available',
  UnknownRegistrationError = 'Unknown error during registration',
  RegistrationFailed = 'Registration failed',
  InvalidUcanToken = 'Invalid UCAN token',
  DeviceTokenNoLongerValid = 'Device token no longer valid',
  PushNotificationFailed = 'Push notification failed',
  BatchPushFailed = 'Batch push failed',
  InvalidBatchPayload = 'Invalid batch push payload',
  BatchSizeExceedsLimit = 'Batch size exceeds limit of 500',
  NoValidDeviceTokens = 'No valid device tokens',
  AllPushNotificationsFailed = 'All push notifications failed',
  SocketNotSignedIntoTeam = 'Socket is not signed into this team',
  SocketNotSignedIntoUcanTeam = 'Socket is not signed into the team associated with this UCAN',
  SocketNotSignedIntoAnyUcanTeam = 'Socket is not signed into any team associated with these UCANs',
}
