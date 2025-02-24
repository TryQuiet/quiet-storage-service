import { Test, type TestingModule } from '@nestjs/testing'
import { CommunityController } from './community.controller'
import { CommunityService } from './community.service'

describe('CommunityController', () => {
  let controller: CommunityController | undefined = undefined

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunityController],
      providers: [CommunityService],
    }).compile()

    controller = module.get<CommunityController>(CommunityController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
