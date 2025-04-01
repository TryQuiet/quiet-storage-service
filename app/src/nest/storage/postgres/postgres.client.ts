import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { createLogger } from '../../app/logger/logger.js'
import {
  BaseEntity,
  EntityManager,
  EntityName,
  MikroORM,
} from '@mikro-orm/postgresql'
import { PostgresRepo } from './postgres.repo.js'
import { Community } from '../../communities/storage/entities/community.entity.js'

@Injectable()
export class PostgresClient implements OnModuleInit, OnModuleDestroy {
  private readonly repositories = new Map<EntityName<any>, PostgresRepo<any>>()
  private readonly logger = createLogger(`Storage:${PostgresClient.name}`)

  constructor(
    private readonly orm: MikroORM,
    private readonly entityManager: EntityManager,
  ) {
    this.repositories.set(
      Community,
      new PostgresRepo(Community, this.entityManager),
    )
  }

  async onModuleInit(): Promise<void> {
    await this.connect()
    this.logger.log('Postgres client initialized!')
  }

  public async connect(): Promise<void> {
    this.logger.log(`Connecting postgres client`, this.orm.config.get('host'))
    if (await this.orm.isConnected()) {
      this.logger.warn(`Already connected!`)
      return
    }

    await this.orm.connect()
  }

  public getRepository<T extends BaseEntity>(
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

  public async close(force = false): Promise<void> {
    await this.orm.close(force)
  }

  public async onModuleDestroy(): Promise<void> {
    await this.close(true)
  }
}
