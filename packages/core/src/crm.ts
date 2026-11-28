import type { PackageCode } from "./billing.js";

export const LEAD_STATUSES = [
  "new",
  "reviewed",
  "contacted",
  "replied",
  "demo",
  "pilot",
  "won",
  "lost",
  "not_now",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_PRIORITIES = ["high", "medium", "low"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const LEAD_ARCHIVEABLE = ["yes", "maybe", "no"] as const;
export type LeadArchiveable = (typeof LEAD_ARCHIVEABLE)[number];

export const LEAD_ACTIVITY_TYPES = [
  "note",
  "email_sent",
  "reply",
  "call",
  "meeting",
  "proposal_sent",
  "status_change",
  "pilot_started",
  "other",
] as const;

export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

export const LEAD_PROPOSAL_STATUSES = ["none", "drafted", "sent"] as const;
export type LeadProposalStatus = (typeof LEAD_PROPOSAL_STATUSES)[number];

export interface Lead {
  id: string;
  slug: string;
  company: string;
  website: string;
  country: string;
  segment: string;
  priority: LeadPriority;
  cameraCount: number;
  cameraLocations: string;
  packageCode: PackageCode | "custom";
  wordpress: boolean;
  layout: "separate-pages" | "one-page" | string;
  feedType: string;
  feedUrl: string;
  archiveable: LeadArchiveable;
  archiveReason: string;
  contactName: string;
  email: string;
  phone: string;
  language: string;
  status: LeadStatus;
  source: string;
  sourceUrl: string;
  liveCamUrl: string;
  notes: string;
  lastContactAt: Date | null;
  nextFollowUpAt: Date | null;
  proposalStatus: LeadProposalStatus;
  pilotStartedAt: Date | null;
  pilotEndsAt: Date | null;
  feedback: string;
  caseStudyConsent: boolean;
  lostReason: string;
  tenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewLead {
  slug: string;
  company: string;
  website: string;
  country?: string;
  segment?: string;
  priority?: LeadPriority;
  cameraCount?: number;
  cameraLocations?: string;
  packageCode?: PackageCode | "custom";
  wordpress?: boolean;
  layout?: string;
  feedType?: string;
  feedUrl?: string;
  archiveable?: LeadArchiveable;
  archiveReason?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  language?: string;
  status?: LeadStatus;
  source?: string;
  sourceUrl?: string;
  liveCamUrl?: string;
  notes?: string;
  lastContactAt?: Date | null;
  nextFollowUpAt?: Date | null;
  proposalStatus?: LeadProposalStatus;
  pilotStartedAt?: Date | null;
  pilotEndsAt?: Date | null;
  feedback?: string;
  caseStudyConsent?: boolean;
  lostReason?: string;
  tenantId?: string | null;
}

export type LeadPatch = Partial<Omit<NewLead, "slug">> & { slug?: string };

export interface LeadActivity {
  id: string;
  leadId: string;
  type: LeadActivityType;
  body: string;
  occurredAt: Date;
  createdBy: string;
  createdAt: Date;
}

export interface NewLeadActivity {
  leadId: string;
  type: LeadActivityType;
  body?: string;
  occurredAt?: Date;
  createdBy?: string;
}

export interface LeadSummary {
  total: number;
  dueFollowUps: number;
  withEmail: number;
  byStatus: Record<LeadStatus, number>;
}

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export function isLeadPriority(value: string): value is LeadPriority {
  return (LEAD_PRIORITIES as readonly string[]).includes(value);
}

export function isLeadArchiveable(value: string): value is LeadArchiveable {
  return (LEAD_ARCHIVEABLE as readonly string[]).includes(value);
}

export function isLeadActivityType(value: string): value is LeadActivityType {
  return (LEAD_ACTIVITY_TYPES as readonly string[]).includes(value);
}

export function isLeadProposalStatus(value: string): value is LeadProposalStatus {
  return (LEAD_PROPOSAL_STATUSES as readonly string[]).includes(value);
}

/** Package used in the outreach email for a given camera count. */
export function leadPackageForCameraCount(count: number): PackageCode | "custom" {
  if (count <= 1) return "solo";
  if (count <= 3) return "starter";
  if (count <= 5) return "plus";
  if (count <= 10) return "pro";
  if (count <= 25) return "network";
  return "custom";
}

export function isClosedLeadStatus(status: LeadStatus): boolean {
  return status === "won" || status === "lost" || status === "not_now";
}
