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
import { ConfigModule } from '../../utils/config/config.module.js'
import { ConfigService } from '../../utils/config/config.service.js'
import { EnvVars } from '../../utils/config/env_vars.js'

@Module({
  imports: [ConfigModule],
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
      useFactory: (configService: ConfigService) =>
        configService.getInt(EnvVars.PORT, DEFAULT_LISTEN_PORT),
      inject: [ConfigService],
    },
    {
      provide: HOSTNAME,
      useFactory: (configService: ConfigService) =>
        configService.getString(EnvVars.HOSTNAME, DEFAULT_HOSTNAME),
      inject: [ConfigService],
    },
    {
      provide: LISTEN_HOSTNAME,
      useFactory: (configService: ConfigService) =>
        configService.getString(
          EnvVars.LISTEN_HOSTNAME,
          DEFAULT_LISTEN_HOSTNAME,
        ),
      inject: [ConfigService],
    },
  ],
  exports: [FASTIFY, FASTIFY_ADAPTER, LISTEN_PORT, HOSTNAME, LISTEN_HOSTNAME],
})
export class FastifyModule {}
