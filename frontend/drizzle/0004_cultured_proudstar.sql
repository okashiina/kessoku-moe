CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_anilist_user_id" integer NOT NULL,
	"type" text NOT NULL,
	"actor_name" text NOT NULL,
	"comment_id" integer NOT NULL,
	"anilist_id" integer NOT NULL,
	"target_type" text NOT NULL,
	"episode" integer,
	"snippet" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_anilist_user_id","created_at","id");