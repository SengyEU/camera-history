CREATE TYPE "public"."billing_status" AS ENUM('none', 'active', 'past_due', 'unpaid', 'canceled');--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "plan_months" SET DATA TYPE numeric(4, 1);--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "plan_months" SET DEFAULT '12';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "billing_status" "billing_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "billing_grace_until" timestamp with time zone;