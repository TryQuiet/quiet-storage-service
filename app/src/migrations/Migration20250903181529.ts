import { Migration } from '@mikro-orm/migrations'

export class Migration20250903181529 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "log_entry_sync" ("id" varchar(255) not null, "community_id" varchar not null, "entry" bytea not null, "received_at" timestamptz not null, "created_at" timestamptz not null, constraint "log_entry_sync_pkey" primary key ("id"));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "log_entry_sync" cascade;`)
  }
}
