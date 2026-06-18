CREATE TABLE "episode_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"anilist_id" integer NOT NULL,
	"episode" integer NOT NULL,
	"anilist_user_id" integer NOT NULL,
	"score" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episode_rating_score_range" CHECK ("episode_ratings"."score" between 1 and 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "episode_rating_user_unq" ON "episode_ratings" USING btree ("anilist_id","episode","anilist_user_id");