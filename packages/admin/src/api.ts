export type FeedType = "static_url" | "mjpeg" | "hls" | "rtsp" | "custom";
export type CameraStatus = "operational" | "delayed" | "offline";

export interface AdminCamera {
  id: string;
  name: string;
  feedType: FeedType;
  feedUrl: string;
  intervalMinutes: number;
  activeFrom: string;
  activeTo: string;
  timezone: string;
  enabled: boolean;
  status: CameraStatus;
  lastCaptureAt: string | null;
  lastError: string | null;
}

export interface CameraInput {
  name: string;
  feedType: FeedType;
  feedUrl: string;
  intervalMinutes: number;
  activeFrom: string;
  activeTo: string;
  timezone: string;
}

export interface PreviewDto {
  latest: { id: string; timestamp: string; url: string } | null;
}

export type BillingStatus = "none" | "active" | "past_due" | "unpaid" | "canceled";

export interface BillingTierDto {
  months: number;
  label: string;
  eurPerCamera: number;
  current: boolean;
}

export interface BillingDto {
  planMonths: number;
  price: number | null;
  billingStatus: BillingStatus;
  stripeCustomerId: string | null;
  graceUntil: string | null;
  cameraCount: number;
  usageBytes: number;
  storageBytes: number;
  billingEnabled: boolean;
  tiers: BillingTierDto[];
}

export const FEED_LABELS: Record<FeedType, string> = {
  static_url: "Statický obrázek (HTTP)",
  mjpeg: "MJPEG stream",
  hls: "HLS (ffmpeg)",
  rtsp: "RTSP (ffmpeg)",
  custom: "Custom WebSocket",
};

export const FEED_TYPES = Object.keys(FEED_LABELS) as FeedType[];

export const INTERVALS = [5, 15, 30, 60];

async function json<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // non-json error body
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    json<{ status?: string }>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => json<{ status?: string }>("/api/v1/auth/logout", { method: "POST" }),
  listCameras: () => json<{ cameras: AdminCamera[] }>("/api/v1/admin/cameras").then((r) => r.cameras),
  createCamera: (input: CameraInput) =>
    json<{ camera: AdminCamera }>("/api/v1/admin/cameras", { method: "POST", body: JSON.stringify(input) }).then((r) => r.camera),
  updateCamera: (id: string, patch: Partial<CameraInput> & { enabled?: boolean }) =>
    json<{ camera: AdminCamera }>(`/api/v1/admin/cameras/${id}`, { method: "PUT", body: JSON.stringify(patch) }).then(
      (r) => r.camera,
    ),
  deleteCamera: (id: string) => json<undefined>(`/api/v1/admin/cameras/${id}`, { method: "DELETE" }),
  preview: (id: string) => json<PreviewDto>(`/api/v1/admin/cameras/${id}/preview`),
  getBilling: () => json<BillingDto>("/api/v1/admin/billing"),
  billingCheckout: (planMonths: number) =>
    json<{ url?: string; status?: string }>("/api/v1/admin/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planMonths }),
    }),
  billingPortal: () => json<{ url: string }>("/api/v1/admin/billing/portal", { method: "POST" }),
};