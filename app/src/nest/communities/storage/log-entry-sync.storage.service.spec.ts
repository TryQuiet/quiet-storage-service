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
      hashedDbId: 'hashedDbId',
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
      hashedDbId: 'hashedDbId',
      receivedAt: DateTime.utc(),
    }
    expect(await logSyncStorageService?.addLogEntry(data)).toBe(true)

    const dupeIdData: LogSyncEntry = {
      cid,
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      hashedDbId: 'hashedDbId',
      communityId: 'communityId',
      receivedAt: DateTime.utc(),
    }
    expect(await logSyncStorageService?.addLogEntry(dupeIdData)).toBe(true)
  })

  it('should write and then get an array of all records for a community ID', async () => {
    const filterTs = DateTime.utc().toMillis() - 500
    const payloads: LogSyncEntry[] = []
    for (let i = 0; i < 4; i += 1) {
      payloads.push({
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        hashedDbId: 'hashedDbId1',
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc(),
      })
    }
    payloads.push({
      cid: sodiumHelper!.sodium.to_hex(
        sodiumHelper!.sodium.randombytes_buf(32),
      ),
      hashedDbId: 'hashedDbId1',
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      communityId: 'otherId',
      receivedAt: DateTime.utc(),
    })
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
    const payloads: LogSyncEntry[] = []
    for (let i = 0; i < 3; i += 1) {
      payloads.push({
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        hashedDbId: 'hashedDbId1',
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc().minus({ days: 1 }),
      })
    }
    payloads.push({
      cid: sodiumHelper!.sodium.to_hex(
        sodiumHelper!.sodium.randombytes_buf(32),
      ),
      hashedDbId: 'hashedDbId1',
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      communityId: 'communityId',
      receivedAt: DateTime.utc(),
    })
    payloads.push({
      cid: sodiumHelper!.sodium.to_hex(
        sodiumHelper!.sodium.randombytes_buf(32),
      ),
      hashedDbId: 'hashedDbId1',
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      communityId: 'otherId',
      receivedAt: DateTime.utc().minus({ days: 1 }),
    })
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
    const payloads: LogSyncEntry[] = []
    for (let i = 0; i < 3; i += 1) {
      payloads.push({
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        hashedDbId: 'hashedDbId1',
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.utc().minus({ days: 1 }),
      })
    }
    payloads.push({
      cid: sodiumHelper!.sodium.to_hex(
        sodiumHelper!.sodium.randombytes_buf(32),
      ),
      hashedDbId: 'hashedDbId1',
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      communityId: 'communityId',
      receivedAt: DateTime.utc(),
    })
    payloads.push({
      cid: sodiumHelper!.sodium.to_hex(
        sodiumHelper!.sodium.randombytes_buf(32),
      ),
      hashedDbId: 'hashedDbId1',
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      communityId: 'otherId',
      receivedAt: DateTime.utc().minus({ days: 1 }),
    })
    for (const payload of payloads) {
      expect(await logSyncStorageService?.addLogEntry(payload)).toBe(true)
    }

    const result = await logSyncStorageService?.getLogEntriesForCommunity(
      'foobar',
      filterTs,
    )
    expect(result?.length).toBe(0)
  })

  describe('getPaginatedLogEntries', () => {
    const addLogEntries = async (options: {
      communityId: string
      hashedDbId: string
      startMs: number
      count: number
      cidPrefix: string
      size?: number
    }): Promise<
      Array<{
        cid: string
        entry: Buffer
        receivedAtMs: number
        hashedDbId: string
        communityId: string
      }>
    > => {
      const {
        communityId,
        hashedDbId,
        startMs,
        count,
        cidPrefix,
        size = 32,
      } = options
      const entries = []
      for (let i = 0; i < count; i += 1) {
        const receivedAtMs = startMs + i * 1000
        const entry = Buffer.alloc(size, i)
        const cid = `${cidPrefix}-${i}`
        await logSyncStorageService!.addLogEntry({
          cid,
          hashedDbId,
          communityId,
          entry,
          receivedAt: DateTime.fromMillis(receivedAtMs).toUTC(),
        })
        entries.push({
          cid,
          entry,
          receivedAtMs,
          hashedDbId,
          communityId,
        })
      }
      return entries
    }

    it('paginates forward with a cursor', async () => {
      const startMs = DateTime.utc().toMillis()
      const entries = await addLogEntries({
        communityId: 'communityId',
        hashedDbId: 'hashedDbId',
        startMs,
        count: 3,
        cidPrefix: 'page-entry',
      })

      const firstPage = await logSyncStorageService!.getPaginatedLogEntries(
        'communityId',
        { startTs: startMs - 1000, limit: 2 },
      )

      expect(firstPage.items).toHaveLength(2)
      expect(firstPage.items[0].id).toBe(entries[0].cid)
      expect(firstPage.items[1].id).toBe(entries[1].cid)
      expect(firstPage.hasNextPage).toBe(true)
      expect(firstPage.endCursor).toBeDefined()

      const secondPage = await logSyncStorageService!.getPaginatedLogEntries(
        'communityId',
        { startTs: startMs - 1000, limit: 2 },
        firstPage.endCursor ?? undefined,
      )

      expect(secondPage.items).toHaveLength(1)
      expect(secondPage.items[0].id).toBe(entries[2].cid)
      expect(secondPage.hasNextPage).toBe(false)
    })

    it('filters by time range and communityId', async () => {
      const startMs = DateTime.utc().toMillis()
      const entries = await addLogEntries({
        communityId: 'communityId-a',
        hashedDbId: 'hashedDbId-a',
        startMs,
        count: 3,
        cidPrefix: 'filter-entry',
      })
      await addLogEntries({
        communityId: 'communityId-b',
        hashedDbId: 'hashedDbId-b',
        startMs: startMs + 5000,
        count: 1,
        cidPrefix: 'filter-entry-other',
      })
      await addLogEntries({
        communityId: 'communityId-c',
        hashedDbId: 'hashedDbId-a',
        startMs: startMs + 1000,
        count: 1,
        cidPrefix: 'filter-entry-community',
      })

      const page = await logSyncStorageService!.getPaginatedLogEntries(
        'communityId-a',
        {
          limit: 10,
          startTs: startMs + 500,
        },
      )

      expect(page.items).toHaveLength(2)
      expect(page.items[0].id).toBe(entries[1].cid)
    })

    it('filters by hash', async () => {
      const startMs = DateTime.utc().toMillis()
      const entries = await addLogEntries({
        communityId: 'communityId',
        hashedDbId: 'hashedDbId',
        startMs,
        count: 3,
        cidPrefix: 'hash-entry',
      })

      const page = await logSyncStorageService!.getPaginatedLogEntries(
        'communityId',
        { startTs: startMs - 1000, hash: entries[2].cid, limit: 5 },
      )

      expect(page.items).toHaveLength(1)
      expect(page.items[0].id).toBe(entries[2].cid)
      expect(page.hasNextPage).toBe(false)
    })
  })
})
