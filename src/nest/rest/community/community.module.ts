import { Module } from '@nestjs/common'
import { CommunityService } from './community.service.js'
import { CommunityController } from './community.controller.js'

@Module({
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
