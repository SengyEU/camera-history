export interface EmbedContext {
  parentUrl: string;
  iframeId: string;
}

export interface ShareState {
  date: string;
  hour: number;
  cameraId: string | null;
}

const STATE_PARAMS = ["ch_target", "ch_date", "ch_hour", "ch_camera"] as const;
const IFRAME_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

function httpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function parseEmbedContext(data: unknown): EmbedContext | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const parentUrl = record.parentUrl;
  const iframeId = record.iframeId;
  if (typeof parentUrl !== "string" || typeof iframeId !== "string") return null;
  if (parentUrl.length > 4096 || !IFRAME_ID.test(iframeId)) return null;
  if (!httpUrl(parentUrl)) return null;
  return { parentUrl, iframeId };
}

export function buildShareUrl(
  currentUrl: string,
  context: EmbedContext | null,
  state: ShareState,
): string {
  const parent = context ? httpUrl(context.parentUrl) : null;
  if (context && parent) {
    parent.hash = "";
    for (const key of STATE_PARAMS) parent.searchParams.delete(key);
    parent.searchParams.set("ch_target", context.iframeId);
    parent.searchParams.set("ch_date", state.date);
    parent.searchParams.set("ch_hour", String(state.hour));
    if (state.cameraId) parent.searchParams.set("ch_camera", state.cameraId);
    parent.hash = context.iframeId;
    return parent.toString();
  }

  const widget = new URL(currentUrl);
  widget.hash = "";
  for (const key of STATE_PARAMS) widget.searchParams.delete(key);
  widget.searchParams.set("date", state.date);
  widget.searchParams.set("hour", String(state.hour));
  if (state.cameraId) widget.searchParams.set("camera", state.cameraId);
  else widget.searchParams.delete("camera");
  return widget.toString();
}
