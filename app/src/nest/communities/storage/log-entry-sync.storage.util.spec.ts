import { isDuplicateLogEntryIdError } from './log-entry-sync.storage.util.js'

describe('log entry sync storage utils', () => {
  it('identifies duplicate log entry primary key violations', () => {
    expect(
      isDuplicateLogEntryIdError({
        code: '23505',
        constraint: 'log_entry_sync_pkey',
      }),
    ).toBe(true)
  })

  it('identifies nested duplicate log entry primary key violations', () => {
    expect(
      isDuplicateLogEntryIdError({
        cause: {
          code: '23505',
          constraint: 'log_entry_sync_pkey',
        },
      }),
    ).toBe(true)
  })

  it('does not treat sync sequence unique violations as duplicate entry IDs', () => {
    expect(
      isDuplicateLogEntryIdError({
        code: '23505',
        constraint: 'entries_by_syncSeq_idx',
      }),
    ).toBe(false)
  })
})
