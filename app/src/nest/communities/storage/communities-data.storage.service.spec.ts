import { Test, type TestingModule } from '@nestjs/testing'
import { CommunitiesModule } from '../communities.module.js'
import { StorageModule } from '../../storage/storage.module.js'
import type { CommunitiesData } from '../types.js'
import { SodiumHelper } from '../../encryption/sodium.helper.js'
import { EncryptionModule } from '../../encryption/enc.module.js'
import { CommunitiesDataStorageService } from './communities-data.storage.service.js'
import { DateTime } from 'luxon'

describe('CommunitesDataStorageService', () => {
  let communitiesDataStorageService: CommunitiesDataStorageService | undefined =
    undefined
  let sodiumHelper: SodiumHelper | undefined = undefined
  let module: TestingModule | undefined = undefined

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [CommunitiesModule, StorageModule, EncryptionModule],
    }).compile()
    await module.init()

    communitiesDataStorageService = module.get<CommunitiesDataStorageService>(
      CommunitiesDataStorageService,
    )
    sodiumHelper = module.get<SodiumHelper>(SodiumHelper)
  })

  afterEach(async () => {
    await communitiesDataStorageService?.clearRepository()
    await module?.close()
  })

  it('should be defined', () => {
    expect(module).toBeDefined()
    expect(communitiesDataStorageService).toBeDefined()
    expect(sodiumHelper).toBeDefined()
  })

  it('should write a community data record to postgres', async () => {
    const data: CommunitiesData = {
      cid: sodiumHelper!.sodium.to_hex(
        sodiumHelper!.sodium.randombytes_buf(32),
      ),
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      communityId: 'communityId',
      receivedAt: DateTime.utc(),
    }
    expect(await communitiesDataStorageService?.addCommunitiesData(data)).toBe(
      true,
    )
  })

  it('should fail to write a community to postgres on duplicate ID', async () => {
    const cid = sodiumHelper!.sodium.to_hex(
      sodiumHelper!.sodium.randombytes_buf(32),
    )
    const data: CommunitiesData = {
      cid,
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      communityId: 'communityId',
      receivedAt: DateTime.utc(),
    }
    expect(await communitiesDataStorageService?.addCommunitiesData(data)).toBe(
      true,
    )

    const dupeIdData: CommunitiesData = {
      cid,
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      communityId: 'communityId',
      receivedAt: DateTime.utc(),
    }
    expect(
      await communitiesDataStorageService?.addCommunitiesData(dupeIdData),
    ).toBe(false)
  })

  it('should fail to write a community data record to postgres when receivedAt is nullish', async () => {
    const data: CommunitiesData = {
      cid: sodiumHelper!.sodium.to_hex(
        sodiumHelper!.sodium.randombytes_buf(32),
      ),
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      communityId: 'communityId',
      receivedAt: undefined,
    }
    expect(await communitiesDataStorageService?.addCommunitiesData(data)).toBe(
      false,
    )
  })

  it('should write and then get an array of all records for a community ID', async () => {
    const filterTs = DateTime.utc().toMillis() - 500
    const payloads: CommunitiesData[] = [
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc(),
      },
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc(),
      },
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc(),
      },
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc(),
      },
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'otherId',
        receivedAt: DateTime.utc(),
      },
    ]
    for (const payload of payloads) {
      expect(
        await communitiesDataStorageService?.addCommunitiesData(payload),
      ).toBe(true)
    }

    const result = await communitiesDataStorageService?.getCommunitiesData(
      'communityId',
      filterTs,
    )
    expect(result?.length).toBe(4)
    expect(
      result?.filter(entity => entity.communityId !== 'communityId'),
    ).toEqual([])
  })

  it('should write and then get an array of records for a community ID that match the filter timestamp', async () => {
    const filterTs = DateTime.utc().toMillis() - 10_000
    const payloads: CommunitiesData[] = [
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc().minus({ days: 1 }),
      },
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc().minus({ days: 1 }),
      },
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc().minus({ days: 1 }),
      },
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc(),
      },
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'otherId',
        receivedAt: DateTime.utc().minus({ days: 1 }),
      },
    ]
    for (const payload of payloads) {
      expect(
        await communitiesDataStorageService?.addCommunitiesData(payload),
      ).toBe(true)
    }

    const result = await communitiesDataStorageService?.getCommunitiesData(
      'communityId',
      filterTs,
    )
    expect(result?.length).toBe(1)
    expect(
      result?.filter(entity => entity.communityId !== 'communityId'),
    ).toEqual([])
    expect(
      result?.filter(
        entity => entity.receivedAt! >= DateTime.fromMillis(filterTs),
      ).length,
    ).toEqual(1)
  })

  it('should return no records when filtering for a community ID that has no records', async () => {
    const filterTs = DateTime.utc().minus({ days: 100 }).toMillis()
    const payloads: CommunitiesData[] = [
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc().minus({ days: 1 }),
      },
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc().minus({ days: 1 }),
      },
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc().minus({ days: 1 }),
      },
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc(),
      },
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'otherId',
        receivedAt: DateTime.utc().minus({ days: 1 }),
      },
    ]
    for (const payload of payloads) {
      expect(
        await communitiesDataStorageService?.addCommunitiesData(payload),
      ).toBe(true)
    }

    const result = await communitiesDataStorageService?.getCommunitiesData(
      'foobar',
      filterTs,
    )
    expect(result?.length).toBe(0)
  })
})
