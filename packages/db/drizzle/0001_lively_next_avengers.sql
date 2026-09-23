CREATE TYPE "public"."camera_status" AS ENUM('operational', 'delayed', 'offline');--> statement-breakpoint
ALTER TABLE "cameras" ADD COLUMN "status" "camera_status" DEFAULT 'operational' NOT NULL;