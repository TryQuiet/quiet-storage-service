/**
 * Client for interfacing with Postgres
 */

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { createLogger } from '../../app/logger/logger.js'
import { EntityManager, EntityName, MikroORM } from '@mikro-orm/postgresql'
import { PostgresRepo } from './postgres.repo.js'
import { Community } from '../../communities/storage/entities/community.entity.js'
import { LogEntrySync } from '../../communities/storage/entities/log-sync.entity.js'
import { BasicEntityWithId } from './basic-id.entity.js'

@Injectable()
export class PostgresClient implements OnModuleInit, OnModuleDestroy {
  /**
   * Map of DB entities to repository instances
   */
  private readonly repositories = new Map<EntityName<any>, PostgresRepo<any>>()

  private readonly logger = createLogger(`Storage:${PostgresClient.name}`)

  constructor(
    private readonly orm: MikroORM,
    private readonly entityManager: EntityManager,
  ) {
    /**
     * load our repository map
     */

    // Community - this is community metadata and stores the sigchain
    this.repositories.set(
      Community,
      new PostgresRepo(Community, this.entityManager),
    )

    // Communities Sync Data - stores data sync entities for all communities
    this.repositories.set(
      LogEntrySync,
      new PostgresRepo(LogEntrySync, this.entityManager),
    )
  }

  async onModuleInit(): Promise<void> {
    await this.connect()
    this.logger.log('Postgres client initialized!')
  }

  /**
   * Connect the client to our Postgres DB
   *
   * @returns void
   */
  public async connect(): Promise<void> {
    this.logger.log(`Connecting postgres client`, this.orm.config.get('host'))
    if (await this.orm.isConnected()) {
      this.logger.warn(`Already connected!`)
      return
    }

    await this.orm.connect()
  }

  public async reserveCiEnrollment(id: string): Promise<boolean> {
    const connection = this.entityManager.getConnection('write')
    await connection.execute(
      'delete from ci_enrollment_grants where expires_at < now()',
    )
    const rows = await connection.execute<Array<{ id: string }>>(
      "insert into ci_enrollment_grants (id, expires_at) values (?, now() + interval '1 day') on conflict (id) do nothing returning id",
      [id],
    )
    return rows.length === 1
  }

  /**
   * Get an existing repository for a given DB entity
   *
   * @param entityName DB entity that this repository handles
   * @returns Postgres repository instance for this entity
   */
  public getRepository<T extends BasicEntityWithId>(
    entityName: EntityName<T>,
  ): PostgresRepo<T> {
    const repo = this.repositories.get(entityName)
    if (repo == null) {
      throw new Error(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- this works
        `No repository configured for ${(entityName as any).name}`,
      )
    }
    return repo as PostgresRepo<T>
  }

  /**
   * Close the DB client connection
   *
   * @param force Force closing the connection
   */
  public async close(force = false): Promise<void> {
    await this.orm.close(force)
  }

  public async onModuleDestroy(): Promise<void> {
    await this.close(true)
  }
}
