CREATE TABLE "web_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "web_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "telegram_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "chat_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "source" text DEFAULT 'telegram' NOT NULL;--> statement-breakpoint
CREATE INDEX "web_sessions_token_idx" ON "web_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "web_sessions_user_id_idx" ON "web_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "web_sessions_expires_at_idx" ON "web_sessions" USING btree ("expires_at");