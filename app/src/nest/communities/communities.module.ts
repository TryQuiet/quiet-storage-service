import { Module } from '@nestjs/common'
import { CommunitiesStorageService } from './storage/communities.storage.service.js'
import { StorageModule } from '../storage/storage.module.js'
import { EncryptionModule } from '../encryption/enc.module.js'
import { CommunitiesManagerService } from './communities-manager.service.js'
import { FastifyModule } from '../app/qss/fastify.module.js'
import { CommunitiesDataStorageService } from './storage/communities-data.storage.service.js'

@Module({
  imports: [StorageModule, EncryptionModule, FastifyModule],
  providers: [
    CommunitiesStorageService,
    CommunitiesDataStorageService,
    CommunitiesManagerService,
  ],
  exports: [
    CommunitiesStorageService,
    CommunitiesDataStorageService,
    CommunitiesManagerService,
  ],
})
export class CommunitiesModule {}
