#!/usr/bin/env node
// Hard-delete every image whose capture minute is not :00 (DB row + MinIO object).
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

const { rows } = await db.query(
  "SELECT id, storage_key FROM images WHERE EXTRACT(MINUTE FROM timestamp) <> 0 ORDER BY timestamp",
);
console.log(`off-hour images: ${rows.length}`);
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
  for (const row of rows) {
    try {
      await minio.removeObject(env.MINIO_BUCKET, row.storage_key);
      objects += 1;
    } catch (error) {
      console.warn(`warn: remove ${row.storage_key}: ${error.message}`);
    }
  }
  await db.query("DELETE FROM images WHERE EXTRACT(MINUTE FROM timestamp) <> 0");
  const { rows: left } = await db.query(
    "SELECT count(*)::int AS n FROM images WHERE EXTRACT(MINUTE FROM timestamp) <> 0",
  );
  console.log(`removed ${objects} objects, rows deleted; remaining off-hour: ${left[0].n}`);
}
if (dry) console.log("dry run — nothing deleted");
await db.end();
