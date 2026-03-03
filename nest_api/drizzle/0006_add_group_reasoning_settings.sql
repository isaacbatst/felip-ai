CREATE TABLE "group_reasoning_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "group_reasoning_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"group_id" bigint NOT NULL,
	"reasoning_mode" text DEFAULT 'fast' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_reasoning_settings_user_id_group_id_unique" UNIQUE("user_id","group_id")
);
--> statement-breakpoint
CREATE INDEX "group_reasoning_settings_user_id_idx" ON "group_reasoning_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "group_reasoning_settings_user_id_group_id_idx" ON "group_reasoning_settings" USING btree ("user_id","group_id");