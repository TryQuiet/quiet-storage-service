import { Entity, Property } from '@mikro-orm/core'
import { TableNames } from '../../../storage/postgres/const.js'
import { DateTime } from 'luxon'
import { BasicEntityWithId } from '../../../storage/postgres/basic-id.entity.js'

// https://docs.google.com/document/d/1yBrcXCkiHkSTQ1Nd3yLFo9H9S_yvmq_p86xaH2lQa84/edit?tab=t.0#heading=h.34r38ks7imul
// NOTE: id field corresponds to encrypted cid of entry as a hex string
@Entity({ tableName: TableNames.COMMUNITIES_DATA })
export class CommunitiesData extends BasicEntityWithId {
  @Property({
    type: 'string',
    columnType: 'varchar',
    fieldName: 'community_id',
  })
  communityId!: string // this is the LFA team ID and matches the id field on the Community table

  @Property({ type: 'bytea', columnType: 'bytea' })
  entry!: Buffer // this is an encrypted log entity from orbitdb as a hex string

  @Property({ type: 'timestamptz', fieldName: 'received_at' })
  receivedAt!: string // set when the message is originally recieved on the websocket

  @Property({ type: 'timestamptz', fieldName: 'created_at' })
  createdAt: string = DateTime.utc().toISO() // datetime when the record was added to the DB
}
