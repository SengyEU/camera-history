import { HttpError } from "@ch/core";
import { fetchJpeg, type FetchJpegOptions } from "./staticUrl.js";

const SNAPSHOT_RE =
  /https:\/\/s\d+\.ipcamlive\.com\/streams\/[A-Za-z0-9]+\/snapshot\.jpg/;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PAGE_BYTES = 1_000_000;

interface CachedSnapshot {
  url: string;
  at: number;
}

const snapshotCache = new Map<string, CachedSnapshot>();

export function clearIpcamliveCache(): void {
  snapshotCache.clear();
}

/** Accepts an alias, a player URL, or a widget URL and returns the alias. */
export function ipcamliveAlias(input: string): string {
  const raw = input.trim();
  if (!raw) throw new HttpError(400, "bad_request", "ipcamlive alias is required");
  if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "bad_request", "ipcamlive input must be an alias or player URL");
  }
  const requested = url.searchParams.get("alias");
  if (requested && /^[A-Za-z0-9_-]+$/.test(requested)) return requested;

  if (!/(^|\.)ipcamlive\.com$/i.test(url.hostname)) {
    throw new HttpError(400, "bad_request", "ipcamlive input must point to ipcamlive.com");
  }
  if (/^s\d+\./i.test(url.hostname) || url.pathname.startsWith("/streams/")) {
    throw new HttpError(
      400,
      "bad_request",
      "use the IPCamlive player URL or alias, not the snapshot URL",
    );
  }
  const alias = url.pathname.replace(/^\/+|\/+$/g, "");
  if (alias && /^[A-Za-z0-9_-]+$/.test(alias)) return alias;
  throw new HttpError(400, "bad_request", "could not find an IPCamlive alias in the URL");
}

export function findIpcamliveSnapshot(html: string): string | null {
  const normalized = html.replace(/\\\//g, "/");
  return SNAPSHOT_RE.exec(normalized)?.[0] ?? null;
}

export async function resolveIpcamliveSnapshot(
  alias: string,
  opts: FetchJpegOptions,
): Promise<string> {
  const cached = snapshotCache.get(alias);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.url;

  const playerUrl = `https://www.ipcamlive.com/${encodeURIComponent(alias)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(playerUrl, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!res.ok) {
      throw new HttpError(502, "upstream_error", `ipcamlive returned HTTP ${res.status}`);
    }
    const html = await res.text();
    if (html.length > MAX_PAGE_BYTES) {
      throw new HttpError(502, "feed_too_large", "ipcamlive page was unexpectedly large");
    }
    const snapshot = findIpcamliveSnapshot(html);
    if (!snapshot) {
      throw new HttpError(
        502,
        "ipcamlive_snapshot_missing",
        "ipcamlive page does not expose a snapshot URL",
      );
    }
    snapshotCache.set(alias, { url: snapshot, at: Date.now() });
    return snapshot;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new HttpError(502, "capture_timeout", "ipcamlive page timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function captureIpcamlive(
  input: string,
  opts: FetchJpegOptions,
): Promise<Buffer> {
  const alias = ipcamliveAlias(input);
  const snapshot = await resolveIpcamliveSnapshot(alias, opts);
  try {
    return await fetchJpeg(snapshot, opts);
  } catch (err) {
    // The stream may have moved to another shard; resolve once more before failing.
    snapshotCache.delete(alias);
    const refreshed = await resolveIpcamliveSnapshot(alias, opts);
    if (refreshed === snapshot) throw err;
    return await fetchJpeg(refreshed, opts);
  }
}
