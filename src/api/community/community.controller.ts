import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common'
import { CommunityService } from './community.service.js'
import { CreateCommunityDto } from './dto/create-community.dto.js'
import { Community } from './entities/community.entity.js'

@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Post()
  public create(@Body() createCommunityDto: CreateCommunityDto): Community {
    return this.communityService.create(createCommunityDto)
  }

  @Get()
  public findAll(): Community[] {
    return this.communityService.findAll()
  }

  @Get(':id')
  public findOne(@Param('id') id: string): Community | undefined {
    return this.communityService.findOne({ id })
  }

  @Delete(':id')
  public remove(@Param('id') id: string): { removed: boolean } {
    return {
      removed: this.communityService.remove({ id }),
    }
  }
}
