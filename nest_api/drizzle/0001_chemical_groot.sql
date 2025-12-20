ALTER TABLE "active_groups" ALTER COLUMN "group_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "logged_in_user_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "telegram_user_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "chat_id" SET DATA TYPE bigint;