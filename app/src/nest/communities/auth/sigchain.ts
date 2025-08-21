/**
 * Handles generating the chain and aggregating all chain operations
 */

import * as auth from '@localfirst/auth'
import { Injectable } from '@nestjs/common'
import { createLogger } from '../../app/logger/logger.js'
import * as uint8arrays from 'uint8arrays'
import EventEmitter from 'events'

const logger = createLogger('Auth:SigChain')

@Injectable()
export class SigChain extends EventEmitter {
  private constructor(
    public team: auth.Team,
    public context: auth.LocalServerContext,
  ) {
    super()
  }

  public static create(
    serializedSigchain: Uint8Array,
    localContext: auth.LocalServerContext,
    teamKeyring: auth.Keyring,
  ): SigChain {
    logger.log(`Creating SigChain from serialized team`)
    const deserializedTeam: auth.Team = this.lfa.loadTeam(
      serializedSigchain,
      localContext,
      teamKeyring,
    ) as auth.Team

    return new SigChain(deserializedTeam, localContext)
  }

  public serialize(hex?: false): Uint8Array
  public serialize(hex: true): string
  public serialize(hex = false): Uint8Array | string {
    const bytes = this.team.save() // this doesn't actually do anything but create the new state to save
    if (!hex) {
      return bytes
    }

    return uint8arrays.toString(bytes, 'hex')
  }

  static get lfa(): typeof auth {
    return auth
  }
}
