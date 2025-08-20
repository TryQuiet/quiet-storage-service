// TODO: Expand to include converting strings specifically
// TODO: Use for serializing/deserializing keyrings

import { Injectable } from '@nestjs/common'
import { addExtension, Packr } from 'msgpackr'
import { type SerializerConfig, SerializerEncodingType } from './types.js'
import { DEFAULT_PACKER_CONFIG } from './const.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../app/logger/logger.js'
import * as uint8arrays from 'uint8arrays'
import { CompoundError } from '../errors.js'
import { isUint8Array } from 'util/types'

/**
 * Serialization helper class for converting between objects and buffers/uint8arrays without losing context
 * or information
 */
@Injectable()
export class Serializer {
  // msgpackr instance for standard objects
  private readonly _packer: Packr
  private readonly logger = createLogger('Utils:Serializer')

  constructor(options?: SerializerConfig) {
    this._packer = new Packr(options?.packer ?? DEFAULT_PACKER_CONFIG)
    this._configureExtensions()
  }

  /**
   * Configure custom extensions for handling classes that aren't handled natively by msgpackr
   */
  private _configureExtensions(): void {
    // properly handle luxon DateTime objects
    addExtension({
      Class: DateTime,
      type: 1,
      write: (instance: DateTime): number => instance.toMillis(),
      read: (data: number): DateTime => DateTime.fromMillis(data).toUTC(),
    })
    // properly handle uint8arrays
    addExtension({
      Class: Uint8Array,
      type: 2,
      write: (instance: Uint8Array | Buffer): string =>
        isUint8Array(instance)
          ? uint8arrays.toString(instance, 'hex')
          : (instance as Buffer).toString('hex'),
      read: (data: string): unknown => uint8arrays.fromString(data, 'hex'),
    })
    // properly handle buffers
    addExtension({
      Class: Buffer,
      type: 3,
      write: (instance: Buffer): string => instance.toString('hex'),
      read: (data: string): Buffer => Buffer.from(data, 'hex'),
    })
  }

  public serialize(
    payload: unknown,
    encoding?: SerializerEncodingType.BUFFER,
  ): Buffer
  public serialize(
    payload: unknown,
    encoding: SerializerEncodingType.UINT8ARRAY,
  ): Uint8Array
  /**
   * Serialize an arbitrary object
   *
   * @param payload Object to serialize into a buffer or uint8array
   * @param encoding Configure the serializer to output a buffer or uint8array (default = buffer)
   * @returns Buffer or UInt8Array representation of object
   */
  public serialize(
    payload: unknown,
    encoding: SerializerEncodingType = SerializerEncodingType.BUFFER,
  ): Buffer | Uint8Array {
    try {
      const bufferPayload = this._packer.pack(payload)
      if (encoding == null || encoding === SerializerEncodingType.BUFFER) {
        return bufferPayload
      }

      return this.bufferToUint8array(bufferPayload)
    } catch (e) {
      this.logger.error('Error while serializing payload', e)
      throw new CompoundError(
        'Error while serializing payload',
        e instanceof Error ? e : undefined,
      )
    }
  }

  /**
   * Deserialize a buffer or uint8array back to its original object form
   *
   * @param serializedPayload Buffer or UInt8Array representation of an object
   * @returns Reconstituted object
   */
  public deserialize(serializedPayload: Buffer | Uint8Array): unknown {
    let buffer: Buffer | undefined = undefined
    if (serializedPayload instanceof Uint8Array) {
      buffer = this.uint8arrayToBuffer(serializedPayload)
    } else {
      buffer = serializedPayload
    }

    return this._packer.unpack(buffer)
  }

  /**
   * Converts a buffer to its Uint8Array representation
   *
   * @param buffer Buffer to convert to UInt8Array
   * @returns Uint8Array representation of a buffer
   */
  public bufferToUint8array(buffer: Buffer): Uint8Array {
    try {
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    } catch (e) {
      this.logger.error('Error while converting buffer to uint8array', e)
      throw new CompoundError(
        'Error while converting buffer to uint8array',
        e instanceof Error ? e : undefined,
      )
    }
  }

  /**
   * Converts a uint8array to its buffer representation
   *
   * @param uint8array Uint8array to convert to Buffer
   * @returns Buffer representation of a uint8array
   */
  public uint8arrayToBuffer(uint8array: Uint8Array): Buffer {
    try {
      return Buffer.from(
        uint8array.buffer,
        uint8array.byteOffset,
        uint8array.byteLength,
      )
    } catch (e) {
      this.logger.error('Error while converting uint8array to buffer', e)
      throw new CompoundError(
        'Error while converting uint8array to buffer',
        e instanceof Error ? e : undefined,
      )
    }
  }
}
