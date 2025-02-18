import { Test, type TestingModule } from '@nestjs/testing'
import { CommunityService } from './community.service'

describe('CommunityService', () => {
  let service: CommunityService | undefined = undefined

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommunityService],
    }).compile()

    service = module.get<CommunityService>(CommunityService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
