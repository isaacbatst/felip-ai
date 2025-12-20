CREATE TABLE "active_groups" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "active_groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"group_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "active_groups_user_id_group_id_unique" UNIQUE("user_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"request_id" text PRIMARY KEY NOT NULL,
	"logged_in_user_id" integer NOT NULL,
	"telegram_user_id" integer NOT NULL,
	"phone_number" text,
	"chat_id" integer NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "worker_ports" (
	"user_id" text PRIMARY KEY NOT NULL,
	"port" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "active_groups_user_id_idx" ON "active_groups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "active_groups_user_id_group_id_idx" ON "active_groups" USING btree ("user_id","group_id");--> statement-breakpoint
CREATE INDEX "sessions_telegram_user_id_idx" ON "sessions" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "sessions_logged_in_user_id_idx" ON "sessions" USING btree ("logged_in_user_id");--> statement-breakpoint
CREATE INDEX "sessions_state_idx" ON "sessions" USING btree ("state");