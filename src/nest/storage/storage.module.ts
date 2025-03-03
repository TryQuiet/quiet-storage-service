import { Module } from '@nestjs/common'
import { ConfigModule } from '../utils/config/config.module.js'
import { CommunitiesModule } from './communities/communities.module.js'

@Module({
  imports: [ConfigModule, CommunitiesModule],
  providers: [],
  exports: [],
})
export class StorageModule {}
