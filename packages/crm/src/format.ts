import {
  ACTIVITY_LABELS,
  PACKAGE_LABELS,
  STATUS_LABELS,
  type ActivityType,
  type Lead,
} from "./types";

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE.format(date);
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_TIME.format(date);
}

export function dateInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function dateInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T09:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((day - start) / 86_400_000);
}

export function followUpLabel(value: string | null): string {
  const days = daysUntil(value);
  if (days === null) return "—";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return formatDate(value);
}

export function isOverdue(value: string | null): boolean {
  const days = daysUntil(value);
  return days !== null && days < 0;
}

export function statusLabel(value: Lead["status"]): string {
  return STATUS_LABELS[value];
}

export function packageLabel(value: string): string {
  return PACKAGE_LABELS[value] ?? value;
}

export function activityLabel(value: ActivityType | "status_change"): string {
  return ACTIVITY_LABELS[value] ?? value;
}

export function hostLabel(value: string): string {
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return value;
  }
}

export function domainInitials(value: string): string {
  const host = hostLabel(value);
  const parts = host.split(".").filter(Boolean);
  const first = parts[0] ?? host;
  return first.slice(0, 2).toUpperCase();
}
