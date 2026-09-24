#!/usr/bin/env node
// Bez deps ZIP writer pro WordPress plugin (root má být `camera-history/`).
// Využívá zlib.crc32 + deflateRawSync (Node >= 22.2; VPS má v22.23.2).
// Deterministický: fixní DOS timestamp, seřazený seznam souborů.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "packages", "wp-plugin", "camera-history");
const OUT_DIR = join(ROOT, "packages", "wp-plugin", "dist");
const OUT_FILE = join(OUT_DIR, "camera-history.zip");

// zlib.crc32 vyžaduje Node >= 22.2. Root engines>=20, proto explicitní guard
// místo polyfillu (VPS má v22.23.2).
if (typeof crc32 !== "function") {
  throw new Error("zlib.crc32 neni dostupny (potreba Node >= 22.2)");
}

function collectFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(base, full).split(sep).join("/");
    if (statSync(full).isDirectory()) {
      out.push(rel + "/");
      out.push(...collectFiles(full, base));
    } else {
      out.push(rel);
    }
  }
  return out;
}

// entries: { name (path uvnitř ZIP), full (disk path) }
const entries = collectFiles(SRC).map((rel) => ({
  name: "camera-history/" + rel,
  // rel končí "/" pro adresáře → vadný join: uložíme i čistý disk path
  full: rel.endsWith("/") ? join(SRC, rel.slice(0, -1)) : join(SRC, rel),
}));

const DOS_DATE = 0x5d38; // 2026-09-24 (deterministický)

function localHeader(nameBuf, crc, method, compressed, size) {
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4); // version needed
  h.writeUInt16LE(0x0800, 6); // UTF-8 flag
  h.writeUInt16LE(method, 8);
  h.writeUInt16LE(0, 10); // time
  h.writeUInt16LE(DOS_DATE, 12);
  h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(compressed.length, 18);
  h.writeUInt32LE(size, 22);
  h.writeUInt16LE(nameBuf.length, 26);
  h.writeUInt16LE(0, 28);
  return h;
}

function centralHeader(nameBuf, crc, method, compressed, size, offset) {
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0);
  c.writeUInt16LE(20, 4); // version made by
  c.writeUInt16LE(20, 6); // version needed
  c.writeUInt16LE(0x0800, 8); // UTF-8 flag
  c.writeUInt16LE(method, 10);
  c.writeUInt16LE(0, 12); // time
  c.writeUInt16LE(DOS_DATE, 14);
  c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(compressed.length, 20);
  c.writeUInt32LE(size, 24);
  c.writeUInt16LE(nameBuf.length, 28);
  c.writeUInt16LE(0, 30); // extra
  c.writeUInt16LE(0, 32); // comment
  c.writeUInt16LE(0, 34); // disk start
  c.writeUInt16LE(0, 36); // internal attrs
  c.writeUInt32LE(0, 38); // external attrs
  c.writeUInt32LE(offset, 42);
  return c;
}

function buildZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const { name, full } = entry;
    const nameBuf = Buffer.from(name, "utf8");
    const isDir = name.endsWith("/");
    const data = isDir ? Buffer.alloc(0) : readFileSync(full);
    const method = isDir ? 0 : 8;
    const compressed = isDir ? Buffer.alloc(0) : deflateRawSync(data);
    const crc = isDir ? 0 : crc32(data);

    local.push(Buffer.concat([localHeader(nameBuf, crc, method, compressed, data.length), nameBuf, compressed]));
    central.push(Buffer.concat([centralHeader(nameBuf, crc, method, compressed, data.length, offset), nameBuf]));
    offset += 30 + nameBuf.length + compressed.length;
  }

  const cdStart = offset;
  const cdSize = central.reduce((sum, b) => sum + b.length, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // cd start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([...local, ...central, eocd]);
}

const zip = buildZip(entries);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, zip);

console.log(`camera-history.zip: ${entries.length} entries, ${zip.length} bytes`);
for (const e of entries) console.log(`  ${e.name}`);