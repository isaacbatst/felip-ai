CREATE TABLE "active_groups" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "active_groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"group_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "active_groups_user_id_group_id_unique" UNIQUE("user_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "bot_status" (
	"user_id" text PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cielo_webhook_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cielo_webhook_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"payment_id" text,
	"recurrent_payment_id" text,
	"change_type" integer NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"processed_at" timestamp,
	"processing_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coupons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"discount_type" text,
	"discount_value" integer,
	"discount_duration_months" integer,
	"extra_group_price_in_cents" integer,
	"bonus_groups" integer DEFAULT 0 NOT NULL,
	"restricted_to_user_id" text,
	"restricted_to_plan_id" integer,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp,
	"max_redemptions" integer,
	"current_redemptions" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "messages_enqueued" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "messages_enqueued_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"queue_name" text NOT NULL,
	"message_data" jsonb NOT NULL,
	"user_id" text,
	"enqueued_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages_processed" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "messages_processed_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"queue_name" text NOT NULL,
	"message_data" jsonb NOT NULL,
	"user_id" text,
	"status" text NOT NULL,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "otp_codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "otp_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"phone" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "sessions" (
	"request_id" text PRIMARY KEY NOT NULL,
	"logged_in_user_id" bigint NOT NULL,
	"telegram_user_id" bigint,
	"phone_number" text,
	"chat_id" bigint,
	"source" text DEFAULT 'telegram' NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscription_payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"subscription_id" integer NOT NULL,
	"cielo_payment_id" text,
	"amount_in_cents" integer NOT NULL,
	"status" text NOT NULL,
	"cielo_return_code" text,
	"cielo_return_message" text,
	"authorization_code" text,
	"paid_at" timestamp,
	"failed_at" timestamp,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscription_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"price_in_cents" integer NOT NULL,
	"group_limit" integer,
	"duration_days" integer,
	"promotional_price_in_cents" integer,
	"promotional_months" integer,
	"features" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"plan_id" integer NOT NULL,
	"status" text NOT NULL,
	"cielo_recurrent_payment_id" text,
	"cielo_card_token" text,
	"card_last_four_digits" text,
	"card_brand" text,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"current_period_start" timestamp DEFAULT now() NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"next_billing_date" timestamp,
	"canceled_at" timestamp,
	"cancel_reason" text,
	"trial_used" boolean DEFAULT false NOT NULL,
	"promotional_payments_remaining" integer DEFAULT 0 NOT NULL,
	"extra_groups" integer DEFAULT 0 NOT NULL,
	"coupon_id" integer,
	"bonus_groups" integer DEFAULT 0 NOT NULL,
	"coupon_discount_months_remaining" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
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
	"call_to_action_template_id" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_max_prices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_max_prices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"program_id" integer NOT NULL,
	"max_price" real NOT NULL,
	"min_quantity" integer DEFAULT 0 NOT NULL,
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
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"phone" text NOT NULL,
	"telegram_user_id" bigint NOT NULL,
	"chat_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_telegram_user_id_unique" UNIQUE("telegram_user_id")
);
--> statement-breakpoint
CREATE TABLE "web_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "web_sessions_token_unique" UNIQUE("token")
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
CREATE INDEX "bot_status_user_id_idx" ON "bot_status" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cielo_webhook_events_payment_id_idx" ON "cielo_webhook_events" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "cielo_webhook_events_recurrent_payment_id_idx" ON "cielo_webhook_events" USING btree ("recurrent_payment_id");--> statement-breakpoint
CREATE INDEX "cielo_webhook_events_created_at_idx" ON "cielo_webhook_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "coupons_code_idx" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "coupons_is_active_idx" ON "coupons" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "coupons_restricted_to_user_id_idx" ON "coupons" USING btree ("restricted_to_user_id");--> statement-breakpoint
CREATE INDEX "messages_enqueued_queue_name_idx" ON "messages_enqueued" USING btree ("queue_name");--> statement-breakpoint
CREATE INDEX "messages_enqueued_user_id_idx" ON "messages_enqueued" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_enqueued_enqueued_at_idx" ON "messages_enqueued" USING btree ("enqueued_at");--> statement-breakpoint
CREATE INDEX "messages_processed_queue_name_idx" ON "messages_processed" USING btree ("queue_name");--> statement-breakpoint
CREATE INDEX "messages_processed_user_id_idx" ON "messages_processed" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_processed_status_idx" ON "messages_processed" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_processed_processed_at_idx" ON "messages_processed" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "miles_programs_name_idx" ON "miles_programs" USING btree ("name");--> statement-breakpoint
CREATE INDEX "miles_programs_liminar_of_id_idx" ON "miles_programs" USING btree ("liminar_of_id");--> statement-breakpoint
CREATE INDEX "otp_codes_phone_idx" ON "otp_codes" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "sessions_telegram_user_id_idx" ON "sessions" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "sessions_logged_in_user_id_idx" ON "sessions" USING btree ("logged_in_user_id");--> statement-breakpoint
CREATE INDEX "sessions_state_idx" ON "sessions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "subscription_payments_subscription_id_idx" ON "subscription_payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_payments_status_idx" ON "subscription_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscription_payments_created_at_idx" ON "subscription_payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subscription_plans_name_idx" ON "subscription_plans" USING btree ("name");--> statement-breakpoint
CREATE INDEX "subscription_plans_is_active_idx" ON "subscription_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE INDEX "user_available_miles_user_id_idx" ON "user_available_miles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_available_miles_program_id_idx" ON "user_available_miles" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "user_max_prices_user_id_idx" ON "user_max_prices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_max_prices_program_id_idx" ON "user_max_prices" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "user_price_entries_user_id_idx" ON "user_price_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_price_entries_program_id_idx" ON "user_price_entries" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_telegram_user_id_idx" ON "users" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "web_sessions_token_idx" ON "web_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "web_sessions_user_id_idx" ON "web_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "web_sessions_expires_at_idx" ON "web_sessions" USING btree ("expires_at");