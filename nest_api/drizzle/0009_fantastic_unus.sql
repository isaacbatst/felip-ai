ALTER TABLE "user_max_prices" ADD COLUMN "counter_offer_price_threshold" real;--> statement-breakpoint
ALTER TABLE "group_counter_offer_settings" DROP COLUMN "price_threshold";