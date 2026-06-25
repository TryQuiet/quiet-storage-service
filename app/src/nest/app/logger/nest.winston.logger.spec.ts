import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
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
  LOG_SANITIZATION_ENABLED: process.env.LOG_SANITIZATION_ENABLED,
  LOG_BINARY_SUMMARY_ENABLED: process.env.LOG_BINARY_SUMMARY_ENABLED,
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

interface WinstonLogMeta {
  params: string[]
}

interface SanitizedLogParam {
  payload: string
  token: string
  bytes: {
    type: string
    byteLength: number
    previewHex: string
    truncated: boolean
  }
}

const getWinstonLogger = (logger: QuietWinstonNestLogger): Logger =>
  (logger as unknown as { winstonLogger: Logger }).winstonLogger

const getLoggedMeta = (calls: unknown[][]): WinstonLogMeta => {
  const [firstCall] = calls
  if (firstCall == null) {
    throw new Error('Expected winston log call')
  }
  const [, meta] = firstCall
  if (!isWinstonLogMeta(meta)) {
    throw new Error('Expected winston log metadata')
  }
  return meta
}

const isWinstonLogMeta = (value: unknown): value is WinstonLogMeta => {
  if (typeof value !== 'object' || value == null) return false
  const { params } = value as { params?: unknown }
  return Array.isArray(params) && params.every(item => typeof item === 'string')
}

const parseSanitizedLogParam = (value: string): SanitizedLogParam => {
  const parsed = JSON.parse(value) as unknown
  if (!isSanitizedLogParam(parsed)) {
    throw new Error('Expected sanitized log param')
  }
  return parsed
}

const isSanitizedLogParam = (value: unknown): value is SanitizedLogParam => {
  if (typeof value !== 'object' || value == null) return false
  const candidate = value as {
    payload?: unknown
    token?: unknown
    bytes?: unknown
  }
  const { payload, token, bytes: byteValue } = candidate
  if (typeof payload !== 'string' || typeof token !== 'string') {
    return false
  }
  if (typeof byteValue !== 'object' || byteValue == null) {
    return false
  }
  const bytes = byteValue as {
    type?: unknown
    byteLength?: unknown
    previewHex?: unknown
    truncated?: unknown
  }
  const { type, byteLength, previewHex, truncated } = bytes
  return (
    typeof type === 'string' &&
    typeof byteLength === 'number' &&
    typeof previewHex === 'string' &&
    typeof truncated === 'boolean'
  )
}

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
    delete process.env.LOG_SANITIZATION_ENABLED
    delete process.env.LOG_BINARY_SUMMARY_ENABLED
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
    if (originalEnv.LOG_SANITIZATION_ENABLED == null) {
      delete process.env.LOG_SANITIZATION_ENABLED
    } else {
      process.env.LOG_SANITIZATION_ENABLED =
        originalEnv.LOG_SANITIZATION_ENABLED
    }
    if (originalEnv.LOG_BINARY_SUMMARY_ENABLED == null) {
      delete process.env.LOG_BINARY_SUMMARY_ENABLED
    } else {
      process.env.LOG_BINARY_SUMMARY_ENABLED =
        originalEnv.LOG_BINARY_SUMMARY_ENABLED
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

  it('sanitizes metadata before passing it to winston', () => {
    const quietLogger = createWinstonLogger('Sanitized')
    const logger = getWinstonLogger(quietLogger)
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger)

    quietLogger.info('payload', {
      payload: 'x'.repeat(300),
      token: 'secret-token',
      bytes: Buffer.from([1, 2, 3]),
    })

    expect(infoSpy).toHaveBeenCalledWith(
      'payload',
      expect.objectContaining({
        params: [expect.any(String)],
      }),
    )
    const meta = getLoggedMeta(infoSpy.mock.calls as unknown[][])
    const loggedParam = parseSanitizedLogParam(meta.params[0])

    expect(loggedParam.payload).toHaveLength(256)
    expect(loggedParam.payload.endsWith('...[truncated]')).toBe(true)
    expect(loggedParam.token).toBe('[redacted]')
    expect(loggedParam.bytes).toEqual({
      type: 'Buffer',
      byteLength: 3,
      previewHex: '010203',
      truncated: false,
    })
  })

  it('can disable winston metadata sanitization while preserving binary summaries', () => {
    process.env.LOG_SANITIZATION_ENABLED = 'false'
    const quietLogger = createWinstonLogger('Unsanitized')
    const logger = getWinstonLogger(quietLogger)
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger)

    quietLogger.info('payload', {
      payload: 'x'.repeat(300),
      token: 'secret-token',
      bytes: Buffer.from([1, 2, 3]),
    })

    const meta = getLoggedMeta(infoSpy.mock.calls as unknown[][])
    const loggedParam = JSON.parse(meta.params[0]) as {
      payload: string
      token: string
      bytes: {
        type: string
        byteLength: number
        previewHex: string
        truncated: boolean
      }
    }

    expect(loggedParam.payload).toHaveLength(300)
    expect(loggedParam.token).toBe('secret-token')
    expect(loggedParam.bytes).toEqual({
      type: 'Buffer',
      byteLength: 3,
      previewHex: '010203',
      truncated: false,
    })
  })

  it('can print binary values in full while keeping other sanitization', () => {
    process.env.LOG_BINARY_SUMMARY_ENABLED = 'false'
    const quietLogger = createWinstonLogger('FullBinary')
    const logger = getWinstonLogger(quietLogger)
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger)

    quietLogger.info('payload', {
      token: 'secret-token',
      buffer: Buffer.from([1, 2, 3]),
      bytes: new Uint8Array([4, 5, 6]),
    })

    const meta = getLoggedMeta(infoSpy.mock.calls as unknown[][])
    const loggedParam = JSON.parse(meta.params[0]) as {
      token: string
      buffer: { type: string; data: number[] }
      bytes: Record<string, number>
    }

    expect(loggedParam.token).toBe('[redacted]')
    expect(loggedParam.buffer).toEqual({
      type: 'Buffer',
      data: [1, 2, 3],
    })
    expect(loggedParam.bytes).toEqual({ 0: 4, 1: 5, 2: 6 })
  })

  it('skips formatting when the active log level drops the message', () => {
    QuietWinstonNestLogger.resetSharedLoggerForTests()
    process.env.LOG_LEVEL = 'warn'
    const quietLogger = createWinstonLogger('Skipped')
    const logger = getWinstonLogger(quietLogger)
    const debugSpy = jest
      .spyOn(logger, 'debug')
      .mockImplementation(() => logger)
    const payload: Record<string, unknown> = {}
    const getExpensiveValue = jest.fn(() => 'expensive')
    Object.defineProperty(payload, 'expensive', {
      enumerable: true,
      get: getExpensiveValue,
    })

    quietLogger.debug('dropped', payload)

    expect(debugSpy).not.toHaveBeenCalled()
    expect(getExpensiveValue).not.toHaveBeenCalled()
  })
})
