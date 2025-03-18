import { Module } from '@nestjs/common'
import { ConfigModule } from '../utils/config/config.module.js'
import { CommunityStorageService } from './storage/communities.storage.service.js'
import { StorageModule } from '../storage/storage.module.js'

@Module({
  imports: [StorageModule, ConfigModule],
  providers: [CommunityStorageService],
  exports: [CommunityStorageService],
})
export class CommunitiesModule {}
