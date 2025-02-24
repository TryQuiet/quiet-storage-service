import { Test, type TestingModule } from '@nestjs/testing'
import { CommunityController } from './community.controller.js'
import { CommunityService } from './community.service.js'

describe('CommunityController', () => {
  let controller: CommunityController | undefined = undefined
  const id = '12345'

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

  describe('Create', () => {
    it('creates a community', () => {
      const community = controller?.create({
        id,
        name: 'foobar',
      })
      expect(community?.id).toBe(id)
    })
  })

  describe('Find One', () => {
    it('finds a community', () => {
      const community = controller?.findOne(id)
      expect(community?.id).toBe(id)
    })
  })

  describe('Remove', () => {
    it('removes a community', () => {
      const result = controller?.remove(id)
      expect(result).toBeDefined()
      expect(result?.removed).toBeTruthy()
    })
  })
})
