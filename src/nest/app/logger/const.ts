import type { LogLevel } from '@nestjs/common'

export const DEFAULT_LOG_LEVELS = [
  'debug',
  'verbose',
  'log',
  'warn',
  'error',
  'fatal',
] as LogLevel[]
