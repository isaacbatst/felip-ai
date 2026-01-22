CREATE TABLE "bot_status" (
	"user_id" text PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bot_status_user_id_idx" ON "bot_status" USING btree ("user_id");