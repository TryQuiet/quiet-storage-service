import { Migration } from '@mikro-orm/migrations'

export class Migration20250811182016 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "communities_data" ("id" varchar(255) not null, "community_id" varchar not null, "entry" bytea not null, "received_at" timestamptz not null, "created_at" timestamptz not null default '2025-08-11T16:25:36.316Z', constraint "communities_data_pkey" primary key ("id"));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "communities_data" cascade;`)
  }
}
