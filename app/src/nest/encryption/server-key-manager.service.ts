/**
 * Service for handling generation/storage of LFA-related keys
 */
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
  /**
   * Map of known secret names to keyets/keyrings
   */
  private readonly serverKeysets = new Map<string, Uint8Array>()
  /**
   * Key used by this environment to encrypt stored keys in the AWS secrets manager
   */
  private serverEncKey: Uint8Array | undefined = undefined

  private readonly logger = createLogger(ServerKeyManagerService.name)

  constructor(
    private readonly awsSecretsService: AWSSecretsService,
    public readonly sodiumHelper: SodiumHelper,
  ) {}

  /**
   * Store a keyring/keyset in the AWS secrets manager
   *
   * @param id ID of the team this keyring belongs to
   * @param keyring Bytes for this keyring
   * @param type Type string for storing this keyring
   * @returns Stored secret JSON
   */
  public async storeKeyring(
    id: string,
    keyring: Uint8Array,
    type: StoredKeyRingType,
  ): Promise<StoredKeyring> {
    // ensure the server encryption key is generated and stored
    await this._initServerEncKey()

    try {
      // generate a unique name for this secret
      const secretName = this._generateSecretName(id, type)
      this.logger.log(`Storing keyring`, secretName)
      // encrypt the keyring bytes with our server encryption key
      const encPayload = await this.encrypt(keyring)
      const secret: StoredKeyring = {
        ...encPayload,
        type,
      }
      // add the new secret to the AWS secrets manager
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

  /**
   * Get an existing keyring/keyset from the AWS secrets manager
   *
   * @param id ID of the team this keyring belongs to
   * @param type Type string for retrieving this keyring
   * @returns Keyring bytes
   */
  public async retrieveKeyring(
    id: string,
    type: StoredKeyRingType,
  ): Promise<Uint8Array | undefined> {
    // ensure the server encryption key is generated and stored
    await this._initServerEncKey()

    // generate the unique name for this secret
    const secretName = this._generateSecretName(id, type)
    // check our local cache of keysets
    if (this.serverKeysets.has(secretName)) {
      return this.serverKeysets.get(secretName)
    }

    try {
      // get the secret from the AWS secrets manager
      const secret = await this.awsSecretsService.get(secretName)
      if (secret == null) {
        this.logger.warn(`No keyring stored for secret name ${secretName}`)
        return undefined
      }

      if (typeof secret !== 'string') {
        throw new Error(`Keyring secret wasn't stored as a string`)
      }

      // parse the secret, decrypt the keyring and return
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

  /**
   * Encrypt a payload with the server encryption key
   *
   * @param payload Payload to encrypt
   * @param nonce Optionally pass in a pre-generated nonce
   * @returns Encrypted payload
   */
  public async encrypt(
    payload: Uint8Array | string,
    nonce?: Uint8Array,
  ): Promise<EncryptedPayload> {
    // ensure the server encryption key is generated and stored
    await this._initServerEncKey()

    // generate a new random nonce if one was not supplied
    const thisNonce =
      nonce ??
      this.generateRandomBytes(
        this.sodiumHelper.sodium.crypto_secretbox_NONCEBYTES,
      )
    // encrypt the payload with the server encryption key and nonce and return as base64
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

  /**
   * Decrypt an encrypted payload with the server encryption key and the nonce used to encrypt
   *
   * @param encPayload Encrypted payload to decrypt
   * @returns Decrypted bytes
   */
  public async decrypt(encPayload: EncryptedPayload): Promise<Uint8Array> {
    // ensure the server encryption key is generated and stored
    await this._initServerEncKey()

    // decrypt and return the decrypted bytes using the server encryption key and the stored nonce
    const { nonce, payload } = encPayload
    return this.sodiumHelper.sodium.crypto_secretbox_open_easy(
      this.sodiumHelper.fromBase64(payload),
      this.sodiumHelper.fromBase64(nonce),
      this.serverEncKey!,
    )
  }

  /**
   * Generate random bytes of a specified length and return as bytes or a base64 string
   *
   * @param byteLength Number of bytes to generate
   * @param returnType Type we want to return as (base64 or uint8array)
   */
  public generateRandomBytes(
    byteLength?: number,
    returnType?: 'uint8array',
  ): Uint8Array
  public generateRandomBytes(byteLength?: number, returnType?: 'base64'): string
  public generateRandomBytes(
    byteLength = 32,
    returnType: 'uint8array' | 'base64' = 'uint8array',
  ): Uint8Array | string {
    return this.sodiumHelper.sodium.randombytes_buf(
      byteLength,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- this is just a weird mismatch but it is 100% valid
      returnType as any,
    )
  }

  /**
   * Close the connection with the AWS secrets manager
   */
  public async close(): Promise<void> {
    await this.awsSecretsService.close()
  }

  public async onModuleDestroy(): Promise<void> {
    await this.close()
  }

  /**
   * Initialize the server encryption key for this environment by either retrieving the key
   * from the AWS secrets manager or generating a new key
   */
  private async _initServerEncKey(): Promise<void> {
    // check for the key locally
    this.logger.verbose(`Checking if server encryption key is initialized`)
    if (this.serverEncKey != null) {
      this.logger.verbose(`Already had the server encryption key locally`)
      return
    }

    // check for the key in the AWS secrets manager
    let serverEncKey = await this.awsSecretsService.get(
      this._getServerEncKeySecretName(),
    )
    if (serverEncKey == null) {
      this.logger.verbose(
        `Server encryption key wasn't found, initializing now`,
      )
      // if key isn't found in the secrets manager generate a new key and store it in the secrets manager
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

  /**
   * Generate a new encryption key
   */
  private _generateEncryptionKey(): Uint8Array {
    try {
      return this.sodiumHelper.sodium.crypto_secretbox_keygen()
    } catch (e) {
      const message = `Error while generating encryption key for server`
      this.logger.error(message, e)
      throw new CompoundError(message, e as Error)
    }
  }

  /**
   * Generate a reproducible secret name for a given keyring
   *
   * @param id ID of the team this secret is associated with
   * @param type Type of keyring this secret is associated with
   * @returns Deterministic unique secret name for this keyring
   */
  private _generateSecretName(id: string, type: StoredKeyRingType): string {
    return `qss!${ConfigService.getEnvShort()}-te-${type}-${this.sodiumHelper.sodium.crypto_hash_sha512(`${id}-${type}`, 'base64')}`
  }

  /**
   * @returns Secret name for a given environment's server encryption key
   */
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
