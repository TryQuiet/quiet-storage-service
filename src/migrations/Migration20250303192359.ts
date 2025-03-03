import { Migration } from '@mikro-orm/migrations'

export class Migration20250303192359 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "community" ("id" varchar(255) not null, "name" varchar(255) not null, "psk" varchar(255) not null, "peer_list" text[] not null, "sig_chain" bytea not null, constraint "community_pkey" primary key ("id"));`,
    )
  }
}
