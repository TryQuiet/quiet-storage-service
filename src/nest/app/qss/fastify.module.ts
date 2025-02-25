import { Module } from '@nestjs/common'
import {
  DEFAULT_HOSTNAME,
  DEFAULT_LISTEN_PORT,
  FASTIFY,
  FASTIFY_ADAPTER,
  HOSTNAME,
  LISTEN_PORT,
} from '../const.js'
import { NestFastifyLogger } from '../logger/nest.fastify.logger.js'
import Fastify, { FastifyInstance } from 'fastify'
import { FastifyAdapter } from '@nestjs/platform-fastify'

@Module({
  providers: [
    NestFastifyLogger,
    {
      provide: FASTIFY,
      useFactory: (fastifyLogger: NestFastifyLogger) =>
        Fastify({
          logger: fastifyLogger,
        }),
      inject: [NestFastifyLogger],
    },
    {
      provide: FASTIFY_ADAPTER,
      // @ts-expect-error Not sure why it disagrees with the typing here
      useFactory: (fastify: FastifyInstance) => new FastifyAdapter(fastify),
      inject: [FASTIFY],
    },
    {
      provide: LISTEN_PORT,
      useValue: process.env.PORT ?? DEFAULT_LISTEN_PORT,
    },
    {
      provide: HOSTNAME,
      useValue: process.env.HOSTNAME ?? DEFAULT_HOSTNAME,
    },
  ],
  exports: [FASTIFY, FASTIFY_ADAPTER, LISTEN_PORT, HOSTNAME],
})
export class FastifyModule {}
