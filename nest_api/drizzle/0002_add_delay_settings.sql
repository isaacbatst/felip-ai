ALTER TABLE "bot_status" ADD COLUMN "delay_min" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_status" ADD COLUMN "delay_max" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE "group_delay_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "group_delay_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"group_id" bigint NOT NULL,
	"delay_enabled" boolean DEFAULT false NOT NULL,
	"delay_min" integer,
	"delay_max" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_delay_settings_user_id_group_id_unique" UNIQUE("user_id","group_id")
);
--> statement-breakpoint
CREATE INDEX "group_delay_settings_user_id_idx" ON "group_delay_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "group_delay_settings_user_id_group_id_idx" ON "group_delay_settings" USING btree ("user_id","group_id");
