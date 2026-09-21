import { HttpError, type AppConfig, type Camera } from "@ch/core";
import { fetchJpeg } from "./staticUrl.js";

export async function captureBuffer(cam: Camera, cfg: AppConfig): Promise<Buffer> {
  switch (cam.feedType) {
    case "static_url":
      return fetchJpeg(cam.feedUrl, { timeoutMs: cfg.feed.timeoutMs, maxBytes: cfg.feed.maxBytes });
    default:
      throw new HttpError(501, "not_implemented", `feed type "${cam.feedType}" is not implemented yet`);
  }
}