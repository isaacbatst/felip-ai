CREATE TABLE "user_counter_offer_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"price_threshold" real DEFAULT 0.5 NOT NULL,
	"message_template_id" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
