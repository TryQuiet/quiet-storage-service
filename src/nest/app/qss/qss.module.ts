import { Module } from '@nestjs/common'
import { QSSService } from './qss.service.js'
import { FastifyModule } from './fastify.module.js'

@Module({
  imports: [FastifyModule],
  providers: [QSSService],
})
export class QSSModule {}
