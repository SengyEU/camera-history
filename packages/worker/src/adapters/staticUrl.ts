import { HttpError } from "@ch/core";

export interface FetchJpegOptions {
  timeoutMs: number;
  maxBytes: number;
}

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff]);

export async function fetchJpeg(url: string, opts: FetchJpegOptions): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpError(400, "unsupported_scheme", `only http/https allowed, got ${parsed.protocol}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new HttpError(502, "upstream_error", `feed returned HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > opts.maxBytes) {
      throw new HttpError(502, "feed_too_large", `feed exceeded ${opts.maxBytes} bytes`);
    }
    if (buf.length < JPEG_HEADER.length || !buf.subarray(0, 3).equals(JPEG_HEADER)) {
      throw new HttpError(502, "not_jpeg", "feed is not a JPEG image");
    }
    return buf;
  } finally {
    clearTimeout(timer);
  }
}