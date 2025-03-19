import { Module } from '@nestjs/common'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { ConfigModule } from '../utils/config/config.module.js'
import mikroOrmPostgresConfig from './postgres/mikro-orm.postgres.config.js'
import { PostgresClient } from './postgres/postgres.client.js'
import { RedisModule } from './redis/redis.module.js'
import { RedisClient } from './redis/redis.client.js'

@Module({
  imports: [
    ConfigModule,
    MikroOrmModule.forRoot(mikroOrmPostgresConfig),
    RedisModule,
  ],
  providers: [PostgresClient, RedisClient],
  exports: [PostgresClient, RedisClient],
})
export class StorageModule {}
