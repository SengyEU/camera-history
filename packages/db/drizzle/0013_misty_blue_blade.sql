ALTER TABLE "cameras" ADD COLUMN "slug" text;--> statement-breakpoint
WITH base AS (
  SELECT
    id,
    tenant_id,
    created_at,
    left(
      coalesce(
        nullif(trim(both '-' from lower(regexp_replace(name, '[^A-Za-z0-9]+', '-', 'g'))), ''),
        'camera'
      ),
      34
    ) AS base_slug
  FROM "cameras"
), numbered AS (
  SELECT
    id,
    base_slug,
    row_number() OVER (PARTITION BY tenant_id, base_slug ORDER BY created_at, id) AS rn
  FROM base
)
UPDATE "cameras" AS c
SET "slug" = CASE
  WHEN n.rn = 1 THEN n.base_slug
  ELSE n.base_slug || '-' || n.rn
END
FROM numbered AS n
WHERE c.id = n.id;--> statement-breakpoint
ALTER TABLE "cameras" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cameras_tenant_slug_unique" ON "cameras" USING btree ("tenant_id","slug");
