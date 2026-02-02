CREATE TABLE "dashboard_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "miles_programs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "miles_programs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"liminar_of_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "miles_programs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_available_miles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_available_miles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"program_id" integer NOT NULL,
	"available_miles" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_available_miles_user_program_unique" UNIQUE("user_id","program_id")
);
--> statement-breakpoint
CREATE TABLE "user_counter_offer_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"price_threshold" real DEFAULT 0.5 NOT NULL,
	"message_template_id" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_max_prices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_max_prices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"program_id" integer NOT NULL,
	"max_price" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_max_prices_user_program_unique" UNIQUE("user_id","program_id")
);
--> statement-breakpoint
CREATE TABLE "user_price_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_price_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"program_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"price" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_price_entries_user_program_quantity_unique" UNIQUE("user_id","program_id","quantity")
);
--> statement-breakpoint
CREATE INDEX "dashboard_tokens_user_id_idx" ON "dashboard_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dashboard_tokens_expires_at_idx" ON "dashboard_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "miles_programs_name_idx" ON "miles_programs" USING btree ("name");--> statement-breakpoint
CREATE INDEX "miles_programs_liminar_of_id_idx" ON "miles_programs" USING btree ("liminar_of_id");--> statement-breakpoint
CREATE INDEX "user_available_miles_user_id_idx" ON "user_available_miles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_available_miles_program_id_idx" ON "user_available_miles" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "user_max_prices_user_id_idx" ON "user_max_prices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_max_prices_program_id_idx" ON "user_max_prices" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "user_price_entries_user_id_idx" ON "user_price_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_price_entries_program_id_idx" ON "user_price_entries" USING btree ("program_id");