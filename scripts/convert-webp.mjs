#!/usr/bin/env node
// Convert every remaining .jpg image to WebP (max 1600px, q75), update storage_key, delete originals.
// Usage: node scripts/convert-webp.mjs [--dry-run]
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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
const minio = new Minio({
  endPoint: env.MINIO_ENDPOINT,
  port: Number(env.MINIO_PORT ?? "9000"),
  useSSL: env.MINIO_USE_SSL === "true",
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

const { rows } = await db.query(
  "SELECT id, storage_key, size_bytes FROM images WHERE storage_key LIKE '%.jpg' ORDER BY timestamp",
);
console.log(`jpg images to convert: ${rows.length}`);
if (dry) {
  console.log("dry run — nothing converted");
  await db.end();
  process.exit(0);
}

async function getBuffer(key) {
  const stream = await minio.getObject(env.MINIO_BUCKET, key);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

let done = 0;
let failed = 0;
let before = 0;
let after = 0;
for (const row of rows) {
  const inPath = join(tmpdir(), `conv-${row.id}.jpg`);
  const outPath = join(tmpdir(), `conv-${row.id}.webp`);
  try {
    const input = await getBuffer(row.storage_key);
    writeFileSync(inPath, input);
    const res = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", inPath,
      "-vf", "scale='min(1600,iw)':-2",
      "-c:v", "libwebp", "-quality", "75",
      "-f", "webp", outPath,
    ]);
    if (res.status !== 0) {
      console.warn(`warn: ffmpeg failed for ${row.storage_key}: ${String(res.stderr).slice(0, 200)}`);
      failed += 1;
      continue;
    }
    const output = readFileSync(outPath);
    const newKey = row.storage_key.replace(/\.jpg$/, ".webp");
    await minio.putObject(env.MINIO_BUCKET, newKey, output, output.length, { "Content-Type": "image/webp" });
    await db.query("UPDATE images SET storage_key = $1, size_bytes = $2 WHERE id = $3", [newKey, output.length, row.id]);
    try {
      await minio.removeObject(env.MINIO_BUCKET, row.storage_key);
    } catch (error) {
      console.warn(`warn: delete original ${row.storage_key}: ${error.message}`);
    }
    before += input.length;
    after += output.length;
    done += 1;
    if (done % 25 === 0) console.log(`… ${done}/${rows.length}`);
  } catch (error) {
    console.warn(`warn: convert ${row.storage_key}: ${error.message}`);
    failed += 1;
  } finally {
    for (const path of [inPath, outPath]) {
      try {
        if (existsSync(path)) unlinkSync(path);
      } catch (error) {
        console.warn(`warn: cleanup ${path}: ${error.message}`);
      }
    }
  }
}
console.log(`converted ${done}/${rows.length} · failed: ${failed} · ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`);
const { rows: left } = await db.query("SELECT count(*)::int AS n FROM images WHERE storage_key LIKE '%.jpg'");
console.log(`remaining jpg: ${left[0].n}`);
await db.end();
