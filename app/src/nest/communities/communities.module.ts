import { Module } from '@nestjs/common'
import { CommunitiesStorageService } from './storage/communities.storage.service.js'
import { StorageModule } from '../storage/storage.module.js'
import { EncryptionModule } from '../encryption/enc.module.js'
import { CommunitiesManagerService } from './communities-manager.service.js'
import { FastifyModule } from '../app/qss/fastify.module.js'
import { CommunitiesDataSyncStorageService } from './storage/communities-data-sync.storage.service.js'
import { UtilsModule } from '../utils/utils.module.js'

@Module({
  imports: [UtilsModule, StorageModule, EncryptionModule, FastifyModule],
  providers: [
    CommunitiesStorageService,
    CommunitiesDataSyncStorageService,
    CommunitiesManagerService,
  ],
  exports: [
    CommunitiesStorageService,
    CommunitiesDataSyncStorageService,
    CommunitiesManagerService,
  ],
})
export class CommunitiesModule {}
