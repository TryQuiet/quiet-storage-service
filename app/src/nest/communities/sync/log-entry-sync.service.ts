/* eslint-disable complexity -- will fix later*/
/* eslint-disable max-lines -- will fix later */
/**
 * Manages community-related operations
 */

import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common'
import { createLogger } from '../../app/logger/logger.js'
import { LogSyncEntry, ManagedCommunity } from '../types.js'
import {
  AuthenticationError,
  CommunityNotFoundError,
  SignatureMismatchError,
} from '../../utils/errors.js'
import { SERIALIZER } from '../../app/const.js'
import { AuthStatus } from '../auth/types.js'
import { Socket } from 'socket.io'
import { DateTime } from 'luxon'
import { LogEntrySyncStorageService } from '../storage/log-entry-sync.storage.service.js'
import {
  LogEntryPullPayload,
  LogEntrySyncPayload,
} from '../../websocket/handlers/types/log-entry-sync.types.js'
import { Serializer } from '../../utils/serialization/serializer.service.js'
import type { LogEntrySync as LogEntrySyncEntity } from '../storage/entities/log-sync.entity.js'
import { CommunitiesManagerService } from '../communities-manager.service.js'

@Injectable()
export class LogEntrySyncManager implements OnModuleDestroy {
  private readonly logger = createLogger(LogEntrySyncManager.name)

  /* eslint-disable-next-line @typescript-eslint/max-params --  we can't do much about this */
  constructor(
    // serializer for converting between objects and buffers/uint8arrays and back to objects
    @Inject(SERIALIZER) private readonly serializer: Serializer,
    // DB abstraction layer service for community log sync data (e.g. messages)
    private readonly logEntrySyncStorage: LogEntrySyncStorageService,
    private readonly communities: CommunitiesManagerService,
  ) {}

  public onModuleDestroy(): void {
    this.logger.log('Cleaning up LogEntrySyncManager before module destroy')
  }

  /**
   * Validate that a user has permissions on a given community and then write the entry to postgres
   *
   * @param payload Data sync payload containing the encrypted oplog entry we are writing to the DB
   * @returns True if written, false if not written
   */
  public async processIncomingLogEntrySyncMessage(
    payload: LogEntrySyncPayload,
    socket: Socket,
  ): Promise<boolean> {
    const managedCommunity = await this.communities.get(payload.teamId)
    this._validateSyncPermission(
      payload.encEntry.userId,
      payload.teamId,
      managedCommunity,
      socket,
    )
    this._validateIncomingSyncMessage(payload)

    // convert the message payload to a form writable to the DB
    // NOTE: the entry field is a binary column in postgres so we must losslessly serialize
    //       the object to a buffer
    const dbPayload: LogSyncEntry = {
      communityId: payload.teamId,
      cid: payload.hash,
      hashedDbId: payload.hashedDbId,
      entry: this.serializer.serialize(payload.encEntry),
      receivedAt: DateTime.utc(),
    }
    const written = await this.logEntrySyncStorage.addLogEntry(dbPayload)
    if (written) {
      this.logger.debug(
        'Data sync successfully written to the DB',
        dbPayload.cid,
      )
    } else {
      this.logger.error('Data sync write to DB was unsuccessful', dbPayload.cid)
    }

    return written
  }

  public async getPaginatedLogEntries(
    payload: LogEntryPullPayload,
    socket: Socket,
  ): Promise<{
    entries: Buffer[]
    cursor?: string
    hasNextPage: boolean
  }> {
    const managedCommunity = await this.communities.get(payload.teamId)
    this._validateSyncPermission(
      payload.userId,
      payload.teamId,
      managedCommunity,
      socket,
    )

    if (payload.startTs == null) {
      throw new Error(`startTs must be provided in log entry pull message`)
    }

    const maxBytes = 1000 * 1000 * 0.8 // maximum 1MB with 20% buffer
    const entries: LogEntrySyncEntity[] = []
    /* eslint-disable-next-line @typescript-eslint/prefer-destructuring -- sigh */
    let cursor = payload.cursor
    let hasNextPage = false
    let usedBytes = 0
    let nextCursor = payload.cursor
    let hitSizeLimit = false
    let hitLimit = false

    while (true) {
      const page = await this.logEntrySyncStorage.getPaginatedLogEntries(
        payload.teamId,
        {
          limit: Math.min(payload.limit ?? 200, 200), // TODO: track p50 entry size to optimize page size dynamically
          startTs: payload.startTs,
          endTs: payload.endTs,
          hashedDbId: payload.hashedDbId,
          hash: payload.hash,
        },
        nextCursor,
      )

      if (page.items.length === 0) {
        if (entries.length === 0) {
          return { entries: [], hasNextPage: false }
        }
        hasNextPage = false
        break
      }

      for (let i = 0; i < page.items.length; i += 1) {
        const { entry: entryBuffer } = page.items[i]
        const entryBytes = entryBuffer.length
        const candidateCursor =
          i < page.items.length - 1 ? page.from(page.items[i]) : page.endCursor
        const candidateHasNextPage =
          i < page.items.length - 1 ? true : page.hasNextPage
        const metadataBytes = Buffer.byteLength(
          JSON.stringify({
            cursor: candidateCursor,
            hasNextPage: candidateHasNextPage,
          }),
        )

        if (
          entries.length > 0 &&
          usedBytes + entryBytes + metadataBytes > maxBytes
        ) {
          hasNextPage = true
          hitSizeLimit = true
          break
        }

        entries.push(page.items[i])
        usedBytes += entryBytes
        cursor = candidateCursor ?? undefined
        hasNextPage = candidateHasNextPage

        if (usedBytes + metadataBytes >= maxBytes) {
          hitSizeLimit = true
          break
        }

        if (payload.limit != null && entries.length >= payload.limit) {
          hitLimit = true
          break
        }
      }

      if (hitLimit) {
        break
      }

      if (hitSizeLimit || !page.hasNextPage) {
        if (!hitSizeLimit && !page.hasNextPage) {
          hasNextPage = false
        }
        break
      }

      nextCursor = page.endCursor ?? undefined
      if (nextCursor == null) {
        hasNextPage = false
        break
      }
    }
    this.logger.debug(
      `Returning ${entries.length} log entries, hasNextPage=${hasNextPage}`,
    )

    return {
      entries: entries.map(entry => entry.entry),
      cursor,
      hasNextPage,
    }
  }

  /**
   * Validate that this user can write a sync entry to this community
   *
   * @param payload Data sync payload containing the encrypted oplog entry we are writing to the DB
   * @param managedCommunity Community this data sync is associated with
   */
  private _validateSyncPermission(
    userId: string,
    teamId: string,
    managedCommunity: ManagedCommunity | undefined,
    socket: Socket,
  ): void {
    if (managedCommunity == null) {
      throw new CommunityNotFoundError(teamId)
    }

    // check if we have an auth connection for this user before anything else to make sure
    // they have signed in already
    if (
      managedCommunity.authConnections == null ||
      !managedCommunity.authConnections.has(userId)
    ) {
      throw new AuthenticationError(`User hasn't signed in to this community`)
    }

    const authConnection = managedCommunity.authConnections.get(userId)!
    if (authConnection.socketId !== socket.id) {
      throw new AuthenticationError(
        `Socket ID associated with userId does not match authenticated connection`,
      )
    }
    // validate that the user has successfully authenticated on this community
    switch (authConnection.status) {
      // if the user has just attempted to sign in we may not have validated that they are part of the community
      // NOTE: it is on the client to reattempt the sync later
      case AuthStatus.PENDING:
      case AuthStatus.JOINING:
        this.logger.warn(
          `Waiting for user to be authenticated before processing sync message`,
        )
        throw new AuthenticationError('User authentication pending')
      // if the user's auth connection instance is present but has disconnected we don't know if this is due to auth failure or
      // some other disconnect but we can't proceed
      case AuthStatus.REJECTED_OR_CLOSED:
        this.logger.warn(
          `User has either disconnected or was unable to authenticate against the sigchain, skipping sync message processing`,
        )
        throw new AuthenticationError('User not authenticated')
      // this is the only success state for auth status
      case AuthStatus.JOINED:
        this.logger.debug(
          'User is authenticated, continuing with processing sync message',
        )
        break
    }
  }

  private _validateIncomingSyncMessage(payload: LogEntrySyncPayload): void {
    // validate that the user ID on the signature matches the one on the entry
    if (payload.encEntry.userId !== payload.encEntry.signature.author.name) {
      const entryUserId = payload.encEntry.userId ?? 'USER_ID_UNDEFINED'
      const signatureUserId =
        payload.encEntry.signature.author.name ?? 'USER_ID_UNDEFINED'
      throw new SignatureMismatchError(entryUserId, signatureUserId)
    }
  }
}
