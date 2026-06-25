import { sanitizeLogValue } from './log-sanitizer.js'

describe('log sanitizer', () => {
  it('truncates nested string fields to 256 characters', () => {
    const expectedMessage = `${'a'.repeat(242)}...[truncated]`
    const result = sanitizeLogValue({
      payload: {
        message: 'a'.repeat(300),
      },
    })

    expect(result).toEqual({
      payload: {
        message: expectedMessage,
      },
    })
    expect(expectedMessage).toHaveLength(256)
  })

  it('replaces Buffer and Uint8Array values with compact binary descriptions', () => {
    const result = sanitizeLogValue({
      buffer: Buffer.from([1, 2, 3]),
      bytes: new Uint8Array([4, 5, 6]),
      serialized: {
        type: 'Buffer',
        data: [7, 8, 9],
      },
    })

    expect(result).toEqual({
      buffer: {
        type: 'Buffer',
        byteLength: 3,
        previewHex: '010203',
        truncated: false,
      },
      bytes: {
        type: 'Uint8Array',
        byteLength: 3,
        previewHex: '040506',
        truncated: false,
      },
      serialized: {
        type: 'Buffer',
        byteLength: 3,
        previewHex: '070809',
        truncated: false,
      },
    })
  })

  it('can keep full binary values when binary summaries are disabled', () => {
    const result = sanitizeLogValue(
      {
        buffer: Buffer.from([1, 2, 3]),
        bytes: new Uint8Array([4, 5, 6]),
      },
      { summarizeBinary: false },
    )

    expect(result).toEqual({
      buffer: Buffer.from([1, 2, 3]),
      bytes: new Uint8Array([4, 5, 6]),
    })
  })

  it('can disable value sanitization while preserving binary summaries', () => {
    const result = sanitizeLogValue(
      {
        token: 'secret-token',
        payload: 'x'.repeat(300),
        bytes: Buffer.from([1, 2, 3]),
      },
      { sanitizeValues: false, summarizeBinary: true },
    )

    expect(result).toEqual({
      token: 'secret-token',
      payload: 'x'.repeat(300),
      bytes: {
        type: 'Buffer',
        byteLength: 3,
        previewHex: '010203',
        truncated: false,
      },
    })
  })

  it('redacts sensitive fields and handles circular references', () => {
    const value: Record<string, unknown> = {
      accessToken: 'secret-token',
      safe: 'visible',
    }
    value.self = value

    expect(sanitizeLogValue(value)).toEqual({
      accessToken: '[redacted]',
      safe: 'visible',
      self: '[Circular]',
    })
  })

  it('bounds large arrays and objects', () => {
    const result = sanitizeLogValue({
      values: Array.from({ length: 52 }, (_, index) => index),
      ...Object.fromEntries(
        Array.from({ length: 101 }, (_, index) => [`field${index}`, index]),
      ),
    })

    expect(result).toEqual(
      expect.objectContaining({
        values: expect.arrayContaining([
          {
            type: 'TruncatedArray',
            omittedItems: 2,
          },
        ]),
        __truncatedKeys: 2,
      }),
    )
  })
})
