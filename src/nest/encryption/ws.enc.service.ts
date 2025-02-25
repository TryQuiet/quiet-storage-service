import { Injectable, OnModuleInit } from '@nestjs/common'
import _sodium, { type CryptoKX, type KeyPair } from 'libsodium-wrappers-sumo'
import { isUint8Array } from 'node:util/types'
import { concat, toString as uint8ToString } from 'uint8arrays'
import {
  Base64ErrorDirection,
  DecryptionError,
  EncryptionBase64Error,
  EncryptionError,
} from './types.js'
import { QuietNestLogger } from '../app/logger/nest.logger.js'

@Injectable()
export class WebsocketEncryptionService implements OnModuleInit {
  private sodium: typeof _sodium | undefined = undefined

  private readonly logger = new QuietNestLogger(WebsocketEncryptionService.name)

  public async onModuleInit(): Promise<void> {
    await _sodium.ready
    this.sodium = _sodium
  }

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

  public generateSharedSessionKeyPair(
    keyPair: KeyPair,
    otherPublicKey: Uint8Array,
    client = false,
  ): CryptoKX {
    if (this.sodium == null) {
      throw new Error(`Libsodium not initialized!`)
    }

    if (client) {
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
  }

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

  private fromBase64(base64Payload: string): Uint8Array {
    if (this.sodium == null) {
      throw new Error(`Libsodium not initialized!`)
    }

    try {
      return this.sodium.from_base64(base64Payload)
    } catch (e) {
      throw new EncryptionBase64Error(Base64ErrorDirection.From, e as Error)
    }
  }

  private toBase64(bytes: Uint8Array): string {
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
