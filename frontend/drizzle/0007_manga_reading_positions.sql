CREATE TABLE "manga_reading_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"anilist_user_id" integer NOT NULL,
	"anilist_id" integer NOT NULL,
	"chapter_id" text NOT NULL,
	"chapter_number" text NOT NULL,
	"page" integer NOT NULL,
	"pages" integer NOT NULL,
	"progress_bps" integer NOT NULL,
	"total" integer NOT NULL,
	"lang" text NOT NULL,
	"title" text NOT NULL,
	"cover" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manga_reading_position_owner_chk" CHECK ("manga_reading_positions"."anilist_user_id" > 0),
	CONSTRAINT "manga_reading_position_media_chk" CHECK ("manga_reading_positions"."anilist_id" > 0),
	CONSTRAINT "manga_reading_position_chapter_chk" CHECK (char_length("manga_reading_positions"."chapter_id") between 1 and 512 and char_length("manga_reading_positions"."chapter_number") between 1 and 64),
	CONSTRAINT "manga_reading_position_page_chk" CHECK ("manga_reading_positions"."page" >= 0 and "manga_reading_positions"."pages" >= 0 and ("manga_reading_positions"."pages" = 0 or "manga_reading_positions"."page" < "manga_reading_positions"."pages")),
	CONSTRAINT "manga_reading_position_progress_chk" CHECK ("manga_reading_positions"."progress_bps" between 0 and 10000),
	CONSTRAINT "manga_reading_position_total_chk" CHECK ("manga_reading_positions"."total" >= 0),
	CONSTRAINT "manga_reading_position_metadata_chk" CHECK (char_length("manga_reading_positions"."lang") between 1 and 20 and char_length("manga_reading_positions"."title") between 1 and 500 and ("manga_reading_positions"."cover" is null or char_length("manga_reading_positions"."cover") <= 2048))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "manga_reading_position_user_media_unq" ON "manga_reading_positions" USING btree ("anilist_user_id","anilist_id");--> statement-breakpoint
CREATE INDEX "manga_reading_position_user_updated_idx" ON "manga_reading_positions" USING btree ("anilist_user_id","updated_at");
