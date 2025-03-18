import { Inject, Injectable } from '@nestjs/common'
import type { CryptoKX, KeyPair } from 'libsodium-wrappers-sumo'
import { connect, type Socket as ClientSocket } from 'socket.io-client'
import { WebsocketEncryptionService } from '../nest/encryption/ws.enc.service.js'
import { sleep } from '../nest/utils/sleep.js'
import {
  HandshakeMessage,
  HandshakeStatus,
  WebsocketEvents,
} from '../nest/websocket/ws.types.js'
import { createLogger } from '../nest/app/logger/logger.js'
import { HOSTNAME, LISTEN_PORT } from '../nest/app/const.js'
import { DateTime } from 'luxon'

@Injectable()
export class WebsocketClient {
  public clientSocket: ClientSocket | undefined = undefined
  private keyPair: KeyPair | undefined = undefined
  private sessionKey: CryptoKX | undefined = undefined

  private readonly logger = createLogger(WebsocketClient.name)

  constructor(
    @Inject(LISTEN_PORT) private readonly serverPort: number,
    @Inject(HOSTNAME) private readonly serverHostname: string,
    private readonly encryption: WebsocketEncryptionService,
  ) {}

  public async createSocket(): Promise<ClientSocket> {
    this.logger.log(`Creating client socket`)

    this.keyPair = this.encryption.generateKeyPair()
    this.clientSocket = connect(
      `ws://${this.serverHostname}:${this.serverPort}`,
      {
        autoConnect: false,
        forceNew: true,
        transports: ['websocket'],
        auth: {
          publicKey: this.encryption.toBase64(this.keyPair.publicKey),
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
        if (handshake.payload.status === HandshakeStatus.Error) {
          throw new Error(`Error during handshake: ${handshake.payload.reason}`)
        }

        if (handshake.payload.payload == null) {
          throw new Error(`Error during handshake: Payload was empty`)
        }

        this.sessionKey = this.encryption.generateSharedSessionKeyPair(
          this.keyPair!,
          this.encryption.fromBase64(handshake.payload.payload.publicKey),
          true,
        )
        callback({
          ts: DateTime.utc().toMillis(),
          payload: { status: HandshakeStatus.Success },
        })
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
  }

  public async sendMessage<T>(
    event: WebsocketEvents,
    payload: unknown,
    withAck = false,
  ): Promise<T | undefined> {
    this.logger.debug(`Sending message`, event)
    if (this.clientSocket == null || this.sessionKey == null) {
      throw new Error(`Must run createSocket first!`)
    }

    const encryptedPayload = this.encryptPayload(payload)
    if (withAck) {
      const encryptedResponse = (await this.clientSocket.emitWithAck(
        event,
        encryptedPayload,
      )) as string
      return this.decryptPayload(encryptedResponse) as T
    }

    this.clientSocket.emit(event, encryptedPayload)
    return undefined
  }

  public encryptPayload(payload: unknown): string {
    if (this.clientSocket == null || this.sessionKey == null) {
      throw new Error(`Must run createSocket first!`)
    }

    return this.encryption.encrypt(payload, this.sessionKey)
  }

  public decryptPayload(encryptedPayload: string): unknown {
    if (this.clientSocket == null || this.sessionKey == null) {
      throw new Error(`Must run createSocket first!`)
    }

    return this.encryption.decrypt(encryptedPayload, this.sessionKey)
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
