import { HttpError } from "@ch/core";
import type { FetchJpegOptions } from "./staticUrl.js";

export interface CustomCaptureOptions extends FetchJpegOptions {
  WebSocketCtor?: typeof WebSocket;
}

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff]);
const DATA_URL_BASE64 = /^data:[^;,]*;base64,(.*)$/s;

function frameToBuffer(data: unknown): Buffer {
  if (typeof data === "string") {
    const m = DATA_URL_BASE64.exec(data);
    if (m) return Buffer.from(m[1] ?? "", "base64");
    return Buffer.from(data, "utf8");
  }
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(String(data), "utf8");
}

export async function captureCustom(url: string, opts: CustomCaptureOptions): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "wss:" && parsed.protocol !== "ws:") {
    throw new HttpError(400, "unsupported_scheme", `only wss/ws allowed, got ${parsed.protocol}`);
  }

  const WS = opts.WebSocketCtor ?? WebSocket;
  return new Promise<Buffer>((resolve, reject) => {
    const ws = new WS(url);
    ws.binaryType = "arraybuffer";

    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      reject(new HttpError(502, "capture_timeout", "no frame received in time"));
    }, opts.timeoutMs);

    ws.onerror = () => {
      clearTimeout(timer);
      reject(new HttpError(502, "ws_error", "websocket connection error"));
    };
    ws.onmessage = (ev: MessageEvent) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      const buf = frameToBuffer(ev.data);
      if (buf.length > opts.maxBytes) {
        reject(new HttpError(502, "feed_too_large", `feed exceeded ${opts.maxBytes} bytes`));
        return;
      }
      if (!buf.subarray(0, 3).equals(JPEG_HEADER)) {
        reject(new HttpError(502, "not_jpeg", "websocket frame is not a JPEG"));
        return;
      }
      resolve(buf);
    };
  });
}
