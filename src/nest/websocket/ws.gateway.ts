/**
 * Manages the websocket server and websocket event handler initialization
 */

import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'

import { Server, Socket } from 'socket.io'
import { registerPingHandlers } from './handlers/ping.handler.js'
import {
  ActiveConnection,
  HandshakeMessage,
  HandshakeStatus,
  WebsocketEvents,
} from './ws.types.js'
import { WebsocketEncryptionService } from '../encryption/ws.enc.service.js'
import sodium, { CryptoKX } from 'libsodium-wrappers-sumo'
import { QuietNestLogger } from '../app/logger/nest.logger.js'

@WebSocketGateway({
  transports: ['websocket'],
  cors: {
    origin: '*',
  },
  path: '/socket.io',
  allowEIO3: true,
})
export class WebsocketGateway
  implements OnGatewayInit, OnGatewayConnection<Socket>, OnGatewayDisconnect
{
  private readonly logger = new QuietNestLogger(WebsocketGateway.name)
  private readonly connections: Map<string, ActiveConnection>

  // @ts-expect-error Initialized by Nest
  // Socket.io Server instance
  @WebSocketServer() io: Server

  constructor(private readonly encryption: WebsocketEncryptionService) {
    this.connections = new Map()
  }

  afterInit(): void {
    this.logger.log('Initialized')
  }

  /**
   * Called on any new client connection
   *
   * @param client Socket connection with a new client
   * @param args Extra arguments to the connection
   */
  async handleConnection(client: Socket, ...args: unknown[]): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- Decomposing from `this` is wild
    const { sockets } = this.io.sockets

    const sessionKey = await this._handleHandshake(
      client,
      sodium.from_base64(client.handshake.auth.publicKey as string),
    )
    if (sessionKey == null) {
      return
    }

    this.logger.log(
      `Client id: ${client.id} connected`,
      `Rooms: ${JSON.stringify([...client.rooms])}`,
    )
    this.logger.debug(`Number of connected clients: ${sockets.size}`)

    this._registerEventHandlers(client, sessionKey)
  }

  /**
   * Called on all client disconnects
   *
   * @param client Socket connection with a new client
   */
  handleDisconnect(client: Socket): void {
    this.logger.log(`Client id:${client.id} disconnected`)
  }

  /**
   * Register all event handlers for a given client
   *
   * @param client Socket connection with a new client
   */
  private _registerEventHandlers(client: Socket, sessionKey: CryptoKX): void {
    registerPingHandlers(this.io, client, sessionKey, this.encryption)
  }

  private async _handleHandshake(
    client: Socket,
    publicKey?: Uint8Array,
  ): Promise<CryptoKX | undefined> {
    if (publicKey == null) {
      this.logger.error(
        `Client sent an invalid handshake message on connect; disconnecting`,
      )
      const response: HandshakeMessage = {
        status: HandshakeStatus.Error,
        reason: 'Missing public key',
      }
      client.emit(WebsocketEvents.Handshake, response)
      client.disconnect(true)
      return undefined
    }

    const serverKey = this.encryption.generateKeyPair()
    const sessionKey = this.encryption.generateSharedSessionKeyPair(
      serverKey,
      publicKey,
    )
    this.logger.log(sodium.to_base64(sessionKey.sharedRx))
    this.logger.log(sodium.to_base64(sessionKey.sharedTx))
    const response: HandshakeMessage = {
      status: HandshakeStatus.Active,
      payload: {
        publicKey: sodium.to_base64(serverKey.publicKey),
      },
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- This is the type of the ack
      const ack = (await client
        .timeout(5_000)
        .emitWithAck(WebsocketEvents.Handshake, response)) as HandshakeMessage
      if (ack.status !== HandshakeStatus.Success) {
        this.logger.error(
          `Client returned an error on handshake response; disconnecting.  Reason:`,
          ack.reason,
        )
        client.disconnect(true)
        return undefined
      }
    } catch (e) {
      this.logger.error(
        `Error while sending public key to client on handshake; disconnecting.`,
        e,
      )
      client.disconnect(true)
      return undefined
    }

    this.connections.set(client.id, { sessionKey })
    return sessionKey
  }
}
