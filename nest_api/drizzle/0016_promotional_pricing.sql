ALTER TABLE "subscription_plans" ALTER COLUMN "group_limit" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "promotional_price_in_cents" integer;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "promotional_months" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "promotional_payments_remaining" integer DEFAULT 0 NOT NULL;