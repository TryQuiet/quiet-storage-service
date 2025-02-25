import { Injectable, OnModuleInit } from '@nestjs/common'
import _sodium, { type CryptoKX, type KeyPair } from 'libsodium-wrappers-sumo'
import { isUint8Array } from 'node:util/types'
import { concat, toString as uint8ToString } from 'uint8arrays'

@Injectable()
export class WebsocketEncryptionService implements OnModuleInit {
  private sodium: typeof _sodium | undefined = undefined

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
    return this.sodium.to_base64(concat([nonce, encrypted]))
  }

  public decrypt(encryptedPayload: string, sessionKey: CryptoKX): unknown {
    if (this.sodium == null) {
      throw new Error(`Libsodium not initialized!`)
    }

    const encryptedPayloadBytes = this.sodium.from_base64(encryptedPayload)
    if (
      encryptedPayloadBytes.length <
      this.sodium.crypto_secretbox_NONCEBYTES +
        this.sodium.crypto_secretbox_MACBYTES
    ) {
      throw new Error(`Encrypted payload was too short to be valid`)
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
  }
}
