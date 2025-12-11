import { Test, type TestingModule } from '@nestjs/testing'
import { CommunitiesModule } from '../communities.module.js'
import { StorageModule } from '../../storage/storage.module.js'
import type { LogSyncEntry } from '../types.js'
import { SodiumHelper } from '../../encryption/sodium.helper.js'
import { EncryptionModule } from '../../encryption/enc.module.js'
import { LogEntrySyncStorageService } from './log-entry-sync.storage.service.js'
import { DateTime } from 'luxon'

describe('LogEntrySyncStorageService', () => {
  let logSyncStorageService: LogEntrySyncStorageService | undefined = undefined
  let sodiumHelper: SodiumHelper | undefined = undefined
  let module: TestingModule | undefined = undefined

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [CommunitiesModule, StorageModule, EncryptionModule],
    }).compile()
    await module.init()

    logSyncStorageService = module.get<LogEntrySyncStorageService>(
      LogEntrySyncStorageService,
    )
    sodiumHelper = module.get<SodiumHelper>(SodiumHelper)
  })

  afterEach(async () => {
    await logSyncStorageService?.clearRepository()
    await module?.close()
  })

  it('should be defined', () => {
    expect(module).toBeDefined()
    expect(logSyncStorageService).toBeDefined()
    expect(sodiumHelper).toBeDefined()
  })

  it('should write a log entry sync record to postgres', async () => {
    const data: LogSyncEntry = {
      cid: sodiumHelper!.sodium.to_hex(
        sodiumHelper!.sodium.randombytes_buf(32),
      ),
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      communityId: 'communityId',
      receivedAt: DateTime.utc(),
    }
    expect(await logSyncStorageService?.addLogEntry(data)).toBe(true)
  })

  it('should succeed but not write a log entry to postgres on duplicate ID', async () => {
    const cid = sodiumHelper!.sodium.to_hex(
      sodiumHelper!.sodium.randombytes_buf(32),
    )
    const data: LogSyncEntry = {
      cid,
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      communityId: 'communityId',
      receivedAt: DateTime.utc(),
    }
    expect(await logSyncStorageService?.addLogEntry(data)).toBe(true)

    const dupeIdData: LogSyncEntry = {
      cid,
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      communityId: 'communityId',
      receivedAt: DateTime.utc(),
    }
    expect(await logSyncStorageService?.addLogEntry(dupeIdData)).toBe(true)
  })

  it('should write and then get an array of all records for a community ID', async () => {
    const filterTs = DateTime.utc().toMillis() - 500
    const payloads: LogSyncEntry[] = [
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
      expect(await logSyncStorageService?.addLogEntry(payload)).toBe(true)
    }

    const result = await logSyncStorageService?.getLogEntriesForCommunity(
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
    const payloads: LogSyncEntry[] = [
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
      expect(await logSyncStorageService?.addLogEntry(payload)).toBe(true)
    }

    const result = await logSyncStorageService?.getLogEntriesForCommunity(
      'communityId',
      filterTs,
    )
    expect(result?.length).toBe(1)
    expect(
      result?.filter(entity => entity.communityId !== 'communityId'),
    ).toEqual([])
    expect(
      result?.filter(
        entity => entity.receivedAt >= DateTime.fromMillis(filterTs),
      ).length,
    ).toEqual(1)
  })

  it('should return no records when filtering for a community ID that has no records', async () => {
    const filterTs = DateTime.utc().minus({ days: 100 }).toMillis()
    const payloads: LogSyncEntry[] = [
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
      expect(await logSyncStorageService?.addLogEntry(payload)).toBe(true)
    }

    const result = await logSyncStorageService?.getLogEntriesForCommunity(
      'foobar',
      filterTs,
    )
    expect(result?.length).toBe(0)
  })
})
