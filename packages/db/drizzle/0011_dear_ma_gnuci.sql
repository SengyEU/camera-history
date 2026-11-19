ALTER TABLE "tenants" ADD COLUMN "package_code" text DEFAULT 'starter' NOT NULL;--> statement-breakpoint
UPDATE "tenants" SET "package_code" = CASE
  WHEN (SELECT count(*) FROM "cameras" WHERE "cameras"."tenant_id" = "tenants"."id") = 1 THEN 'solo'
  WHEN (SELECT count(*) FROM "cameras" WHERE "cameras"."tenant_id" = "tenants"."id") <= 3 THEN 'starter'
  WHEN (SELECT count(*) FROM "cameras" WHERE "cameras"."tenant_id" = "tenants"."id") <= 5 THEN 'plus'
  WHEN (SELECT count(*) FROM "cameras" WHERE "cameras"."tenant_id" = "tenants"."id") <= 10 THEN 'pro'
  ELSE 'network'
END;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_package_code_check" CHECK ("package_code" IN ('solo', 'starter', 'plus', 'pro', 'network'));--> statement-breakpoint
CREATE INDEX "images_timestamp_idx" ON "images" USING btree ("timestamp");--> statement-breakpoint
ALTER TABLE "cameras" DROP COLUMN "plan_months";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "plan_months";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "trial_claimed_at";