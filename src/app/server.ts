import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import Fastify, { type FastifyInstance } from 'fastify'

import { AppModule } from 'src/app/app.module'
import { NestFastifyLogger } from './nest.fastify.logger'

export class QSS {
  public readonly fastify: FastifyInstance
  private readonly adapter: FastifyAdapter
  public app: NestFastifyApplication

  private readonly logger = new Logger(QSS.name)

  constructor(private readonly port: number) {
    this.fastify = Fastify({
      logger: new NestFastifyLogger(),
    })
    this.adapter = new FastifyAdapter(this.fastify)
  }

  public async init(): Promise<QSS> {
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
    await this.app.listen({
      port: 3004,
      host: 'localhost',
    })
  }

  public async close(): Promise<void> {
    await this.app.close()
  }
}
