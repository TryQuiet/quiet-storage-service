import { Module } from '@nestjs/common'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { ConfigModule } from '../utils/config/config.module.js'
import mikroOrmPostgresConfig from './postgres/mikro-orm.postgres.config.js'
import { PostgresClient } from './postgres/postgres.client.js'

@Module({
  imports: [ConfigModule, MikroOrmModule.forRoot(mikroOrmPostgresConfig)],
  providers: [PostgresClient],
  exports: [PostgresClient],
})
export class StorageModule {}
