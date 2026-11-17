ALTER TABLE "tenants" ADD COLUMN "is_pilot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "pilot_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "pilot_until" timestamp with time zone;