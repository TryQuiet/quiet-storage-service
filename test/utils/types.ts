import type { Socket as ClientSocket } from 'socket.io-client';
import type { Socket as ServerSocket } from 'socket.io';

export enum NativeClientEvents {
    CONNECT = 'connect',
    DISCONNECT = 'disconnect',
    ERROR = 'error',
    RECONNECT = 'reconnect',
}

export interface TestSockets {
  client: ClientSocket
  server: ServerSocket
}