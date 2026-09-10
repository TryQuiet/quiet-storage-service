/**
 * Handles generating the chain and aggregating all chain operations
 */

import * as auth from '@localfirst/auth'
import { Injectable } from '@nestjs/common'
import { createLogger } from '../../app/logger/logger.js'
import * as uint8arrays from 'uint8arrays'
import EventEmitter from 'events'
import {
  LFAEvents,
  SigchainEvents,
  type SigChainPersistenceSnapshot,
} from './types.js'

const logger = createLogger('Auth:SigChain')
const lfaLogger = createLogger('Localfirst')

@Injectable()
export class SigChain extends EventEmitter {
  private constructor(
    public team: auth.Team,
    public context: auth.LocalServerContext,
  ) {
    super()
    this.team.on(LFAEvents.UPDATED, this._handleTeamUpdate)
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
      lfaLogger,
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

  /**
   * Capture the graph and keyring from the same synchronous team state.
   */
  public serializeForPersistence(): SigChainPersistenceSnapshot {
    const sigChain = this.serialize(true)
    const teamKeyring = uint8arrays.fromString(
      JSON.stringify(this.team.teamKeyring()),
      'utf8',
    )
    return {
      teamId: this.team.id,
      sigChain,
      teamKeyring,
    }
  }

  /**
   * Announce that a chain update could not be persisted.
   *
   * @param error Failure that stopped the write
   */
  public notifyPersistFailed(error: unknown): void {
    logger.error(
      `Failed to persist chain update for team ${this.team.id}`,
      error,
    )
    this.emit(SigchainEvents.PERSIST_FAILED, { teamId: this.team.id, error })
  }

  public clearListeners(): void {
    this.team.removeListener(LFAEvents.UPDATED, this._handleTeamUpdate)
  }

  private readonly _handleTeamUpdate = (payload: {
    head: auth.Hash[]
  }): void => {
    this.emit(SigchainEvents.UPDATED, payload)
  }

  static get lfa(): typeof auth {
    return auth
  }
}
