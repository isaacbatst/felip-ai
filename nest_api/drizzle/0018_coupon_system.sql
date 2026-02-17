-- Coupons table
CREATE TABLE IF NOT EXISTS "coupons" (
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

-- Coupon indexes
CREATE INDEX IF NOT EXISTS "coupons_code_idx" ON "coupons" USING btree ("code");
CREATE INDEX IF NOT EXISTS "coupons_is_active_idx" ON "coupons" USING btree ("is_active");
CREATE INDEX IF NOT EXISTS "coupons_restricted_to_user_id_idx" ON "coupons" USING btree ("restricted_to_user_id");

-- Add coupon fields to subscriptions
ALTER TABLE "subscriptions" ADD COLUMN "coupon_id" integer;
ALTER TABLE "subscriptions" ADD COLUMN "bonus_groups" integer DEFAULT 0 NOT NULL;
ALTER TABLE "subscriptions" ADD COLUMN "coupon_discount_months_remaining" integer DEFAULT 0 NOT NULL;
