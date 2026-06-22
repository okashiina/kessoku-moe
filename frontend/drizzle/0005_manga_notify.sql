CREATE TABLE "manga_notify_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_kind" text NOT NULL,
	"owner_id" text NOT NULL,
	"anilist_id" integer NOT NULL,
	"title" text,
	"last_chapter" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "manga_notify_target_owner_unq" ON "manga_notify_targets" USING btree ("owner_kind","owner_id","anilist_id");--> statement-breakpoint
CREATE INDEX "manga_notify_target_anilist_idx" ON "manga_notify_targets" USING btree ("anilist_id");