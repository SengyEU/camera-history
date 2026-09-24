export type FeedType = "static_url" | "mjpeg" | "hls" | "rtsp" | "custom";
export type UserRole = "owner" | "admin";
export type CameraStatus = "operational" | "delayed" | "offline";
export type BillingStatus = "none" | "active" | "past_due" | "unpaid" | "canceled";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  planMonths: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  billingStatus: BillingStatus;
  billingGraceUntil: Date | null;
}

export interface BillingPatch {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  billingStatus?: BillingStatus;
  billingGraceUntil?: Date | null;
  planMonths?: number;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export interface Camera {
  id: string;
  tenantId: string;
  name: string;
  feedType: FeedType;
  feedUrl: string;
  feedConfig: Record<string, unknown>;
  intervalMinutes: number;
  activeFrom: string;
  activeTo: string;
  timezone: string;
  enabled: boolean;
  theme: string;
  lastCaptureAt: Date | null;
  lastError: string | null;
  status: CameraStatus;
}

export interface ImageRecord {
  id: string;
  cameraId: string;
  timestamp: Date;
  storageKey: string;
  sizeBytes: number;
}

export interface PublicCamera {
  id: string;
  name: string;
  theme: string;
  retentionMonths: number;
}

export interface NewTenant {
  name: string;
  slug: string;
  planMonths?: number;
}

export interface NewUser {
  tenantId: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}

export interface NewCamera {
  name: string;
  feedType: FeedType;
  feedUrl: string;
  feedConfig?: Record<string, unknown>;
  intervalMinutes: number;
  activeFrom: string;
  activeTo: string;
  timezone: string;
  enabled?: boolean;
  theme?: string;
}

export interface CameraPatch {
  name?: string;
  feedType?: FeedType;
  feedUrl?: string;
  feedConfig?: Record<string, unknown>;
  intervalMinutes?: number;
  activeFrom?: string;
  activeTo?: string;
  timezone?: string;
  enabled?: boolean;
  theme?: string;
  lastCaptureAt?: Date | null;
  lastError?: string | null;
  status?: CameraStatus;
}

export interface NewImage {
  cameraId: string;
  timestamp: Date;
  storageKey: string;
  sizeBytes: number;
}