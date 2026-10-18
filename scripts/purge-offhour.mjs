#!/usr/bin/env node
// Keep exactly one capture per camera per UTC hour (the one closest to :00)
// and hard-delete the rest (MinIO object + DB row).
// Usage: node scripts/purge-offhour.mjs [--dry-run]
import { readFileSync } from "node:fs";
import { Client as Pg } from "pg";
import { Client as Minio } from "minio";

const env = {};
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const dry = process.argv.includes("--dry-run");
const db = new Pg({ connectionString: env.DATABASE_URL });
await db.connect();

const CANDIDATES_SQL = `
WITH ranked AS (
  SELECT id, storage_key,
         row_number() OVER (
           PARTITION BY camera_id, date_trunc('hour', timestamp AT TIME ZONE 'UTC')
           ORDER BY
             EXTRACT(MINUTE FROM timestamp AT TIME ZONE 'UTC') * 60
             + EXTRACT(SECOND FROM timestamp AT TIME ZONE 'UTC')
         ) AS rn
  FROM images
)
SELECT id, storage_key FROM ranked WHERE rn > 1 ORDER BY id`;

const { rows } = await db.query(CANDIDATES_SQL);
console.log(`extra captures (kept one per camera-hour): ${rows.length}`);
if (rows.length > 0) console.log("sample:", rows.slice(0, 5).map((r) => r.storage_key).join(", "));

if (!dry && rows.length > 0) {
  const minio = new Minio({
    endPoint: env.MINIO_ENDPOINT,
    port: Number(env.MINIO_PORT ?? "9000"),
    useSSL: env.MINIO_USE_SSL === "true",
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });
  let objects = 0;
  const failedRemovals = [];
  for (const row of rows) {
    try {
      await minio.removeObject(env.MINIO_BUCKET, row.storage_key);
      objects += 1;
    } catch (error) {
      failedRemovals.push(row.storage_key);
      console.warn(`warn: remove ${row.storage_key}: ${error.message}`);
    }
  }
  const ids = rows.map((r) => r.id);
  const deleted = await db.query("DELETE FROM images WHERE id = ANY($1::uuid[])", [ids]);
  const { rows: dupes } = await db.query(
    `SELECT count(*)::int AS n FROM (
       SELECT camera_id, date_trunc('hour', timestamp AT TIME ZONE 'UTC') AS h
       FROM images GROUP BY 1, 2 HAVING count(*) > 1
     ) x`,
  );
  console.log(
    `removed ${objects} objects (failed ${failedRemovals.length}), rows deleted: ${deleted.rowCount}; camera-hours with >1 frame: ${dupes[0].n}`,
  );
}
if (dry) console.log("dry run — nothing deleted");
await db.end();
