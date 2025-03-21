/**
 * Handles generating the chain and aggregating all chain operations
 */

import * as auth from '@localfirst/auth'
import { Injectable } from '@nestjs/common'
import { createLogger } from '../../app/logger/logger.js'

const logger = createLogger('Auth:SigChain')

@Injectable()
export class SigChain {
  private constructor(
    public team: auth.Team,
    public context: auth.LocalServerContext,
  ) {}

  public static create(
    serializedSigchain: Uint8Array,
    localContext: auth.LocalServerContext,
    teamKeyring: auth.Keyring,
  ): SigChain {
    logger.log(`Creating SigChain from serialized team`)
    let teamKeys: auth.KeysetWithSecrets | undefined = undefined
    for (const keyset of Object.values(teamKeyring)) {
      if (teamKeys == null || keyset.generation > teamKeys.generation) {
        teamKeys = keyset
      }
    }
    const deserializedTeam: auth.Team = this.lfa.loadTeam(
      serializedSigchain,
      localContext,
      teamKeyring,
    ) as auth.Team

    return new SigChain(deserializedTeam, localContext)
  }

  public serialize(): Uint8Array {
    return this.team.save() // this doesn't actually do anything but create the new state to save
  }

  static get lfa(): typeof auth {
    return auth
  }
}
