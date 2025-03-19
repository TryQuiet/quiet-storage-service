import { Module } from '@nestjs/common'
import { QSSService } from './qss.service.js'
import { FastifyModule } from './fastify.module.js'
import { StorageModule } from '../../storage/storage.module.js'

@Module({
  imports: [FastifyModule, StorageModule],
  providers: [QSSService],
})
export class QSSModule {}
