import { Module } from '@nestjs/common'
import { CommunityStorageService } from './community.storage.service.js'
import { PostgresModule } from '../storage-clients/postgres/postgres.module.js'
import { ConfigModule } from '../../utils/config/config.module.js'

@Module({
  imports: [PostgresModule, ConfigModule],
  providers: [CommunityStorageService],
  exports: [CommunityStorageService],
})
export class CommunitiesModule {}
