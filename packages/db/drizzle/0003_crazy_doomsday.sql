CREATE TABLE "camera_group_members" (
	"camera_group_id" uuid NOT NULL,
	"camera_id" uuid NOT NULL,
	CONSTRAINT "camera_group_members_camera_group_id_camera_id_pk" PRIMARY KEY("camera_group_id","camera_id")
);
--> statement-breakpoint
CREATE TABLE "camera_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "camera_group_members" ADD CONSTRAINT "camera_group_members_camera_group_id_camera_groups_id_fk" FOREIGN KEY ("camera_group_id") REFERENCES "public"."camera_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_group_members" ADD CONSTRAINT "camera_group_members_camera_id_cameras_id_fk" FOREIGN KEY ("camera_id") REFERENCES "public"."cameras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_groups" ADD CONSTRAINT "camera_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "camera_group_members_camera_idx" ON "camera_group_members" USING btree ("camera_id");--> statement-breakpoint
CREATE UNIQUE INDEX "camera_groups_tenant_slug_unique" ON "camera_groups" USING btree ("tenant_id","slug");