import { Module } from '@nestjs/common'
import { ConfigModule } from '../utils/config/config.module.js'
import { CommunitiesStorageService } from './storage/communities.storage.service.js'
import { StorageModule } from '../storage/storage.module.js'
import { EncryptionModule } from '../encryption/enc.module.js'
import { CommunitiesManagerService } from './communities-manager.service.js'
import { FastifyModule } from '../app/qss/fastify.module.js'

@Module({
  imports: [StorageModule, ConfigModule, EncryptionModule, FastifyModule],
  providers: [CommunitiesStorageService, CommunitiesManagerService],
  exports: [CommunitiesStorageService, CommunitiesManagerService],
})
export class CommunitiesModule {}
