import { Test, type TestingModule } from '@nestjs/testing'
import type { Serializer } from './serializer.service.js'
import { UtilsModule } from '../utils.module.js'
import { SERIALIZER } from '../../app/const.js'
import { randomBytes, randomFillSync, randomInt, randomUUID } from 'crypto'
import { DateTime } from 'luxon'
import { SerializerEncodingType } from './types.js'
import * as uint8arrays from 'uint8arrays'

describe('Serializer', () => {
  let module: TestingModule | undefined = undefined
  let serializer: Serializer | undefined = undefined

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [UtilsModule],
    }).compile()

    serializer = module.get<Serializer>(SERIALIZER)
  })

  afterAll(async () => {
    await module?.close()
  })

  const generateRandomSerializableObject = (): unknown => {
    const mapField = new Map<string, unknown>()
    mapField.set('foo', randomFillSync(Buffer.alloc(32, undefined, 'base64')))
    mapField.set('bar', 'baz')
    const input = {
      id: randomUUID(),
      numberField: randomInt(1_000_000),
      stringField: randomBytes(32).toString('hex'),
      mapField,
      arrField: [{ randomName: randomUUID(), someOtherName: randomBytes(128) }],
      dictField: {
        foo: 'bar',
        baz: 1,
        luxonDt: DateTime.utc(),
        millis: DateTime.utc().toMillis(),
        jsDate: new Date(),
      },
      uint8array: new Uint8Array(randomFillSync(Buffer.alloc(1024))),
      uint8arrayAgain: uint8arrays.fromString(randomUUID()),
    }
    return input
  }

  it('should initialize the serializer', () => {
    expect(module).toBeDefined()
    expect(serializer).toBeDefined()
  })

  describe('serialize and deserialize', () => {
    it('should serialize to buffer by default and back to an object losslessly', () => {
      const input = generateRandomSerializableObject()
      const serialized = serializer!.serialize(input)

      expect(serialized).toBeDefined()
      expect(serialized).toBeInstanceOf(Buffer)

      const deserialized = serializer!.deserialize(serialized)
      expect(deserialized).toStrictEqual(input)
    })

    it('should serialize to buffer when explicitly configured and back to an object losslessly', () => {
      const input = generateRandomSerializableObject()
      const serialized = serializer!.serialize(
        input,
        SerializerEncodingType.BUFFER,
      )

      expect(serialized).toBeDefined()
      expect(serialized).toBeInstanceOf(Buffer)

      const deserialized = serializer!.deserialize(serialized)
      expect(deserialized).toStrictEqual(input)
    })

    it('should serialize to uint8array when configured and back to an object losslessly', () => {
      const input = generateRandomSerializableObject()
      const serialized = serializer!.serialize(
        input,
        SerializerEncodingType.UINT8ARRAY,
      )

      expect(serialized).toBeDefined()
      expect(serialized).toBeInstanceOf(Uint8Array)

      const deserialized = serializer!.deserialize(serialized)
      expect(deserialized).toStrictEqual(input)
    })
  })

  describe('bufferToUint8array and uint8arrayToBuffer', () => {
    it('should convert a buffer to a uint8array and back again', () => {
      const buffer = randomFillSync(Buffer.alloc(32))
      const uint8array = serializer!.bufferToUint8array(buffer)

      expect(serializer!.uint8arrayToBuffer(uint8array)).toEqual(buffer)
    })

    it('should convert a uint8array to a buffer and back again', () => {
      const uint8array = uint8arrays.fromString(randomUUID())
      const buffer = serializer!.uint8arrayToBuffer(uint8array)

      expect(serializer!.bufferToUint8array(buffer)).toEqual(uint8array)
    })
  })
})
