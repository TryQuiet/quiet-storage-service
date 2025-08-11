import { Entity, Property } from '@mikro-orm/core'
import { TableNames } from '../../../storage/postgres/const.js'
import { BasicEntityWithId } from '../../../storage/postgres/basic-id.entity.js'

// NOTE: id field corresponds to LFA team ID
@Entity({ tableName: TableNames.COMMUNITIES })
export class Community extends BasicEntityWithId {
  @Property({ type: 'bytea', columnType: 'bytea' })
  sigChain!: Buffer // this is a hex string
}
