/**
 * Service for handling setup and initializtion of QSS application
 */

import { Inject, Injectable } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'

import { AppModule } from '../app.module.js'
import { FASTIFY_ADAPTER, LISTEN_HOSTNAME, LISTEN_PORT } from '../const.js'
import { createLogger } from '../logger/logger.js'
import { PostgresClient } from '../../storage/postgres/postgres.client.js'

@Injectable()
export class QSSService {
  public static app: NestFastifyApplication | undefined = undefined
  public static started = false

  private readonly logger = createLogger(QSSService.name)

  constructor(
    @Inject(LISTEN_PORT) private readonly port: number,
    @Inject(LISTEN_HOSTNAME) private readonly listenHostname: string,
    @Inject(FASTIFY_ADAPTER) private readonly adapter: FastifyAdapter,
    private readonly postgresClient: PostgresClient,
  ) {}

  /**
   * Create and initialize the Nest app
   */
  public async init(): Promise<void> {
    if (QSSService.app != null) {
      throw new Error('Nest application already initialized!')
    }

    this.logger.log(`Initializing QSS`)
    QSSService.app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      this.adapter,
      {
        logger: createLogger('Nest'),
      },
    )

    QSSService.app.enableCors({
      origin: '*',
    })
    await QSSService.app.init()
  }

  /**
   * Start listening on the server
   */
  public async start(): Promise<void> {
    if (QSSService.app == null) {
      throw new Error(`Must initialize app before starting!`)
    }

    if (QSSService.started) {
      throw new Error('App already started!')
    }

    this.logger.log(
      `Starting QSS and listening on: `,
      this.listenHostname,
      this.port,
    )
    await QSSService.app.listen({
      port: this.port,
      host: this.listenHostname,
    })
    QSSService.started = true
  }

  /**
   * Shutdown the application and close the database connection
   */
  public async close(): Promise<void> {
    if (QSSService.app == null) {
      this.logger.warn(`App wasn't initialized, can't close!`)
      return
    }

    this.logger.log(`Closing QSS`)
    await QSSService.app.close()

    this.logger.log(`Closing postgres`)
    await this.postgresClient.close()

    QSSService.started = false
  }
}
