CREATE TABLE "notify_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"anilist_id" integer NOT NULL,
	"episode" integer NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notify_prefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_kind" text NOT NULL,
	"owner_id" text NOT NULL,
	"master_enabled" boolean DEFAULT true NOT NULL,
	"auto_watching" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notify_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_kind" text NOT NULL,
	"owner_id" text NOT NULL,
	"anilist_id" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"owner_kind" text NOT NULL,
	"owner_id" text NOT NULL,
	"anilist_user_id" integer,
	"device_id" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notify_log_anime_ep_unq" ON "notify_log" USING btree ("anilist_id","episode");--> statement-breakpoint
CREATE UNIQUE INDEX "notify_prefs_owner_unq" ON "notify_prefs" USING btree ("owner_kind","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notify_target_owner_anime_source_unq" ON "notify_targets" USING btree ("owner_kind","owner_id","anilist_id","source");--> statement-breakpoint
CREATE INDEX "notify_target_anime_idx" ON "notify_targets" USING btree ("anilist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_sub_endpoint_unq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_sub_owner_idx" ON "push_subscriptions" USING btree ("owner_kind","owner_id");