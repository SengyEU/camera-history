import type { TimeFormat } from "./time";

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

export interface PublicCamera {
  id: string;
  name: string;
  theme: string;
  themeColors?: ThemeColors | null;
  retentionMonths?: number;
  showNight: boolean;
  timezone: string;
  timeFormat?: TimeFormat;
}

export interface ImageDto {
  id: string;
  timestamp: string;
  url: string;
  isDaylight: boolean;
}

export async function getCamera(cameraId: string): Promise<PublicCamera> {
  const res = await fetch(`/api/v1/cameras/${cameraId}`);
  if (!res.ok) throw new Error(`camera fetch failed: ${res.status}`);
  const body: { camera: PublicCamera } = await res.json();
  return body.camera;
}

export async function getImages(cameraId: string, date: string): Promise<ImageDto[]> {
  const res = await fetch(`/api/v1/cameras/${cameraId}/images?date=${date}`);
  if (!res.ok) throw new Error(`images fetch failed: ${res.status}`);
  const body: { images: ImageDto[] } = await res.json();
  return body.images;
}

export interface GroupCamera {
  id: string;
  name: string;
  theme: string;
  themeColors?: ThemeColors | null;
  retentionMonths?: number;
  showNight: boolean;
  timezone: string;
  timeFormat?: TimeFormat;
}

export interface PublicGroup {
  group: { id: string; name: string; slug: string };
  cameras: GroupCamera[];
}

export async function getGroup(tenant: string, slug: string): Promise<PublicGroup> {
  const res = await fetch(`/api/v1/groups/${tenant}/${slug}`);
  if (!res.ok) throw new Error(`group fetch failed: ${res.status}`);
  return (await res.json()) as PublicGroup;
}

export async function getCameraLatest(cameraId: string): Promise<string | null> {
  const res = await fetch(`/api/v1/cameras/${cameraId}/latest`);
  if (!res.ok) throw new Error(`latest fetch failed: ${res.status}`);
  const body = (await res.json()) as { date: string | null };
  return body.date;
}