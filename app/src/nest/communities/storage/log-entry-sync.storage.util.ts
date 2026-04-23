import { UniqueConstraintViolationException } from '@mikro-orm/core'

interface ErrorWithDriverCode {
  cause?: unknown
  code?: string
  name?: string
  sqlState?: string
}

export function isDuplicateKeyError(error: unknown): boolean {
  let current: unknown = error

  while (current != null && typeof current === 'object') {
    if (current instanceof UniqueConstraintViolationException) {
      return true
    }

    const driverError = current as ErrorWithDriverCode
    if (
      driverError.name === 'UniqueConstraintViolationException' ||
      driverError.code === '23505' ||
      driverError.sqlState === '23505'
    ) {
      return true
    }

    current = driverError.cause
  }

  return false
}
