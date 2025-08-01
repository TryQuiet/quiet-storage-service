import { Inject, Injectable } from '@nestjs/common'
import { connect, type Socket as ClientSocket } from 'socket.io-client'
import { sleep } from '../nest/utils/sleep.js'
import { WebsocketEvents } from '../nest/websocket/ws.types.js'
import { createLogger } from '../nest/app/logger/logger.js'
import { HOSTNAME, LISTEN_PORT } from '../nest/app/const.js'

@Injectable()
export class WebsocketClient {
  public clientSocket: ClientSocket | undefined = undefined
  private readonly uri: string | undefined = undefined

  private readonly logger = createLogger(WebsocketClient.name)

  constructor(
    @Inject(LISTEN_PORT) private readonly serverPort: number,
    @Inject(HOSTNAME) private readonly serverHostname: string,
  ) {}

  public async createSocket(): Promise<ClientSocket> {
    this.logger.log(`Creating client socket`)

    this.clientSocket = connect(
      `ws://${this.serverHostname}:${this.serverPort}`,
      {
        autoConnect: false,
        forceNew: true,
        transports: ['websocket'],
      },
    )
    await this._waitForConnect()

    return this.clientSocket
  }

  private async _waitForConnect(): Promise<void> {
    if (this.clientSocket == null) {
      throw new Error(`Must run createSocket first!`)
    }

    this.clientSocket.connect()
    let count = 20
    while (!this.clientSocket.connected) {
      if (count < 0) {
        throw new Error(`Client didn't connect in time!`)
      }

      this.logger.log(`Waiting for client to finish connecting...`, this.uri)
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
    if (this.clientSocket == null) {
      throw new Error(`Must run createSocket first!`)
    }

    if (withAck) {
      return (await this.clientSocket.emitWithAck(event, payload)) as T
    }

    try {
      this.clientSocket.emit(event, payload)
    } catch (e) {
      this.logger.error('Error while emitting event to QSS')
    }
    return undefined
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
