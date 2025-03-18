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
import { FASTIFY_ADAPTER, HOSTNAME, LISTEN_PORT } from '../const.js'
import { createLogger } from '../logger/nest.logger.js'

@Injectable()
export class QSSService {
  public app: NestFastifyApplication | undefined = undefined

  private readonly logger = createLogger(QSSService.name)

  constructor(
    @Inject(LISTEN_PORT) private readonly port: number,
    @Inject(HOSTNAME) private readonly hostname: string,
    @Inject(FASTIFY_ADAPTER) private readonly adapter: FastifyAdapter,
  ) {}

  public async init(): Promise<void> {
    this.logger.log(`Initializing QSS`)
    this.app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      this.adapter,
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

    this.logger.log(`Starting QSS`)
    await this.app.listen({
      port: this.port,
      host: this.hostname,
    })
  }

  public async close(): Promise<void> {
    if (this.app == null) {
      this.logger.warn(`App wasn't initialized, can't close!`)
      return
    }

    this.logger.log(`Closing QSS`)
    await this.app.close()
  }
}
