CREATE TABLE "group_counter_offer_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "group_counter_offer_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"group_id" bigint NOT NULL,
	"is_enabled" boolean NOT NULL,
	"price_threshold" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_counter_offer_settings_user_id_group_id_unique" UNIQUE("user_id","group_id")
);
--> statement-breakpoint
CREATE INDEX "group_counter_offer_settings_user_id_idx" ON "group_counter_offer_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "group_counter_offer_settings_user_id_group_id_idx" ON "group_counter_offer_settings" USING btree ("user_id","group_id");