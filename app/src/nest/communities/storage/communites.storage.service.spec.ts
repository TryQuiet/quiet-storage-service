import { Test, type TestingModule } from '@nestjs/testing'
import { CommunitiesStorageService } from './communities.storage.service.js'
import { CommunitiesModule } from '../communities.module.js'
import { StorageModule } from '../../storage/storage.module.js'
import { ConfigModule } from '../../utils/config/config.module.js'

describe('CommunitesStorageService', () => {
  let communitesStorageService: CommunitiesStorageService | undefined =
    undefined

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CommunitiesModule, StorageModule, ConfigModule],
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
