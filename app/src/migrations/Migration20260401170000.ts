import { Migration } from '@mikro-orm/migrations'

export class Migration20260401170000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "log_entry_sync_counter" ("community_id" varchar not null, "next_sync_seq" bigint not null, constraint "log_entry_sync_counter_pkey" primary key ("community_id"));`,
    )
    this.addSql(
      `alter table "log_entry_sync" add column "sync_seq" bigint null;`,
    )
    this.addSql(
      `with ranked_entries as (
         select
           "id",
           row_number() over (
             partition by "community_id"
             order by "received_at" asc, "id" asc
           ) as "sync_seq"
         from "log_entry_sync"
       )
       update "log_entry_sync" as "les"
          set "sync_seq" = "ranked_entries"."sync_seq"
         from "ranked_entries"
        where "les"."id" = "ranked_entries"."id";`,
    )
    this.addSql(
      `insert into "log_entry_sync_counter" ("community_id", "next_sync_seq")
       select "community_id", coalesce(max("sync_seq"), 0) + 1
         from "log_entry_sync"
        group by "community_id"
       on conflict ("community_id")
       do update set "next_sync_seq" = excluded."next_sync_seq";`,
    )
    this.addSql(
      `alter table "log_entry_sync" alter column "sync_seq" set not null;`,
    )
    this.addSql(
      `create unique index "entries_by_syncSeq_idx" on "log_entry_sync" ("community_id", "sync_seq");`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "entries_by_syncSeq_idx";`)
    this.addSql(`alter table "log_entry_sync" drop column "sync_seq";`)
    this.addSql(`drop table if exists "log_entry_sync_counter" cascade;`)
  }
}
