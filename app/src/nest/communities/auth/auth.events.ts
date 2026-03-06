export enum AuthEvents {
  AuthDisconnected = 'authDisconnected',
}

export enum AuthDisconnectedReason {
  INTENDED = 'INTENDED',
  ERROR = 'ERROR',
}

export interface AuthDisconnectedPayload {
  userId: string
  teamId: string
  reason: AuthDisconnectedReason
}
