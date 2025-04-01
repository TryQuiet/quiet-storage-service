import { Module } from '@nestjs/common'
import {
  DEFAULT_HOSTNAME,
  DEFAULT_LISTEN_HOSTNAME,
  DEFAULT_LISTEN_PORT,
  FASTIFY,
  FASTIFY_ADAPTER,
  HOSTNAME,
  LISTEN_HOSTNAME,
  LISTEN_PORT,
} from '../const.js'
import { NestFastifyLogger } from '../logger/nest.fastify.logger.js'
import Fastify, { FastifyInstance } from 'fastify'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { ConfigService } from '../../utils/config/config.service.js'
import { EnvVars } from '../../utils/config/env_vars.js'

@Module({
  imports: [],
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
      useFactory: () => ConfigService.getInt(EnvVars.PORT, DEFAULT_LISTEN_PORT),
    },
    {
      provide: HOSTNAME,
      useFactory: () =>
        ConfigService.getString(EnvVars.HOSTNAME, DEFAULT_HOSTNAME),
    },
    {
      provide: LISTEN_HOSTNAME,
      useFactory: () =>
        ConfigService.getString(
          EnvVars.LISTEN_HOSTNAME,
          DEFAULT_LISTEN_HOSTNAME,
        ),
    },
  ],
  exports: [FASTIFY, FASTIFY_ADAPTER, LISTEN_PORT, HOSTNAME, LISTEN_HOSTNAME],
})
export class FastifyModule {}
