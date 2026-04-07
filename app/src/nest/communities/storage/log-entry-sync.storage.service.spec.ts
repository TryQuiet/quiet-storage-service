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
    expect(await logSyncStorageService?.addLogEntry(data)).toEqual({
      receivedAtMs: data.receivedAt.toMillis(),
      syncSeq: 1,
    })
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
    expect(await logSyncStorageService?.addLogEntry(data)).toEqual({
      receivedAtMs: data.receivedAt.toMillis(),
      syncSeq: 1,
    })

    const dupeIdData: LogSyncEntry = {
      cid,
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      hashedDbId: 'hashedDbId',
      communityId: 'communityId',
      receivedAt: DateTime.utc().plus({ minutes: 1 }),
    }
    expect(await logSyncStorageService?.addLogEntry(dupeIdData)).toEqual({
      receivedAtMs: data.receivedAt.toMillis(),
      syncSeq: 1,
    })
  })

  it('should write and then get an array of all records for a community ID', async () => {
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
      expect(await logSyncStorageService?.addLogEntry(payload)).toEqual(
        expect.objectContaining({
          receivedAtMs: payload.receivedAt.toMillis(),
        }),
      )
    }

    const result = await logSyncStorageService?.getLogEntriesForCommunity(
      'communityId',
      0,
    )
    expect(result?.length).toBe(4)
    expect(
      result?.filter(entity => entity.communityId !== 'communityId'),
    ).toEqual([])
  })

  it('should write and then get an array of records for a community ID that are after the filter sequence', async () => {
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
    const positions: Array<{ receivedAtMs: number; syncSeq: number }> = []
    for (const payload of payloads) {
      positions.push(
        (await logSyncStorageService?.addLogEntry(payload)) as {
          receivedAtMs: number
          syncSeq: number
        },
      )
    }

    const result = await logSyncStorageService?.getLogEntriesForCommunity(
      'communityId',
      positions[2].syncSeq,
    )
    expect(result?.length).toBe(1)
    expect(
      result?.filter(entity => entity.communityId !== 'communityId'),
    ).toEqual([])
    expect(result?.[0].syncSeq).toEqual(positions[3].syncSeq)
  })

  it('should exclude records whose syncSeq exactly matches the filter sequence', async () => {
    const filterTs = DateTime.utc().toMillis()
    const payloads: LogSyncEntry[] = [
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        hashedDbId: 'hashedDbId-seq-exclude-1',
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.fromMillis(filterTs).toUTC(),
      },
      {
        cid: sodiumHelper!.sodium.to_hex(
          sodiumHelper!.sodium.randombytes_buf(32),
        ),
        hashedDbId: 'hashedDbId-seq-exclude-2',
        entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
        communityId: 'communityId',
        receivedAt: DateTime.fromMillis(filterTs + 1).toUTC(),
      },
    ]
    const positions: Array<{ receivedAtMs: number; syncSeq: number }> = []
    for (const payload of payloads) {
      positions.push(
        (await logSyncStorageService?.addLogEntry(payload)) as {
          receivedAtMs: number
          syncSeq: number
        },
      )
    }

    const result = await logSyncStorageService?.getLogEntriesForCommunity(
      'communityId',
      positions[0].syncSeq,
    )

    expect(result?.length).toBe(1)
    expect(result?.[0].cid).toBe(payloads[1].cid)
  })

  it('should return no records when filtering for a community ID that has no records', async () => {
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
      expect(await logSyncStorageService?.addLogEntry(payload)).toEqual(
        expect.objectContaining({
          receivedAtMs: payload.receivedAt.toMillis(),
        }),
      )
    }

    const result = await logSyncStorageService?.getLogEntriesForCommunity(
      'foobar',
      0,
    )
    expect(result?.length).toBe(0)
  })

  it('resolves the highest sync sequence at or before a legacy timestamp', async () => {
    const startMs = DateTime.utc().toMillis()
    const payloads: LogSyncEntry[] = [0, 1, 2].map(i => ({
      cid: sodiumHelper!.sodium.to_hex(
        sodiumHelper!.sodium.randombytes_buf(32),
      ),
      hashedDbId: 'hashedDbId1',
      entry: Buffer.from(sodiumHelper!.sodium.randombytes_buf(256)),
      communityId: 'communityId',
      receivedAt: DateTime.fromMillis(startMs + i * 1000).toUTC(),
    }))

    const positions: Array<{ receivedAtMs: number; syncSeq: number }> = []
    for (const payload of payloads) {
      positions.push(
        (await logSyncStorageService?.addLogEntry(payload)) as {
          receivedAtMs: number
          syncSeq: number
        },
      )
    }

    await expect(
      logSyncStorageService?.resolveSyncSeqForTimestamp('communityId', startMs),
    ).resolves.toBe(positions[0].syncSeq)
    await expect(
      logSyncStorageService?.resolveSyncSeqForTimestamp(
        'communityId',
        startMs + 1500,
      ),
    ).resolves.toBe(positions[1].syncSeq)
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
        syncSeq: number
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
        const stored = await logSyncStorageService!.addLogEntry({
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
          syncSeq: stored!.syncSeq,
          hashedDbId,
          communityId,
        })
      }
      return entries
    }

    it('paginates forward with a sync sequence cursor', async () => {
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
        { startSeq: 0, limit: 2 },
      )

      expect(firstPage.items).toHaveLength(2)
      expect(firstPage.items[0].id).toBe(entries[0].cid)
      expect(firstPage.items[1].id).toBe(entries[1].cid)
      expect(firstPage.hasNextPage).toBe(true)
      expect(firstPage.items[1].syncSeq).toBe(entries[1].syncSeq)

      const secondPage = await logSyncStorageService!.getPaginatedLogEntries(
        'communityId',
        { startSeq: entries[1].syncSeq, limit: 2 },
      )

      expect(secondPage.items).toHaveLength(1)
      expect(secondPage.items[0].id).toBe(entries[2].cid)
      expect(secondPage.hasNextPage).toBe(false)
    })

    it('filters by sequence range and communityId', async () => {
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
          startSeq: 0,
          endSeq: entries[1].syncSeq,
        },
      )

      expect(page.items).toHaveLength(2)
      expect(page.items[0].id).toBe(entries[0].cid)
      expect(page.items[1].id).toBe(entries[1].cid)
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
        { startSeq: 0, hash: entries[2].cid, limit: 5 },
      )

      expect(page.items).toHaveLength(1)
      expect(page.items[0].id).toBe(entries[2].cid)
      expect(page.hasNextPage).toBe(false)
    })

    it('excludes entries whose syncSeq exactly matches startSeq', async () => {
      const startMs = DateTime.utc().toMillis()
      const entries = await addLogEntries({
        communityId: 'communityId',
        hashedDbId: 'hashedDbId',
        startMs,
        count: 3,
        cidPrefix: 'strict-start-entry',
      })

      const page = await logSyncStorageService!.getPaginatedLogEntries(
        'communityId',
        { startSeq: entries[0].syncSeq, limit: 5 },
      )

      expect(page.items).toHaveLength(2)
      expect(page.items[0].id).toBe(entries[1].cid)
      expect(page.items[1].id).toBe(entries[2].cid)
    })
  })
})
