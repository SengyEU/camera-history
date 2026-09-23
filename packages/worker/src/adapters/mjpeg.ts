import { HttpError } from "@ch/core";
import type { FetchJpegOptions } from "./staticUrl.js";

const SOI = Buffer.from([0xff, 0xd8, 0xff]);
const EOI = Buffer.from([0xff, 0xd9]);

export async function captureMjpeg(url: string, opts: FetchJpegOptions): Promise<Buffer> {
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
    if (!res.body) {
      throw new HttpError(502, "upstream_error", "feed returned no body");
    }

    const reader = res.body.getReader();
    try {
      let buf = Buffer.alloc(0);
      let start = -1;

      while (start === -1) {
        const { done, value } = await reader.read();
        if (done) throw new HttpError(502, "not_jpeg", "stream ended without a JPEG frame");
        buf = Buffer.concat([buf, Buffer.from(value)]);
        if (buf.length > opts.maxBytes) {
          throw new HttpError(502, "feed_too_large", `feed exceeded ${opts.maxBytes} bytes`);
        }
        start = buf.indexOf(SOI);
      }

      while (true) {
        const end = buf.indexOf(EOI, start + SOI.length);
        if (end !== -1) {
          const frame = buf.subarray(start, end + EOI.length);
          return frame;
        }
        const { done, value } = await reader.read();
        if (done) throw new HttpError(502, "not_jpeg", "stream ended without JPEG end marker");
        buf = Buffer.concat([buf, Buffer.from(value)]);
        if (buf.length > opts.maxBytes) {
          throw new HttpError(502, "feed_too_large", `feed exceeded ${opts.maxBytes} bytes`);
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {}
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new HttpError(502, "capture_timeout", "mjpeg frame timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}