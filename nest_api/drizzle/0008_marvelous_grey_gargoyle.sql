CREATE TABLE "prompt_configs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "prompt_configs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"prompt_id" text NOT NULL,
	"version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_configs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "user_counter_offer_settings" ADD COLUMN "call_to_action_template_id" integer DEFAULT 1 NOT NULL;