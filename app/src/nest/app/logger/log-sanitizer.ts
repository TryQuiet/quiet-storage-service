const MAX_STRING_LENGTH = 256
const MAX_ARRAY_ITEMS = 50
const MAX_OBJECT_KEYS = 100
const MAX_DEPTH = 8
const BINARY_PREVIEW_BYTES = 16
const TRUNCATION_SUFFIX = '...[truncated]'
const REDACTED_VALUE = '[redacted]'

const SENSITIVE_KEY_PARTS = [
  'authorization',
  'password',
  'passphrase',
  'secret',
  'privatekey',
  'signingprivatekey',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'token',
  'ucan',
  'credential',
  'apikey',
  'keyring',
  'teamkeyring',
  'deviceprivatekey',
]

interface BinaryDescription {
  type: string
  byteLength: number
  previewHex?: string
  truncated?: boolean
}

interface SerializedBuffer {
  type: 'Buffer'
  data: unknown[]
}

interface SanitizerState {
  depth: number
  seen: WeakSet<object>
  options: Required<LogSanitizerOptions>
}

interface SanitizedPrimitive {
  handled: boolean
  value?: unknown
}

export interface LogSanitizerOptions {
  sanitizeValues?: boolean
  summarizeBinary?: boolean
}

export function sanitizeLogValue(
  value: unknown,
  options: LogSanitizerOptions = {},
): unknown {
  return sanitizeValue(value, {
    depth: 0,
    seen: new WeakSet<object>(),
    options: {
      sanitizeValues: options.sanitizeValues ?? true,
      summarizeBinary: options.summarizeBinary ?? true,
    },
  })
}

function sanitizeValue(
  value: unknown,
  state: SanitizerState,
  key?: string,
): unknown {
  if (state.options.sanitizeValues && key != null && isSensitiveKey(key)) {
    return REDACTED_VALUE
  }

  const primitive = sanitizePrimitive(value, state.options)
  if (primitive.handled) {
    return primitive.value
  }

  const binaryDescription = describeBinary(value, state.options)
  if (binaryDescription != null) {
    return binaryDescription
  }

  if (value instanceof Error) {
    return sanitizeError(value, state)
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (value instanceof Map) {
    return sanitizeMap(value, state)
  }
  if (value instanceof Set) {
    return sanitizeSet(value, state)
  }
  if (Array.isArray(value)) {
    return sanitizeArray(value, state)
  }

  if (!isRecord(value)) {
    return Object.prototype.toString.call(value)
  }

  const serializedBuffer = asSerializedBuffer(value)
  if (serializedBuffer != null) {
    return describeSerializedBuffer(serializedBuffer, state.options)
  }

  return sanitizeObject(value, state)
}

function sanitizePrimitive(
  value: unknown,
  options: Required<LogSanitizerOptions>,
): SanitizedPrimitive {
  if (typeof value === 'string') {
    return {
      handled: true,
      value: options.sanitizeValues ? truncateString(value) : value,
    }
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value == null
  ) {
    return { handled: true, value }
  }
  if (typeof value === 'bigint') {
    return { handled: true, value: `${value.toString()}n` }
  }
  if (typeof value === 'symbol') {
    return { handled: true, value: value.toString() }
  }
  if (typeof value === 'function') {
    return {
      handled: true,
      value: `[Function ${value.name.length > 0 ? value.name : 'anonymous'}]`,
    }
  }

  return { handled: false }
}

function sanitizeError(error: Error, state: SanitizerState): unknown {
  const output: Record<string, unknown> = {
    type: error.constructor.name,
    name: error.name,
    message: state.options.sanitizeValues
      ? truncateString(error.message)
      : error.message,
  }

  if (error.stack != null) {
    output.stack = state.options.sanitizeValues
      ? truncateString(error.stack)
      : error.stack
  }

  const cause = getErrorCause(error)
  if (cause != null) {
    output.cause = sanitizeValue(cause, nextState(state), 'cause')
  }

  return output
}

function sanitizeMap(
  map: Map<unknown, unknown>,
  state: SanitizerState,
): unknown {
  if (state.seen.has(map)) return '[Circular]'
  if (state.options.sanitizeValues && state.depth >= MAX_DEPTH) {
    return `[MaxDepth:Map size=${map.size}]`
  }

  state.seen.add(map)
  const entries = state.options.sanitizeValues
    ? Array.from(map.entries()).slice(0, MAX_ARRAY_ITEMS)
    : Array.from(map.entries())
  const sanitizedEntries = entries.map(([entryKey, entryValue]) => [
    sanitizeValue(entryKey, nextState(state)),
    sanitizeValue(entryValue, nextState(state), String(entryKey)),
  ])
  state.seen.delete(map)

  return {
    type: 'Map',
    size: map.size,
    entries: state.options.sanitizeValues
      ? appendTruncationMarker(sanitizedEntries, map.size)
      : sanitizedEntries,
  }
}

function sanitizeSet(set: Set<unknown>, state: SanitizerState): unknown {
  if (state.seen.has(set)) return '[Circular]'
  if (state.options.sanitizeValues && state.depth >= MAX_DEPTH) {
    return `[MaxDepth:Set size=${set.size}]`
  }

  state.seen.add(set)
  const values = state.options.sanitizeValues
    ? Array.from(set.values()).slice(0, MAX_ARRAY_ITEMS)
    : Array.from(set.values())
  const sanitizedValues = values.map(item =>
    sanitizeValue(item, nextState(state)),
  )
  state.seen.delete(set)

  return {
    type: 'Set',
    size: set.size,
    values: state.options.sanitizeValues
      ? appendTruncationMarker(sanitizedValues, set.size)
      : sanitizedValues,
  }
}

function sanitizeArray(value: unknown[], state: SanitizerState): unknown[] {
  if (state.seen.has(value)) return ['[Circular]']
  if (state.options.sanitizeValues && state.depth >= MAX_DEPTH)
    return [`[MaxDepth:Array length=${value.length}]`]

  state.seen.add(value)
  const values = state.options.sanitizeValues
    ? value.slice(0, MAX_ARRAY_ITEMS)
    : value
  const sanitized = values.map(item => sanitizeValue(item, nextState(state)))
  state.seen.delete(value)

  return state.options.sanitizeValues
    ? appendTruncationMarker(sanitized, value.length)
    : sanitized
}

function sanitizeObject(
  object: Record<string, unknown>,
  state: SanitizerState,
): Record<string, unknown> | string {
  if (state.seen.has(object)) return '[Circular]'

  const {
    constructor: { name: type },
  } = object
  if (state.options.sanitizeValues && state.depth >= MAX_DEPTH) {
    return `[MaxDepth:${type}]`
  }

  state.seen.add(object)
  const keys = Object.keys(object)
  const output: Record<string, unknown> = {}
  if (type !== 'Object') {
    output.type = type
  }

  const visibleKeys = state.options.sanitizeValues
    ? keys.slice(0, MAX_OBJECT_KEYS)
    : keys
  for (const key of visibleKeys) {
    try {
      output[key] = sanitizeValue(object[key], nextState(state), key)
    } catch (error) {
      output[key] =
        error instanceof Error
          ? `[Unserializable: ${error.message}]`
          : '[Unserializable]'
    }
  }

  if (state.options.sanitizeValues && keys.length > MAX_OBJECT_KEYS) {
    output.__truncatedKeys = keys.length - MAX_OBJECT_KEYS
  }

  state.seen.delete(object)
  return output
}

function appendTruncationMarker(
  items: unknown[],
  originalLength: number,
): unknown[] {
  if (originalLength <= MAX_ARRAY_ITEMS) return items
  return [
    ...items,
    {
      type: 'TruncatedArray',
      omittedItems: originalLength - MAX_ARRAY_ITEMS,
    },
  ]
}

function describeBinary(
  value: unknown,
  options: Required<LogSanitizerOptions>,
):
  | BinaryDescription
  | ArrayBuffer
  | ArrayBufferView
  | SerializedBuffer
  | undefined {
  if (Buffer.isBuffer(value)) {
    return options.summarizeBinary ? describeBytes('Buffer', value) : value
  }
  if (value instanceof ArrayBuffer) {
    return options.summarizeBinary
      ? describeBytes('ArrayBuffer', new Uint8Array(value))
      : value
  }
  if (ArrayBuffer.isView(value)) {
    return options.summarizeBinary
      ? describeBytes(value.constructor.name, arrayBufferViewToBytes(value))
      : value
  }
  return undefined
}

function describeSerializedBuffer(
  value: SerializedBuffer,
  options: Required<LogSanitizerOptions>,
): BinaryDescription | SerializedBuffer {
  if (!options.summarizeBinary) {
    return value
  }

  const previewBytes = value.data
    .slice(0, BINARY_PREVIEW_BYTES)
    .filter((item): item is number => typeof item === 'number')

  return {
    type: 'Buffer',
    byteLength: value.data.length,
    previewHex:
      previewBytes.length > 0
        ? Buffer.from(previewBytes).toString('hex')
        : undefined,
    truncated: value.data.length > BINARY_PREVIEW_BYTES,
  }
}

function describeBytes(type: string, bytes: Uint8Array): BinaryDescription {
  return {
    type,
    byteLength: bytes.byteLength,
    previewHex: Buffer.from(bytes.subarray(0, BINARY_PREVIEW_BYTES)).toString(
      'hex',
    ),
    truncated: bytes.byteLength > BINARY_PREVIEW_BYTES,
  }
}

function arrayBufferViewToBytes(value: ArrayBufferView): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value

  const keepLength = Math.max(0, MAX_STRING_LENGTH - TRUNCATION_SUFFIX.length)
  return `${value.slice(0, keepLength)}${TRUNCATION_SUFFIX}`
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  return SENSITIVE_KEY_PARTS.some(part => normalized.includes(part))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}

function asSerializedBuffer(
  record: Record<string, unknown>,
): SerializedBuffer | undefined {
  const { type, data } = record
  if (type === 'Buffer' && Array.isArray(data)) {
    return { type, data }
  }
  return undefined
}

function nextState(state: SanitizerState): SanitizerState {
  return {
    depth: state.depth + 1,
    seen: state.seen,
    options: state.options,
  }
}

function getErrorCause(error: Error): unknown {
  return Reflect.get(error, 'cause')
}
