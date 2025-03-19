import { Module } from '@nestjs/common'
import { ConfigModule } from '../../utils/config/config.module.js'
import { RedisClient } from './redis.client.js'

@Module({
  imports: [ConfigModule],
  providers: [RedisClient],
  exports: [RedisClient],
})
export class RedisModule {}
