import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { createLogger } from '../app/logger/logger.js'
import { AWSSecretsService } from '../utils/aws/aws-secrets.service.js'
import { AWSSecretNames } from '../utils/aws/const.js'
import { CompoundError } from '../types.js'
import { EncryptedPayload, StoredKeyring, StoredKeyRingType } from './types.js'
import { ConfigService } from '../utils/config/config.service.js'
import { SodiumHelper } from './sodium.helper.js'
import { EnvironmentShort } from '../utils/config/types.js'

@Injectable()
export class ServerKeyManagerService implements OnModuleDestroy {
  private readonly serverKeysets = new Map<string, Uint8Array>()
  private serverEncKey: Uint8Array | undefined = undefined

  private readonly logger = createLogger(ServerKeyManagerService.name)

  constructor(
    private readonly awsSecretsService: AWSSecretsService,
    public readonly sodiumHelper: SodiumHelper,
  ) {}

  public async storeKeyring(
    id: string,
    keyring: Uint8Array,
    type: StoredKeyRingType,
  ): Promise<StoredKeyring> {
    await this._initServerKeys()

    try {
      const secretName = this._generateSecretName(id, type)
      this.logger.log(`Storing keyring`, secretName)
      const encPayload = await this.encrypt(keyring)
      const secret: StoredKeyring = {
        ...encPayload,
        type,
      }
      await this.awsSecretsService.put(secretName, JSON.stringify(secret))
      this.serverKeysets.set(secretName, keyring)

      return secret
    } catch (e) {
      throw new CompoundError(
        `Error while encrypting and storing keyring in AWS!`,
        e as Error,
      )
    }
  }

  public async retrieveKeyring(
    id: string,
    type: StoredKeyRingType,
  ): Promise<Uint8Array | undefined> {
    await this._initServerKeys()
    const secretName = this._generateSecretName(id, type)
    if (this.serverKeysets.has(secretName)) {
      return this.serverKeysets.get(secretName)
    }

    try {
      const secret = await this.awsSecretsService.get(secretName)
      if (secret == null) {
        this.logger.warn(`No keyring stored for secret name ${secretName}`)
        return undefined
      }

      if (typeof secret !== 'string') {
        throw new Error(`Keyring secret wasn't stored as a string`)
      }

      const storedKeyring: StoredKeyring = JSON.parse(secret) as StoredKeyring
      const decryptedKeyring = await this.decrypt(storedKeyring)
      this.serverKeysets.set(`${id}-${type}`, decryptedKeyring)
      return decryptedKeyring
    } catch (e) {
      throw new CompoundError(
        `Error while retrieving and decrypting keyring from AWS!`,
        e as Error,
      )
    }
  }

  public async encrypt(
    payload: Uint8Array | string,
    nonce?: Uint8Array,
  ): Promise<EncryptedPayload> {
    await this._initServerKeys()

    const thisNonce =
      nonce ??
      this.generateRandomBytes(
        this.sodiumHelper.sodium.crypto_secretbox_NONCEBYTES,
      )
    const encPayload = this.sodiumHelper.sodium.crypto_secretbox_easy(
      payload,
      thisNonce,
      this.serverEncKey!,
      'base64',
    )

    return {
      nonce: this.sodiumHelper.toBase64(thisNonce),
      payload: encPayload,
    }
  }

  public async decrypt(encPayload: EncryptedPayload): Promise<Uint8Array> {
    await this._initServerKeys()

    const { nonce, payload } = encPayload
    return this.sodiumHelper.sodium.crypto_secretbox_open_easy(
      this.sodiumHelper.fromBase64(payload),
      this.sodiumHelper.fromBase64(nonce),
      this.serverEncKey!,
    )
  }

  public generateRandomBytes(
    byteLength?: number,
    type?: 'uint8array',
  ): Uint8Array
  public generateRandomBytes(byteLength?: number, type?: 'base64'): string
  public generateRandomBytes(
    byteLength = 32,
    type: 'uint8array' | 'base64' = 'uint8array',
  ): Uint8Array | string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- this is just a weird mismatch but it is 100% valid
    return this.sodiumHelper.sodium.randombytes_buf(byteLength, type as any)
  }

  public async close(): Promise<void> {
    await this.awsSecretsService.close()
  }

  public async onModuleDestroy(): Promise<void> {
    await this.close()
  }

  private async _initServerKeys(): Promise<void> {
    this.logger.verbose(`Checking if server encryption key is initialized`)
    if (this.serverEncKey != null) {
      this.logger.verbose(`Already had the server encryption key locally`)
      return
    }

    let serverEncKey = await this.awsSecretsService.get(
      this._getServerEncKeySecretName(),
    )
    if (serverEncKey == null) {
      this.logger.verbose(
        `Server encryption key wasn't found, initializing now`,
      )
      serverEncKey = this._generateEncryptionKey()
      await this.awsSecretsService.put(
        this._getServerEncKeySecretName(),
        this.sodiumHelper.toBase64(serverEncKey),
      )
    } else {
      this.logger.verbose(`Server encryption key found in secrets service`)
      serverEncKey =
        typeof serverEncKey === 'string'
          ? this.sodiumHelper.fromBase64(serverEncKey)
          : serverEncKey
    }
    this.serverEncKey = serverEncKey
    this.logger.verbose(`${ServerKeyManagerService.name} keys initialized`)
  }

  private _generateEncryptionKey(): Uint8Array {
    try {
      this.generateRandomBytes(32)
      return this.sodiumHelper.sodium.crypto_secretbox_keygen()
    } catch (e) {
      const message = `Error while generating encryption key for server`
      this.logger.error(message, e)
      throw new CompoundError(message, e as Error)
    }
  }

  private _generateSecretName(id: string, type: StoredKeyRingType): string {
    return `qss!${ConfigService.getEnvShort()}-te-${type}-${this.sodiumHelper.sodium.crypto_hash_sha512(`${id}-${type}`, 'base64')}`
  }

  private _getServerEncKeySecretName(): string {
    switch (ConfigService.getEnvShort()) {
      case EnvironmentShort.Dev:
        return AWSSecretNames.SERVER_ENC_KEY_DEV
      case EnvironmentShort.Prod:
        return AWSSecretNames.SERVER_ENC_KEY_PROD
      case EnvironmentShort.Local:
      case EnvironmentShort.Test:
        return AWSSecretNames.SERVER_ENC_KEY_LOCAL
    }
  }
}
