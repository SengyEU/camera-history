ALTER TABLE "cameras" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "cameras" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "cameras" ADD COLUMN "daylight_only" boolean DEFAULT false NOT NULL;