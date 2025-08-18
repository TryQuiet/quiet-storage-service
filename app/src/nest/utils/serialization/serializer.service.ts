// TODO: Expand to include converting strings specifically
// TODO: Use for serializing/deserializing keyrings

import { Injectable } from '@nestjs/common'
import { Packr, PackrStream } from 'msgpackr'
import { type SerializerConfig, SerializerEncodingType } from './types.js'
import { DEFAULT_PACKER_CONFIG, DEFAULT_STREAM_PACKER_CONFIG } from './const.js'

/**
 * Serialization helper class for converting between objects and buffers/uint8arrays without losing context
 * or information
 */
@Injectable()
export class Serializer {
  // msgpackr instance for standard objects
  private readonly _packer: Packr
  // msgpackr instance for streams
  private readonly _streamPacker: PackrStream

  constructor(options?: SerializerConfig) {
    this._packer = new Packr(options?.packer ?? DEFAULT_PACKER_CONFIG)
    this._streamPacker = new PackrStream(
      options?.streamPacker ?? DEFAULT_STREAM_PACKER_CONFIG,
    )
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
    const bufferPayload = this._packer.pack(payload)
    if (encoding == null || encoding === SerializerEncodingType.BUFFER) {
      return bufferPayload
    }

    return this.toUint8array(bufferPayload)
  }

  /**
   * Deserialize a buffer or uint8array back to its original object form
   *
   * @param serializedPayload Buffer or UInt8Array representation of an object
   * @returns Reconstituted object
   */
  public deserialize(serializedPayload: Buffer | Uint8Array): unknown {
    return this._packer.unpack(serializedPayload)
  }

  /**
   * Converts a buffer to its Uint8Array representation
   *
   * @param buffer Buffer to convert to UInt8Array
   * @returns Uint8Array representation of a buffer
   */
  public toUint8array(buffer: Buffer): Uint8Array {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  }
}
