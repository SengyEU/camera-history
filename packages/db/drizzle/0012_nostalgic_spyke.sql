ALTER TABLE "cameras" ALTER COLUMN "interval_minutes" SET DEFAULT 60;--> statement-breakpoint
UPDATE "cameras" SET "interval_minutes" = 60;
