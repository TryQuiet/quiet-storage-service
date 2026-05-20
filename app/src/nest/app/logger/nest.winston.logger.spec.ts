import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals'
import type { Logger } from 'winston'

import {
  createWinstonLogger,
  QuietWinstonNestLogger,
} from './nest.winston.logger.js'

const originalEnv = {
  CLOUDWATCH_LOGS_ENABLED: process.env.CLOUDWATCH_LOGS_ENABLED,
  LOG_DIR: process.env.LOG_DIR,
  LOG_LEVEL: process.env.LOG_LEVEL,
  LOG_MAX_FILES: process.env.LOG_MAX_FILES,
  LOG_MAX_SIZE: process.env.LOG_MAX_SIZE,
}

const tempDirs: string[] = []

interface DailyRotateFileTransport {
  constructor: { name: string }
  listenerCount: (eventName: string) => number
  options: {
    maxFiles?: number | string
    maxSize?: number | string
  }
}

const getWinstonLogger = (logger: QuietWinstonNestLogger): Logger =>
  (logger as unknown as { winstonLogger: Logger }).winstonLogger

const isDailyRotateFileTransport = (
  transport: unknown,
): transport is DailyRotateFileTransport => {
  const candidate = transport as { constructor?: { name?: unknown } }
  return candidate.constructor?.name === 'DailyRotateFile'
}

const getDailyRotateFileTransports = (
  logger: Logger,
): DailyRotateFileTransport[] => {
  const transports: unknown[] = logger.transports
  return transports.filter(isDailyRotateFileTransport)
}

describe(QuietWinstonNestLogger.name, () => {
  beforeEach(() => {
    QuietWinstonNestLogger.resetSharedLoggerForTests()
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qss-logs-'))
    tempDirs.push(tempDir)
    process.env.CLOUDWATCH_LOGS_ENABLED = 'false'
    process.env.LOG_DIR = tempDir
    process.env.LOG_LEVEL = 'debug'
    delete process.env.LOG_MAX_FILES
    delete process.env.LOG_MAX_SIZE
  })

  afterAll(async () => {
    QuietWinstonNestLogger.resetSharedLoggerForTests()
    await new Promise(resolve => setTimeout(resolve, 100))
    if (originalEnv.CLOUDWATCH_LOGS_ENABLED == null) {
      delete process.env.CLOUDWATCH_LOGS_ENABLED
    } else {
      process.env.CLOUDWATCH_LOGS_ENABLED = originalEnv.CLOUDWATCH_LOGS_ENABLED
    }
    if (originalEnv.LOG_DIR == null) {
      delete process.env.LOG_DIR
    } else {
      process.env.LOG_DIR = originalEnv.LOG_DIR
    }
    if (originalEnv.LOG_LEVEL == null) {
      delete process.env.LOG_LEVEL
    } else {
      process.env.LOG_LEVEL = originalEnv.LOG_LEVEL
    }
    if (originalEnv.LOG_MAX_FILES == null) {
      delete process.env.LOG_MAX_FILES
    } else {
      process.env.LOG_MAX_FILES = originalEnv.LOG_MAX_FILES
    }
    if (originalEnv.LOG_MAX_SIZE == null) {
      delete process.env.LOG_MAX_SIZE
    } else {
      process.env.LOG_MAX_SIZE = originalEnv.LOG_MAX_SIZE
    }
    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('reuses shared file transports across logger contexts', () => {
    const firstLogger = createWinstonLogger('First')
    const secondLogger = createWinstonLogger('Second')
    const firstWinstonLogger = getWinstonLogger(firstLogger)
    const secondWinstonLogger = getWinstonLogger(secondLogger)

    expect(firstWinstonLogger).toBe(secondWinstonLogger)
    expect(getDailyRotateFileTransports(firstWinstonLogger)).toHaveLength(2)
  })

  it('uses bounded local log defaults', () => {
    const logger = getWinstonLogger(createWinstonLogger('Defaults'))
    const fileTransports = getDailyRotateFileTransports(logger)

    expect(fileTransports).toHaveLength(2)
    for (const transport of fileTransports) {
      expect(transport.options.maxSize).toBe('20m')
      expect(transport.options.maxFiles).toBe('14d')
      expect(transport.listenerCount('error')).toBeGreaterThan(0)
    }
  })

  it('supports log retention environment overrides', () => {
    QuietWinstonNestLogger.resetSharedLoggerForTests()
    process.env.LOG_MAX_SIZE = '5m'
    process.env.LOG_MAX_FILES = '3d'

    const logger = getWinstonLogger(createWinstonLogger('Overrides'))
    const fileTransports = getDailyRotateFileTransports(logger)

    expect(fileTransports).toHaveLength(2)
    for (const transport of fileTransports) {
      expect(transport.options.maxSize).toBe('5m')
      expect(transport.options.maxFiles).toBe('3d')
    }
  })
})
