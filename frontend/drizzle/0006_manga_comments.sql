-- Allow per-chapter manga comments by adding a third target_type
-- ('manga_chapter') and reusing the existing "episode" column as the chapter
-- number discriminator. Additive + safe: every existing row already satisfies
-- the relaxed constraints (anime rows have a null episode; episode rows carry
-- one), so no row is rewritten and there is no data loss.
ALTER TABLE "comments" DROP CONSTRAINT "comments_target_type_chk";--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_target_type_chk" CHECK ("comments"."target_type" in ('anime', 'episode', 'manga_chapter'));--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT "comments_episode_shape_chk";--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_episode_shape_chk" CHECK (("comments"."target_type" in ('episode', 'manga_chapter')) = ("comments"."episode" is not null));
