CREATE TABLE "comment_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"comment_id" integer NOT NULL,
	"anilist_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_type" text NOT NULL,
	"anilist_id" integer NOT NULL,
	"episode" integer,
	"parent_id" integer,
	"anilist_user_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"author_avatar" text,
	"body" text NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "comments_target_type_chk" CHECK ("comments"."target_type" in ('anime', 'episode')),
	CONSTRAINT "comments_body_len_chk" CHECK (char_length("comments"."body") between 1 and 2000),
	CONSTRAINT "comments_episode_shape_chk" CHECK (("comments"."target_type" = 'episode') = ("comments"."episode" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "comment_report_unq" ON "comment_reports" USING btree ("comment_id","anilist_user_id");--> statement-breakpoint
CREATE INDEX "comments_target_idx" ON "comments" USING btree ("anilist_id","target_type","episode","created_at","id");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");