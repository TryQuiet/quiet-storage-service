import { Migration } from '@mikro-orm/migrations'

export class Migration20260316155658 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create index "entries_by_receivedAt_idx" on "log_entry_sync" ("community_id", "received_at", "hashed_db_id");`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "entries_by_receivedAt_idx";`)
  }
}
