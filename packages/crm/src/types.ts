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

export const ACTIVITY_TYPES = [
  "note",
  "email_sent",
  "reply",
  "call",
  "meeting",
  "proposal_sent",
  "pilot_started",
  "other",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

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
  packageCode: string;
  wordpress: boolean;
  layout: string;
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
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  proposalStatus: "none" | "drafted" | "sent";
  pilotStartedAt: string | null;
  pilotEndsAt: string | null;
  feedback: string;
  caseStudyConsent: boolean;
  lostReason: string;
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  type: ActivityType | "status_change";
  body: string;
  occurredAt: string;
  createdBy: string;
  createdAt: string;
}

export interface LeadSummary {
  total: number;
  dueFollowUps: number;
  withEmail: number;
  byStatus: Record<LeadStatus, number>;
}

export type LeadPatch = Partial<
  Pick<
    Lead,
    | "company"
    | "website"
    | "country"
    | "segment"
    | "priority"
    | "cameraCount"
    | "cameraLocations"
    | "packageCode"
    | "wordpress"
    | "layout"
    | "feedType"
    | "feedUrl"
    | "archiveable"
    | "archiveReason"
    | "contactName"
    | "email"
    | "phone"
    | "language"
    | "status"
    | "sourceUrl"
    | "liveCamUrl"
    | "notes"
    | "lastContactAt"
    | "nextFollowUpAt"
    | "proposalStatus"
    | "pilotStartedAt"
    | "pilotEndsAt"
    | "feedback"
    | "caseStudyConsent"
    | "lostReason"
  >
>;

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  contacted: "Contacted",
  replied: "Replied",
  demo: "Demo",
  pilot: "Pilot",
  won: "Won",
  lost: "Lost",
  not_now: "Not now",
};

export const PRIORITY_LABELS: Record<LeadPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const ACTIVITY_LABELS: Record<ActivityType | "status_change", string> = {
  note: "Note",
  email_sent: "Email sent",
  reply: "Reply",
  call: "Call",
  meeting: "Meeting",
  proposal_sent: "Proposal sent",
  pilot_started: "Pilot started",
  status_change: "Status change",
  other: "Other",
};

export const PACKAGE_LABELS: Record<string, string> = {
  solo: "Solo",
  starter: "Starter",
  plus: "Plus",
  pro: "Pro",
  network: "Network",
  custom: "Custom",
};

export const PIPELINE_STATUSES: LeadStatus[] = [
  "new",
  "reviewed",
  "contacted",
  "replied",
  "demo",
  "pilot",
];
