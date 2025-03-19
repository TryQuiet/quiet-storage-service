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
  public app: NestFastifyApplication | undefined = undefined

  private readonly logger = createLogger(QSSService.name)

  constructor(
    @Inject(LISTEN_PORT) private readonly port: number,
    @Inject(LISTEN_HOSTNAME) private readonly listenHostname: string,
    @Inject(FASTIFY_ADAPTER) private readonly adapter: FastifyAdapter,
    private readonly postgresClient: PostgresClient,
  ) {}

  public async init(): Promise<void> {
    this.logger.log(`Initializing QSS`)
    this.app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      this.adapter,
      {
        logger: createLogger('Nest'),
      },
    )

    this.app.enableCors({
      origin: '*',
    })
    await this.app.init()
  }

  public async start(): Promise<void> {
    if (this.app == null) {
      throw new Error(`Must initialize app before starting!`)
    }

    this.logger.log(
      `Starting QSS and listening on: `,
      this.listenHostname,
      this.port,
    )
    await this.app.listen({
      port: this.port,
      host: this.listenHostname,
    })
  }

  public async close(): Promise<void> {
    if (this.app == null) {
      this.logger.warn(`App wasn't initialized, can't close!`)
      return
    }

    this.logger.log(`Closing QSS`)
    await this.app.close()

    this.logger.log(`Closing postgres`)
    await this.postgresClient.close()
  }
}
