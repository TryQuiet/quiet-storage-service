import { BaseEntity, PrimaryKey } from '@mikro-orm/core'

export class BasicEntityWithId extends BaseEntity {
  @PrimaryKey()
  id!: string
}
