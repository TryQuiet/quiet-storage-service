import { BaseEntity, Entity, PrimaryKey, Property } from '@mikro-orm/core'
import { TableNames } from '../../../storage/postgres/const.js'

@Entity({ tableName: TableNames.Communities })
export class Community extends BaseEntity {
  @PrimaryKey()
  id!: string

  @Property()
  name!: string

  @Property()
  psk!: string

  @Property({ type: 'array' })
  peerList!: string[]

  @Property({ type: 'bytea' })
  sigChain!: Uint8Array | string
}
