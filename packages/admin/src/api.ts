export type FeedType = "static_url" | "mjpeg" | "hls" | "rtsp" | "custom";
export type CameraStatus = "operational" | "delayed" | "offline";

export interface ThemeColors {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  onAccent: string;
  pine: string;
  onPine: string;
}

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
  theme: string;
  themeColors: ThemeColors | null;
  latitude: number | null;
  longitude: number | null;
  daylightOnly: boolean;
  showNight: boolean;
  status: CameraStatus;
  lastCaptureAt: string | null;
  lastError: string | null;
  imageCount?: number;
  totalBytes?: number;
  firstCaptureAt?: string | null;
}

export interface CameraInput {
  name: string;
  feedType: FeedType;
  feedUrl: string;
  intervalMinutes: number;
  activeFrom: string;
  activeTo: string;
  timezone: string;
  theme: string;
  themeColors: ThemeColors | null;
  latitude: number | null;
  longitude: number | null;
  daylightOnly: boolean;
  showNight: boolean;
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

export interface AdminGroup {
  id: string;
  name: string;
  slug: string;
  cameraIds: string[];
}

export const FEED_LABELS: Record<FeedType, string> = {
  static_url: "Static image (HTTP)",
  mjpeg: "MJPEG stream",
  hls: "HLS (ffmpeg)",
  rtsp: "RTSP (ffmpeg)",
  custom: "Custom WebSocket",
};

export const FEED_TYPES = Object.keys(FEED_LABELS) as FeedType[];

export const INTERVALS = [5, 15, 30, 60];

export const THEME_LABELS: Record<string, string> = {
  light: "Light",
  dark: "Dark",
  forest: "Forest",
  midnight: "Midnight",
  custom: "Custom",
};

export const THEMES = Object.keys(THEME_LABELS);

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const AUTH_PATHS = ["/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/refresh", "/api/v1/auth/logout"];
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function json<T>(url: string, init: RequestInit = {}): Promise<T> {
  const request = () =>
    fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    });

  let res = await request();
  if (res.status === 401 && !AUTH_PATHS.some((path) => url.startsWith(path))) {
    if (await refreshSession()) res = await request();
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // non-json error body
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    json<{ status?: string }>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (input: { name: string; slug: string; email: string; password: string }) =>
    json<{ status: string; tenantId: string; billing?: { required: boolean; checkoutUrl?: string } }>(
      "/api/v1/auth/register",
      { method: "POST", body: JSON.stringify(input) },
    ),
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
  listGroups: () => json<{ groups: AdminGroup[] }>("/api/v1/admin/groups").then((r) => r.groups),
  createGroup: (input: { name: string; slug: string }) =>
    json<{ group: AdminGroup }>("/api/v1/admin/groups", { method: "POST", body: JSON.stringify(input) }).then((r) => r.group),
  updateGroup: (id: string, patch: { name?: string; slug?: string }) =>
    json<{ group: AdminGroup }>(`/api/v1/admin/groups/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).then((r) => r.group),
  deleteGroup: (id: string) => json<undefined>(`/api/v1/admin/groups/${id}`, { method: "DELETE" }),
  setGroupCameras: (id: string, cameraIds: string[]) =>
    json<undefined>(`/api/v1/admin/groups/${id}/cameras`, { method: "PUT", body: JSON.stringify({ cameraIds }) }),
  getTenant: () =>
    json<{ tenant: { id: string; name: string; slug: string } }>("/api/v1/admin/tenant").then((r) => r.tenant),
};