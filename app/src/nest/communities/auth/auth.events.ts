export enum AuthEvents {
  AuthDisconnected = 'authDisconnected',
}

export interface AuthDisconnectedPayload {
  userId: string
  teamId: string
}
