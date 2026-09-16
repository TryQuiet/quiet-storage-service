export enum AuthEvents {
  AuthDisconnected = 'authDisconnected',
}

export interface AuthDisconnectedPayload {
  userId: string
  deviceId: string
  teamId: string
}
