import { Module } from '@nestjs/common'
import { PostgresClient } from './postgres.client.js'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import mikroOrmPostgresConfig from './mikro-orm.postgres.config.js'
import { Community } from '../../communities/storage/entities/community.entity.js'

@Module({
  imports: [
    MikroOrmModule.forRoot(mikroOrmPostgresConfig),
    MikroOrmModule.forFeature([Community]),
  ],
  providers: [PostgresClient],
  exports: [PostgresClient],
})
export class PostgresModule {}
