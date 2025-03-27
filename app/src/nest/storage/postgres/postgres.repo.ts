import type { BaseEntity, EntityData, EntityName } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createLogger } from '../../app/logger/logger.js'
import type { QuietLogger } from '../../app/logger/types.js'

export class PostgresRepo<T extends BaseEntity> {
  private readonly logger: QuietLogger

  constructor(
    private readonly entityName: EntityName<T>,
    private readonly entityManager: EntityManager,
  ) {
    this.logger = createLogger(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- this is safe
      `Storage:${PostgresRepo.name}:${(entityName as any).name}`,
    )
  }

  public async add(entity: T, upsert = false): Promise<boolean> {
    const operation = upsert ? 'upserting' : 'adding'
    try {
      this.logger.verbose(`${operation} row`, entity)
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
}
