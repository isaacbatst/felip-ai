CREATE TABLE "blacklisted_users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "blacklisted_users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"blocked_telegram_user_id" bigint NOT NULL,
	"blocked_username" text,
	"blocked_name" text,
	"scope" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blacklisted_users_user_id_blocked_id_unique" UNIQUE("user_id","blocked_telegram_user_id")
);
--> statement-breakpoint
CREATE INDEX "blacklisted_users_user_id_idx" ON "blacklisted_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "blacklisted_users_user_id_blocked_id_idx" ON "blacklisted_users" USING btree ("user_id","blocked_telegram_user_id");
