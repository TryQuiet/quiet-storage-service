import { CompoundError } from '../utils/errors.js'

export enum Base64ErrorDirection {
  TO = 'to',
  FROM = 'from',
}

export class EncryptionBase64Error<T extends Error> extends CompoundError<T> {
  constructor(direction: Base64ErrorDirection, original: T) {
    super(EncryptionBase64Error.chooseMessage(direction), original)
  }

  private static chooseMessage(direction: Base64ErrorDirection): string {
    if (direction === Base64ErrorDirection.TO) {
      return `Failed to convert encrypted bytes to base64`
    }

    return `Payload isn't valid base64`
  }
}

export class EncryptionError<T extends Error> extends CompoundError<T> {}
export class DecryptionError<T extends Error> extends CompoundError<T> {}
export class KeyGenError<T extends Error> extends CompoundError<T> {}

export interface EncryptedPayload {
  nonce: string
  payload: string
}

/**
 * Random strings assigned to keyring secret names
 */
export enum StoredKeyRingType {
  SERVER_KEYRING = '139f',
  TEAM_KEYRING = 'ab60',
}
export interface StoredKeyring extends EncryptedPayload {
  type: StoredKeyRingType
}
