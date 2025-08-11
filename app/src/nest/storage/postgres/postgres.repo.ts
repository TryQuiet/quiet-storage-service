/**
 * Postgres repository with CRUD functionality for a single DB entity
 */

import type { EntityData, EntityName, FilterQuery } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createLogger } from '../../app/logger/logger.js'
import type { QuietLogger } from '../../app/logger/types.js'
import type { BasicEntityWithId } from './basic-id.entity.js'

export class PostgresRepo<T extends BasicEntityWithId> {
  private readonly logger: QuietLogger

  constructor(
    public readonly entityName: EntityName<T>,
    public readonly entityManager: EntityManager,
  ) {
    this.logger = createLogger(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- this is safe
      `Storage:${PostgresRepo.name}:${(entityName as any).name}`,
    )
  }

  /**
   * Insert/upsert an entity into the DB
   *
   * @param entity Entity we are adding to the DB
   * @param upsert If true allow updating an existing record if found
   * @returns True if successfully added to the DB
   */
  public async add(entity: T, upsert = false): Promise<boolean> {
    // operation string to print in the log message
    const operation = upsert ? 'upserting' : 'adding'
    try {
      this.logger.verbose(`${operation} row`, entity)
      // insert/upsert entity based on options passed in
      await this.entityManager.transactional(async em => {
        const repo = em.getRepository(this.entityName)
        if (!upsert) {
          await repo.insert(entity)
        } else {
          await repo.upsert(entity)
        }
        await em.commit()
      })
      return true
    } catch (e) {
      this.logger.error(`Error while ${operation} row`, e)
      return false
    }
  }

  /**
   * Update an existing DB row by ID
   *
   * @param id ID of the entity we are updating
   * @param updates Subset of fields to update on this entity
   * @returns True if successfully updated
   */
  public async update(id: string, updates: EntityData<T>): Promise<boolean> {
    try {
      this.logger.verbose(`Updating row by ID ${id}`)
      const result = await this.entityManager.transactional(async em => {
        const repo = em.getRepository(this.entityName)
        // @ts-expect-error this is just dumb generic nonsense
        return await repo.nativeUpdate({ id: { $eq: id } }, updates)
      })
      return result > 0
    } catch (e) {
      this.logger.error(`Error while updating row for ID ${id}`, e)
      return false
    }
  }

  /**
   * Update an existing DB row by ID and return the updated record
   *
   * @param id ID of the entity we are updating
   * @param updates Subset of fields to update on this entity
   * @returns The updated row
   */
  public async updateAndFindOne(
    id: string,
    updates: EntityData<T>,
  ): Promise<T | undefined | null> {
    try {
      this.logger.verbose(`Updating and finding row by ID ${id}`)
      const result = await this.entityManager.transactional(async em => {
        const repo = em.getRepository(this.entityName)
        // update the DB row
        const updateCount = await repo.nativeUpdate(
          // @ts-expect-error this is just dumb generic nonsense
          { id: { $eq: id } },
          updates,
        )
        if (updateCount === 0) {
          return undefined
        }
        // find and return the updated row
        // @ts-expect-error this is just dumb generic nonsense
        return await repo.findOne({ id: { $eq: id } })
      })
      return result
    } catch (e) {
      this.logger.error(`Error while updating and finding row for ID ${id}`, e)
      return undefined
    }
  }

  /**
   * Find and return an existing DB row by ID
   *
   * @param id ID of the entity we are fetching
   * @returns Found entity
   */
  public async findOne(id: string): Promise<T | undefined | null> {
    try {
      this.logger.verbose(`Finding one with ID ${id}`)
      let result: T | undefined = undefined
      await this.entityManager.transactional(async em => {
        const repo = em.getRepository(this.entityName)
        // @ts-expect-error this is just dumb generic nonsense
        result = await repo.findOne({ id: { $eq: id } })
      })
      return result
    } catch (e) {
      this.logger.error(`Error while finding one with ID ${id}`, e)
      return null
    }
  }

  /**
   * Find and return existing rows in the DB for a given filter query
   *
   * @param query Filter query definition
   * @returns Found entities
   */
  public async findMany(
    query: FilterQuery<T>,
  ): Promise<T[] | undefined | null> {
    try {
      this.logger.verbose(`Finding many with query`, query)
      let result: T[] | undefined = undefined
      await this.entityManager.transactional(async em => {
        const repo = em.getRepository(this.entityName)
        result = await repo.find(query)
      })
      return result
    } catch (e) {
      this.logger.error(`Error while finding many`, e)
      return null
    }
  }

  /**
   * Check if ID exists in DB
   *
   * @param id ID of the entity we are checking for existence of
   * @returns True if found, undefined if an error occurs
   */
  public async has(id: string): Promise<boolean | undefined> {
    let result: boolean | undefined = undefined
    try {
      this.logger.verbose(`Checking for existence of ID ${id}`)
      await this.entityManager.transactional(async em => {
        const repo = em.getRepository(this.entityName)
        // @ts-expect-error this is just dumb generic nonsense
        const count = await repo.count({ id: { $eq: id } })
        result = count > 0
      })
    } catch (e) {
      this.logger.error(
        `Error while checking for existence of row with ID ${id}`,
        e,
      )
    }
    return result
  }
}
