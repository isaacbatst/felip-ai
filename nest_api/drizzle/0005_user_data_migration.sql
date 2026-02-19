-- Migration: User Data Management Tables
-- Description: Create tables for per-user price tables, max prices, and available miles
-- Replaces shared Google Spreadsheet data with per-user database storage

-- Miles Programs table (global list of available programs)
CREATE TABLE "miles_programs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "miles_programs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL UNIQUE,
	"liminar_of_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "miles_programs_name_idx" ON "miles_programs" USING btree ("name");
--> statement-breakpoint
CREATE INDEX "miles_programs_liminar_of_id_idx" ON "miles_programs" USING btree ("liminar_of_id");

--> statement-breakpoint

-- Dashboard Tokens table (web dashboard access)
CREATE TABLE "dashboard_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dashboard_tokens_user_id_idx" ON "dashboard_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "dashboard_tokens_expires_at_idx" ON "dashboard_tokens" USING btree ("expires_at");

--> statement-breakpoint

-- User Price Entries table (per-user price tables)
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
CREATE INDEX "user_price_entries_user_id_idx" ON "user_price_entries" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "user_price_entries_program_id_idx" ON "user_price_entries" USING btree ("program_id");

--> statement-breakpoint

-- User Max Prices table (per-user PREÇO TETO)
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
CREATE INDEX "user_max_prices_user_id_idx" ON "user_max_prices" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "user_max_prices_program_id_idx" ON "user_max_prices" USING btree ("program_id");

--> statement-breakpoint

-- User Available Miles table (per-user stock)
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
CREATE INDEX "user_available_miles_user_id_idx" ON "user_available_miles" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "user_available_miles_program_id_idx" ON "user_available_miles" USING btree ("program_id");



