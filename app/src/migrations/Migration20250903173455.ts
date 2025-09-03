import { Migration } from '@mikro-orm/migrations'

export class Migration20250903173455 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "communities_data_sync" ("id" varchar(255) not null, "community_id" varchar not null, "entry" bytea not null, "received_at" timestamptz not null, "created_at" timestamptz not null, constraint "communities_data_sync_pkey" primary key ("id"));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "communities_data_sync" cascade;`)
  }
}
