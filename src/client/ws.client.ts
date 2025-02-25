import { Injectable, Logger } from '@nestjs/common'
import sodium, { type CryptoKX, type KeyPair } from 'libsodium-wrappers-sumo'
import { connect, type Socket as ClientSocket } from 'socket.io-client'
import { WebsocketEncryptionService } from '../nest/encryption/ws.enc.service.js'
import { sleep } from '../nest/utils/sleep.js'
import {
  HandshakeMessage,
  HandshakeStatus,
  WebsocketEvents,
} from '../nest/websocket/ws.types.js'
import { Ping, Pong } from '../nest/websocket/handlers/types.js'
import { DateTime } from 'luxon'

@Injectable()
export class WebsocketClient {
  public clientSocket: ClientSocket | undefined = undefined
  private keyPair: KeyPair | undefined = undefined
  private sessionKey: CryptoKX | undefined = undefined

  private readonly logger = new Logger(WebsocketClient.name)

  constructor(private readonly encryption: WebsocketEncryptionService) {}

  public async createSocket(): Promise<ClientSocket> {
    this.logger.log(`Creating client socket`)
    this.keyPair = this.encryption.generateKeyPair()
    this.clientSocket = connect(
      `ws://${process.env.HOSTNAME}:${process.env.PORT}`,
      {
        autoConnect: false,
        forceNew: true,
        transports: ['websocket'],
        auth: {
          publicKey: sodium.to_base64(this.keyPair.publicKey),
        },
      },
    )
    await this._waitForConnect()

    return this.clientSocket
  }

  private async _waitForConnect(): Promise<void> {
    if (this.clientSocket == null || this.keyPair == null) {
      throw new Error(`Must run createSocket first!`)
    }

    this.clientSocket.on(
      WebsocketEvents.Handshake,
      (handshake: HandshakeMessage, callback: (...args: unknown[]) => void) => {
        if (handshake.status === HandshakeStatus.Error) {
          throw new Error(`Error during handshake: ${handshake.reason}`)
        }

        if (handshake.payload == null) {
          throw new Error(`Error during handshake: Payload was empty`)
        }

        this.sessionKey = this.encryption.generateSharedSessionKeyPair(
          this.keyPair!,
          sodium.from_base64(handshake.payload.publicKey),
          true,
        )
        callback({ status: HandshakeStatus.Success })
      },
    )

    this.clientSocket.connect()
    let count = 20
    while (!this.clientSocket.connected) {
      if (count < 0) {
        throw new Error(`Client didn't connect in time!`)
      }

      this.logger.log(`Waiting for client to finish connecting...`)
      await sleep(500)
      count--
    }

    this.logger.log(sodium.to_base64(this.sessionKey!.sharedRx))
    this.logger.log(sodium.to_base64(this.sessionKey!.sharedTx))
  }

  // public async sendMessage<T, V>(payload: T): Promise<V> {

  // }

  public async sendPing(): Promise<Pong> {
    if (this.clientSocket == null || this.sessionKey == null) {
      throw new Error(`Must run createSocket first!`)
    }

    const payload: Ping = {
      ts: DateTime.utc().toMillis(),
    }
    const encryptedPayload = this.encryption.encrypt(payload, this.sessionKey)
    const encryptedResponse = (await this.clientSocket.emitWithAck(
      WebsocketEvents.Ping,
      encryptedPayload,
    )) as string
    return this.encryption.decrypt(encryptedResponse, this.sessionKey) as Pong
  }

  public close(): void {
    if (this.clientSocket == null) {
      this.logger.warn(`Client socket wasn't open!`)
      return
    }

    this.logger.log(`Closing client socket`)
    this.clientSocket.close()
  }
}
