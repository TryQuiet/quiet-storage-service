import { Test, type TestingModule } from '@nestjs/testing'
import { CommunitiesStorageService } from './communities.storage.service.js'
import { CommunitiesModule } from '../communities.module.js'

describe('CommunitesStorageService', () => {
  let communitesStorageService: CommunitiesStorageService | undefined =
    undefined

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CommunitiesModule],
    }).compile()

    communitesStorageService = module.get<CommunitiesStorageService>(
      CommunitiesStorageService,
    )
    await module.init()
  })

  it('should be defined', () => {
    expect(communitesStorageService).toBeDefined()
  })
})
