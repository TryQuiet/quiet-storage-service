import { BaseEntity, Entity, PrimaryKey, Property } from '@mikro-orm/core'
import { TableNames } from '../../../storage/postgres/const.js'

@Entity({ tableName: TableNames.COMMUNITIES })
export class Community extends BaseEntity {
  @PrimaryKey()
  id!: string

  @Property()
  name!: string

  @Property({ type: 'bytea', columnType: 'bytea' })
  psk!: Buffer

  @Property({ type: 'bytea', columnType: 'bytea' })
  peerList!: Buffer

  @Property({ type: 'bytea', columnType: 'bytea' })
  sigChain!: Buffer // this is a hex string
}
