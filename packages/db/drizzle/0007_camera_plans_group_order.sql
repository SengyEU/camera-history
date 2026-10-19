ALTER TABLE "camera_group_members" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cameras" ADD COLUMN "plan_months" numeric(4, 1);--> statement-breakpoint
CREATE INDEX "camera_group_members_group_position_idx" ON "camera_group_members" USING btree ("camera_group_id","position");--> statement-breakpoint
WITH ranked AS (
  SELECT
    m.camera_group_id,
    m.camera_id,
    (ROW_NUMBER() OVER (PARTITION BY m.camera_group_id ORDER BY c.name, m.camera_id) - 1)::int AS pos
  FROM camera_group_members m
  JOIN cameras c ON c.id = m.camera_id
)
UPDATE camera_group_members m
SET position = ranked.pos
FROM ranked
WHERE m.camera_group_id = ranked.camera_group_id
  AND m.camera_id = ranked.camera_id;
