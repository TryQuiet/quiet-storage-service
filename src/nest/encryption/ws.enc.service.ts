/**
 * Diffie-Hellman encryption logic for websocket connections
 */

import { Injectable, OnModuleInit } from '@nestjs/common'
import _sodium, { type CryptoKX, type KeyPair } from 'libsodium-wrappers-sumo'
import { isUint8Array } from 'node:util/types'
import { concat, toString as uint8ToString } from 'uint8arrays'
import {
  Base64ErrorDirection,
  DecryptionError,
  EncryptionBase64Error,
  EncryptionError,
  KeyGenError,
} from './types.js'
import { createLogger } from '../app/logger/logger.js'

@Injectable()
export class WebsocketEncryptionService implements OnModuleInit {
  private sodium: typeof _sodium | undefined = undefined

  private readonly logger = createLogger(WebsocketEncryptionService.name)

  /**
   * Ensure sodium is initialized before using
   */
  public async onModuleInit(): Promise<void> {
    await _sodium.ready
    this.sodium = _sodium
  }

  /**
   * Create a key pair for generating the shared session keys between client and server
   *
   * @returns A public-private key pair formed with a random seed
   */
  public generateKeyPair(): KeyPair {
    if (this.sodium == null) {
      throw new Error(`Libsodium not initialized!`)
    }

    const randomSeed = this.sodium.crypto_generichash(
      32,
      this.sodium.randombytes_buf(512),
    )
    return this.sodium.crypto_kx_seed_keypair(randomSeed, 'uint8array')
  }

  /**
   * Generate a shared key pair using our own public-private key pair and the other party's public
   * key.
   *
   * NOTE: The output of this is an object with the fields `sharedRx` and `sharedTx`.  The relationship
   * between client and server keys is as follows:
   *
   *    client.sharedRx === server.sharedTx
   *    client.sharedTx === server.sharedRx
   *
   * @param keyPair Public-private key pair owned by client or server
   * @param otherPublicKey Public key from the other party's key pair as either base64 or Uint8Array
   * @param isClient True if the party generating the shared key pair is a client
   * @returns Shared key pair between client and server
   * @throws {EncryptionBase64Error} If the string is not valid base64
   * @throws {KeyGenError} Keys are invalid
   */
  public generateSharedSessionKeyPair(
    keyPair: KeyPair,
    otherPublicKey: Uint8Array | string,
    isClient = false,
  ): CryptoKX {
    if (this.sodium == null) {
      throw new Error(`Libsodium not initialized!`)
    }

    try {
      if (typeof otherPublicKey === 'string') {
        otherPublicKey = this.fromBase64(otherPublicKey)
      }

      // The distinction here is important - we must generate client and server keys appropriately or there
      // will be a mismatch between key pairs
      if (isClient) {
        return this.sodium.crypto_kx_client_session_keys(
          keyPair.publicKey,
          keyPair.privateKey,
          otherPublicKey,
        )
      }
      return this.sodium.crypto_kx_server_session_keys(
        keyPair.publicKey,
        keyPair.privateKey,
        otherPublicKey,
      )
    } catch (e) {
      if (e instanceof EncryptionBase64Error) {
        throw e
      }
      throw new KeyGenError(
        `Failed to generate shared session key pair`,
        e as Error,
      )
    }
  }

  /**
   * Encrypt an arbitrary payload using the shared session key pair
   *
   * @param payload Payload to encrypt, can be any type
   * @param sessionKey Shared key pair
   * @returns Base64 encoded encrypted payload
   * @throws {EncryptionBase64Error} If the string cannot be converted to Uint8Array
   * @throws {EncryptionError} An error occurs while creating the nonce or creating the secret box
   */
  public encrypt(payload: unknown, sessionKey: CryptoKX): string {
    if (this.sodium == null) {
      throw new Error(`Libsodium not initialized!`)
    }

    try {
      let usablePayload: string | Uint8Array | undefined = undefined
      if (typeof payload === 'string') {
        usablePayload = payload
      } else if (isUint8Array(payload)) {
        usablePayload = payload
      } else {
        usablePayload = JSON.stringify(payload)
      }

      const nonce = this.sodium.randombytes_buf(
        this.sodium.crypto_secretbox_NONCEBYTES,
      )
      const encrypted = this.sodium.crypto_secretbox_easy(
        usablePayload,
        nonce,
        sessionKey.sharedTx,
        'uint8array',
      )
      return this.toBase64(concat([nonce, encrypted]))
    } catch (e) {
      if (e instanceof EncryptionBase64Error) {
        throw e
      }
      throw new EncryptionError(
        `Failed to encrypt payload with session key`,
        e as Error,
      )
    }
  }

  /**
   * Decrypt a base64 encrypted payload using the shared session key pair
   *
   * @param encryptedPayload Base64 encoded encrypted payload
   * @param sessionKey Shared key pair
   * @returns Original payload that was encrypted
   * @throws {EncryptionBase64Error} If the string is not valid base64
   * @throws {DecryptionError} If the payload is not a valid encrypted payload using this session key
   */
  public decrypt(encryptedPayload: string, sessionKey: CryptoKX): unknown {
    if (this.sodium == null) {
      throw new Error(`Libsodium not initialized!`)
    }

    try {
      const encryptedPayloadBytes = this.fromBase64(encryptedPayload)
      if (
        encryptedPayloadBytes.length <
        this.sodium.crypto_secretbox_NONCEBYTES +
          this.sodium.crypto_secretbox_MACBYTES
      ) {
        throw new DecryptionError(`Encrypted payload was too short to be valid`)
      }

      const nonce = encryptedPayloadBytes.slice(
        0,
        this.sodium.crypto_secretbox_NONCEBYTES,
      )
      const cipherText = encryptedPayloadBytes.slice(
        this.sodium.crypto_secretbox_NONCEBYTES,
      )
      const stringPayload = uint8ToString(
        this.sodium.crypto_secretbox_open_easy(
          cipherText,
          nonce,
          sessionKey.sharedRx,
          'uint8array',
        ),
      )
      return JSON.parse(stringPayload) as unknown
    } catch (e) {
      if (e instanceof EncryptionBase64Error) {
        throw e
      }

      throw new DecryptionError(
        `Failed to decrypt payload with session key`,
        e as Error,
      )
    }
  }

  /**
   * Get a byte array for a base64 string
   *
   * @param base64Payload Base64 encoded string
   * @returns Byte array representation of the payload
   * @throws {EncryptionBase64Error} If the string is not valid base64
   */
  public fromBase64(base64Payload: string): Uint8Array {
    if (this.sodium == null) {
      throw new Error(`Libsodium not initialized!`)
    }

    try {
      return this.sodium.from_base64(base64Payload)
    } catch (e) {
      throw new EncryptionBase64Error(Base64ErrorDirection.From, e as Error)
    }
  }

  /**
   * Get a base64 string for a byte array
   *
   * @param Uint8Array bytes Byte array
   * @returns string Base64 encoded string representation of the payload
   * @throws {EncryptionBase64Error} If the string cannot be converted to Uint8Array
   */
  public toBase64(bytes: Uint8Array): string {
    if (this.sodium == null) {
      throw new Error(`Libsodium not initialized!`)
    }

    try {
      return this.sodium.to_base64(bytes)
    } catch (e) {
      throw new EncryptionBase64Error(Base64ErrorDirection.To, e as Error)
    }
  }
}
