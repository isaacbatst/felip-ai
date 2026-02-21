ALTER TABLE "user_counter_offer_settings"
  ADD COLUMN IF NOT EXISTS "group_dedup_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "group_dedup_window_minutes" integer NOT NULL DEFAULT 1;
