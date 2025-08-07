import { Module } from '@nestjs/common'
import { RedisClient } from './redis.client.js'

@Module({
  imports: [],
  providers: [RedisClient],
  exports: [RedisClient],
})
export class RedisModule {}
