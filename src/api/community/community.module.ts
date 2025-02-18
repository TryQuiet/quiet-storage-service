import { Module } from '@nestjs/common'
import { CommunityService } from './community.service'
import { CommunityController } from './community.controller'

@Module({
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
