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
CREATE INDEX "messages_enqueued_queue_name_idx" ON "messages_enqueued" USING btree ("queue_name");--> statement-breakpoint
CREATE INDEX "messages_enqueued_user_id_idx" ON "messages_enqueued" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_enqueued_enqueued_at_idx" ON "messages_enqueued" USING btree ("enqueued_at");--> statement-breakpoint
CREATE INDEX "messages_processed_queue_name_idx" ON "messages_processed" USING btree ("queue_name");--> statement-breakpoint
CREATE INDEX "messages_processed_user_id_idx" ON "messages_processed" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_processed_status_idx" ON "messages_processed" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_processed_processed_at_idx" ON "messages_processed" USING btree ("processed_at");