import type { LogLevel } from '@nestjs/common'

export const DEFAULT_LOG_LEVELS = [
  'debug',
  'verbose',
  'log',
  'warn',
  'error',
  'fatal',
] as LogLevel[]

export const CLOUDWATCH_LOG_GROUP = 'qss-logs'
export const CLOUDWATCH_LOG_STREAM_BASE_NAME = 'qss-log-stream'
