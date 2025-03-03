import { Injectable, OnModuleInit } from '@nestjs/common'
import { createLogger } from '../../../app/logger/nest.logger.js'
import {
  BaseEntity,
  EntityManager,
  EntityName,
  MikroORM,
} from '@mikro-orm/postgresql'

@Injectable()
export class PostgresClient implements OnModuleInit {
  private readonly logger = createLogger(`Storage:${PostgresClient.name}`)

  constructor(
    private readonly orm: MikroORM,
    private readonly entityManager: EntityManager,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connect()
    this.logger.log('RDS client initialized!')
  }

  public async connect(): Promise<void> {
    this.logger.log(`Connecting postgres client`, this.orm.config.get('host'))
    if (await this.orm.isConnected()) {
      this.logger.warn(`Already connected!`)
      return
    }

    await this.orm.connect()
  }

  public async add(entity: BaseEntity): Promise<boolean> {
    try {
      this.logger.log(`Adding row`, entity)
      await this.entityManager.transactional(async em => {
        await em.persistAndFlush(entity)
      })
      return true
    } catch (e) {
      this.logger.error(`Error while adding row to DB`, e)
      return false
    }
  }

  public async findOne<T extends BaseEntity>(
    entityName: EntityName<T>,
    id: string,
  ): Promise<T | undefined> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- this is safe
      this.logger.log(`Finding ${(entityName as any).name} with ID ${id}`)
      let result: T | undefined = undefined
      await this.entityManager.transactional(async em => {
        // @ts-expect-error this is just dumb generic nonsense
        result = await em.findOne<T>(entityName, { id: { $eq: id } })
      })
      return result
    } catch (e) {
      this.logger.error(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- this is safe
        `Error while finding ${(entityName as any).name} with ID ${id}`,
        e,
      )
      return undefined
    }
  }

  public async close(): Promise<void> {
    await this.orm.close()
  }
}
