import { Injectable } from '@nestjs/common'
import { CreateCommunityDto } from './dto/create-community.dto'
import { Community } from './entities/community.entity'

@Injectable()
export class CommunityService {
  private communities: Community[] = []

  public create(createCommunityDto: CreateCommunityDto): Community {
    const community: Community = {
      id: createCommunityDto.id,
      name: createCommunityDto.name,
    }
    this.communities.push(community)
    return community
  }

  public findAll(): Community[] {
    return this.communities
  }

  public findOne(query: { id?: string; name?: string }): Community | undefined {
    if (query.id == null && query.name == null) {
      throw new Error(`Must pass in an id or name to filter on`)
    }

    return this.communities.find(value => {
      if (query.id != null) {
        return value.id === query.id
      }

      return value.name === query.name
    })
  }

  public remove(query: { id?: string; name?: string }): boolean {
    if (query.id == null && query.name == null) {
      throw new Error(`Must pass in an id or name to filter on`)
    }

    const community = this.communities.find(value => {
      if (query.id != null) {
        return value.id === query.id
      }

      return value.name === query.name
    })

    if (community == null) {
      return false
    }

    this.communities = this.communities.filter(value => {
      if (query.id != null) {
        return value.id !== query.id
      }

      return value.name !== query.name
    })

    return true
  }
}
