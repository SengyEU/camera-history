CREATE TYPE "public"."lead_activity_type" AS ENUM('note', 'email_sent', 'reply', 'call', 'meeting', 'proposal_sent', 'status_change', 'pilot_started', 'other');--> statement-breakpoint
CREATE TYPE "public"."lead_archiveable" AS ENUM('yes', 'maybe', 'no');--> statement-breakpoint
CREATE TYPE "public"."lead_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."lead_proposal_status" AS ENUM('none', 'drafted', 'sent');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'reviewed', 'contacted', 'replied', 'demo', 'pilot', 'won', 'lost', 'not_now');--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" "lead_activity_type" NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"company" text NOT NULL,
	"website" text NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"segment" text DEFAULT '' NOT NULL,
	"priority" "lead_priority" DEFAULT 'medium' NOT NULL,
	"camera_count" integer DEFAULT 1 NOT NULL,
	"camera_locations" text DEFAULT '' NOT NULL,
	"package_code" text DEFAULT 'solo' NOT NULL,
	"wordpress" boolean DEFAULT true NOT NULL,
	"layout" text DEFAULT 'separate-pages' NOT NULL,
	"feed_type" text DEFAULT 'unknown' NOT NULL,
	"feed_url" text DEFAULT '' NOT NULL,
	"archiveable" "lead_archiveable" DEFAULT 'maybe' NOT NULL,
	"archive_reason" text DEFAULT '' NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"language" text DEFAULT '' NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"live_cam_url" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"last_contact_at" timestamp with time zone,
	"next_follow_up_at" timestamp with time zone,
	"proposal_status" "lead_proposal_status" DEFAULT 'none' NOT NULL,
	"pilot_started_at" timestamp with time zone,
	"pilot_ends_at" timestamp with time zone,
	"feedback" text DEFAULT '' NOT NULL,
	"case_study_consent" boolean DEFAULT false NOT NULL,
	"lost_reason" text DEFAULT '' NOT NULL,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_activities_lead_idx" ON "lead_activities" USING btree ("lead_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lead_activities_occurred_idx" ON "lead_activities" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_slug_unique" ON "leads" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_priority_idx" ON "leads" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "leads_next_follow_up_idx" ON "leads" USING btree ("next_follow_up_at");
