import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import Fastify, { type FastifyInstance } from 'fastify'

import { AppModule } from '../app/app.module.js'
import { NestFastifyLogger } from './nest.fastify.logger.js'

export class QSSService {
  public readonly fastify: FastifyInstance
  private readonly adapter: FastifyAdapter
  public app: NestFastifyApplication | undefined = undefined

  private readonly logger = new Logger(QSSService.name)

  constructor(
    private readonly port: number,
    private readonly hostname = 'localhost',
  ) {
    // @ts-expect-error Type is correct
    this.fastify = Fastify({
      logger: new NestFastifyLogger(),
    })
    // @ts-expect-error Type is correct
    this.adapter = new FastifyAdapter(this.fastify)
  }

  public async init(): Promise<QSSService> {
    this.logger.log(`Initializing QSS`)
    this.app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      this.adapter,
    )

    this.app.enableCors({
      origin: '*',
    })
    await this.app.init()
    return this
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
