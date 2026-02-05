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
	"group_limit" integer NOT NULL,
	"duration_days" integer,
	"features" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "subscription_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
	"extra_groups" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE INDEX "cielo_webhook_events_payment_id_idx" ON "cielo_webhook_events" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "cielo_webhook_events_recurrent_payment_id_idx" ON "cielo_webhook_events" USING btree ("recurrent_payment_id");--> statement-breakpoint
CREATE INDEX "cielo_webhook_events_created_at_idx" ON "cielo_webhook_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subscription_payments_subscription_id_idx" ON "subscription_payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_payments_status_idx" ON "subscription_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscription_payments_created_at_idx" ON "subscription_payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subscription_plans_name_idx" ON "subscription_plans" USING btree ("name");--> statement-breakpoint
CREATE INDEX "subscription_plans_is_active_idx" ON "subscription_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "subscription_tokens_user_id_idx" ON "subscription_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscription_tokens_expires_at_idx" ON "subscription_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions" USING btree ("current_period_end");