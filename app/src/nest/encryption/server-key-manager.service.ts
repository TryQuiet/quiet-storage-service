import { Injectable } from '@nestjs/common'
import { createLogger } from '../app/logger/logger.js'
import { AWSSecretsService } from '../utils/aws/aws-secrets.service.js'
import { AWSSecretNames } from '../utils/aws/const.js'
import { CompoundError } from '../types.js'
import { StoredKeyring, StoredKeyRingType } from './types.js'
import { ConfigService } from '../utils/config/config.service.js'
import { SodiumHelper } from './sodium.helper.js'
import * as uint8arrays from 'uint8arrays'

@Injectable()
export class ServerKeyManagerService {
  private serverEncKey: Uint8Array | undefined = undefined

  private readonly logger = createLogger(ServerKeyManagerService.name)

  constructor(
    private readonly awsSecretsService: AWSSecretsService,
    public readonly sodiumHelper: SodiumHelper,
    private readonly configService: ConfigService,
  ) {}

  public async encryptAndStoreKeyring(
    id: string,
    keyring: Uint8Array,
    type: StoredKeyRingType,
  ): Promise<void> {
    await this._initServerKeys()

    try {
      const secretName = this._generateSecretName(id)
      const nonce = this.generateRandomBytes(
        this.sodiumHelper.sodium.crypto_secretbox_NONCEBYTES,
      )
      const encKeyring = this.sodiumHelper.sodium.crypto_secretbox_easy(
        keyring,
        nonce,
        this.serverEncKey!,
        'base64',
      )
      const secret: StoredKeyring = {
        keyring: encKeyring,
        nonce: this.sodiumHelper.toBase64(nonce),
        type,
      }
      await this.awsSecretsService.put(secretName, JSON.stringify(secret))
    } catch (e) {
      throw new CompoundError(
        `Error while encrypting and storing keyring in AWS!`,
        e as Error,
      )
    }
  }

  public async retrieveAndDecryptKeyring(
    id: string,
  ): Promise<Uint8Array | undefined> {
    await this._initServerKeys()

    try {
      const secretName = this._generateSecretName(id)
      const secret = await this.awsSecretsService.get(secretName)
      if (secret == null) {
        this.logger.warn(`No keyring stored for secret name ${secretName}`)
        return undefined
      }

      if (typeof secret !== 'string') {
        throw new Error(`Keyring secret wasn't stored as a string`)
      }

      const storedKeyring: StoredKeyring = JSON.parse(secret) as StoredKeyring
      return this.sodiumHelper.sodium.crypto_secretbox_open_easy(
        storedKeyring.keyring,
        this.sodiumHelper.fromBase64(storedKeyring.nonce),
        this.serverEncKey!,
      )
    } catch (e) {
      throw new CompoundError(
        `Error while retrieving and decrypting keyring from AWS!`,
        e as Error,
      )
    }
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

  private async _initServerKeys(): Promise<void> {
    if (this.serverEncKey != null) {
      return
    }

    this.logger.log(`Checking if server encryption key is initialized`)
    let serverEncKey = await this.awsSecretsService.get(
      AWSSecretNames.ServerEncKey,
    )
    if (serverEncKey == null) {
      this.logger.log(`Server encryption key wasn't found, initializing now`)
      serverEncKey = this._generateEncryptionKey()
      await this.awsSecretsService.put(
        AWSSecretNames.ServerEncKey,
        serverEncKey,
      )
    } else {
      serverEncKey =
        typeof serverEncKey === 'string'
          ? uint8arrays.fromString(serverEncKey, 'base64')
          : serverEncKey
    }
    this.serverEncKey = serverEncKey
    this.logger.log(`${ServerKeyManagerService.name} keys initialized`)
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

  private _generateSecretName(id: string): string {
    return `qss!${this.configService.getEnvShort()}-te-${this.sodiumHelper.sodium.crypto_hash_sha512(id, 'base64')}`
  }
}
