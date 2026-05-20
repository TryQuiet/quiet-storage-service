import { UniqueConstraintViolationException } from '@mikro-orm/core'

const LOG_ENTRY_SYNC_PRIMARY_KEY = 'log_entry_sync_pkey'

interface ErrorWithDriverCode {
  cause?: unknown
  code?: string
  constraint?: string
  detail?: string
  driverException?: unknown
  message?: string
  name?: string
  originalError?: unknown
  sqlState?: string
}

export function isDuplicateLogEntryIdError(error: unknown): boolean {
  const pending: unknown[] = [error]
  const visited = new Set<unknown>()

  while (pending.length > 0) {
    const current = pending.pop()

    if (
      current == null ||
      typeof current !== 'object' ||
      visited.has(current)
    ) {
      continue
    }

    visited.add(current)
    const driverError = current as ErrorWithDriverCode
    if (
      isUniqueConstraintViolation(current, driverError) &&
      isLogEntrySyncPrimaryKeyViolation(driverError)
    ) {
      return true
    }

    pending.push(
      driverError.cause,
      driverError.driverException,
      driverError.originalError,
    )
  }

  return false
}

function isUniqueConstraintViolation(
  error: object,
  driverError: ErrorWithDriverCode,
): boolean {
  return (
    error instanceof UniqueConstraintViolationException ||
    driverError.name === 'UniqueConstraintViolationException' ||
    driverError.code === '23505' ||
    driverError.sqlState === '23505'
  )
}

function isLogEntrySyncPrimaryKeyViolation(
  error: ErrorWithDriverCode,
): boolean {
  return (
    error.constraint === LOG_ENTRY_SYNC_PRIMARY_KEY ||
    error.message?.includes(LOG_ENTRY_SYNC_PRIMARY_KEY) === true ||
    error.detail?.includes('Key (id)=') === true
  )
}
