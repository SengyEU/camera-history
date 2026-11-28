import { useEffect, useState } from "react";
import { api } from "./api";
import {
  activityLabel,
  dateInputToIso,
  dateInputValue,
  formatDateTime,
  hostLabel,
} from "./format";
import {
  ACTIVITY_LABELS,
  LEAD_ARCHIVEABLE,
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  PACKAGE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type ActivityType,
  type Lead,
  type LeadActivity,
  type LeadArchiveable,
  type LeadPatch,
  type LeadPriority,
  type LeadStatus,
} from "./types";

interface Props {
  leadId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

const ACTIVITY_OPTIONS: ActivityType[] = [
  "note",
  "email_sent",
  "reply",
  "call",
  "meeting",
  "proposal_sent",
  "other",
];

function formFromLead(lead: Lead): LeadPatch {
  return {
    company: lead.company,
    website: lead.website,
    country: lead.country,
    segment: lead.segment,
    priority: lead.priority,
    status: lead.status,
    cameraCount: lead.cameraCount,
    cameraLocations: lead.cameraLocations,
    packageCode: lead.packageCode,
    wordpress: lead.wordpress,
    layout: lead.layout,
    feedType: lead.feedType,
    feedUrl: lead.feedUrl,
    archiveable: lead.archiveable,
    archiveReason: lead.archiveReason,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    language: lead.language,
    liveCamUrl: lead.liveCamUrl,
    notes: lead.notes,
    nextFollowUpAt: lead.nextFollowUpAt,
    proposalStatus: lead.proposalStatus,
    pilotStartedAt: lead.pilotStartedAt,
    pilotEndsAt: lead.pilotEndsAt,
    feedback: lead.feedback,
    caseStudyConsent: lead.caseStudyConsent,
    lostReason: lead.lostReason,
  };
}

export function LeadDetail({ leadId, onClose, onChanged }: Props) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [form, setForm] = useState<LeadPatch>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>("note");
  const [activityBody, setActivityBody] = useState("");
  const [activitySaving, setActivitySaving] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getLead(leadId)
      .then((data) => {
        if (!active) return;
        setLead(data.lead);
        setActivities(data.activities);
        setForm(formFromLead(data.lead));
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load lead");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [leadId]);

  const save = async () => {
    if (!lead) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await api.updateLead(lead.id, form);
      setLead(result.lead);
      setForm(formFromLead(result.lead));
      setSaved(true);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const logActivity = async () => {
    if (!lead || activitySaving) return;
    setActivitySaving(true);
    setError(null);
    try {
      const result = await api.addActivity(lead.id, activityType, activityBody);
      setLead(result.lead);
      setForm((current) => ({
        ...current,
        status: result.lead.status,
        lastContactAt: result.lead.lastContactAt,
        nextFollowUpAt: result.lead.nextFollowUpAt,
        pilotStartedAt: result.lead.pilotStartedAt,
        pilotEndsAt: result.lead.pilotEndsAt,
      }));
      const detail = await api.getLead(lead.id);
      setActivities(detail.activities);
      setActivityBody("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activity failed");
    } finally {
      setActivitySaving(false);
    }
  };

  const copyEmail = async () => {
    if (!lead?.email) return;
    try {
      await navigator.clipboard.writeText(lead.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy failed");
    }
  };

  const pilotSection =
    lead &&
    (lead.status === "pilot" ||
      lead.status === "won" ||
      lead.status === "lost" ||
      Boolean(lead.pilotStartedAt));

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="drawer"
        onClick={(event) => event.stopPropagation()}
        aria-label={lead ? `Lead ${lead.company}` : "Lead detail"}
      >
        <header className="drawer-head">
          <div>
            <span className="eyebrow">Lead</span>
            <h2>{lead?.company ?? "Loading…"}</h2>
            {lead && (
              <div className="drawer-sub">
                <span className={`status-pill status-${lead.status}`}>
                  {STATUS_LABELS[lead.status]}
                </span>
                <span className={`priority-badge priority-${lead.priority}`}>
                  {PRIORITY_LABELS[lead.priority]}
                </span>
                <span className="muted">{lead.country || "—"}</span>
              </div>
            )}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close lead">
            ×
          </button>
        </header>

        {loading ? (
          <p className="loading">Loading…</p>
        ) : !lead ? (
          <p className="error">{error ?? "Lead not found"}</p>
        ) : (
          <div className="drawer-body">
            <div className="lead-links">
              <a href={lead.website} target="_blank" rel="noreferrer">
                {hostLabel(lead.website)} ↗
              </a>
              {lead.liveCamUrl && (
                <a href={lead.liveCamUrl} target="_blank" rel="noreferrer">
                  Live cam ↗
                </a>
              )}
              {lead.sourceUrl && (
                <a href={lead.sourceUrl} target="_blank" rel="noreferrer">
                  Source ↗
                </a>
              )}
              {lead.email && (
                <button type="button" className="secondary small" onClick={() => void copyEmail()}>
                  {copied ? "Copied" : "Copy email"}
                </button>
              )}
            </div>

            {error && <p className="error">{error}</p>}

            <section className="form-section">
              <h3>Contact & site</h3>
              <div className="form-grid">
                <label>
                  Company
                  <input
                    value={form.company ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
                  />
                </label>
                <label>
                  Website
                  <input
                    value={form.website ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
                  />
                </label>
                <label>
                  Contact name
                  <input
                    value={form.contactName ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={form.email ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={form.phone ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  />
                </label>
                <label>
                  Language
                  <input
                    value={form.language ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}
                    placeholder="en, de, fr…"
                  />
                </label>
                <label>
                  Country
                  <input
                    value={form.country ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
                  />
                </label>
                <label>
                  Segment
                  <input
                    value={form.segment ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, segment: event.target.value }))}
                  />
                </label>
                <label className="span-2">
                  Live cam URL
                  <input
                    value={form.liveCamUrl ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, liveCamUrl: event.target.value }))}
                  />
                </label>
              </div>
            </section>

            <section className="form-section">
              <h3>Pipeline</h3>
              <div className="form-grid">
                <label>
                  Status
                  <select
                    value={form.status ?? lead.status}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, status: event.target.value as LeadStatus }))
                    }
                  >
                    {LEAD_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    value={form.priority ?? lead.priority}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, priority: event.target.value as LeadPriority }))
                    }
                  >
                    {LEAD_PRIORITIES.map((value) => (
                      <option key={value} value={value}>
                        {PRIORITY_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Next follow-up
                  <input
                    type="date"
                    value={dateInputValue(form.nextFollowUpAt ?? lead.nextFollowUpAt)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        nextFollowUpAt: dateInputToIso(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Proposal
                  <select
                    value={form.proposalStatus ?? lead.proposalStatus}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        proposalStatus: event.target.value as Lead["proposalStatus"],
                      }))
                    }
                  >
                    <option value="none">Not sent</option>
                    <option value="drafted">Drafted</option>
                    <option value="sent">Sent</option>
                  </select>
                </label>
              </div>
              <p className="field-hint">
                Last contact: {formatDateTime(lead.lastContactAt)}. Logging an email or reply updates
                this automatically.
              </p>
            </section>

            <section className="form-section">
              <h3>Setup</h3>
              <div className="form-grid">
                <label>
                  Cameras
                  <input
                    type="number"
                    min={1}
                    value={form.cameraCount ?? lead.cameraCount}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cameraCount: Math.max(1, Number(event.target.value) || 1),
                      }))
                    }
                  />
                </label>
                <label>
                  Package
                  <select
                    value={form.packageCode ?? lead.packageCode}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, packageCode: event.target.value }))
                    }
                  >
                    {Object.entries(PACKAGE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Feed type
                  <input
                    value={form.feedType ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, feedType: event.target.value }))}
                  />
                </label>
                <label>
                  Archiveable
                  <select
                    value={form.archiveable ?? lead.archiveable}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        archiveable: event.target.value as LeadArchiveable,
                      }))
                    }
                  >
                    {LEAD_ARCHIVEABLE.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="span-2">
                  Feed URL
                  <input
                    value={form.feedUrl ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, feedUrl: event.target.value }))}
                  />
                </label>
                <label className="span-2">
                  Camera locations
                  <input
                    value={form.cameraLocations ?? ""}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, cameraLocations: event.target.value }))
                    }
                  />
                </label>
                <label className="span-2">
                  Archive note
                  <input
                    value={form.archiveReason ?? ""}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, archiveReason: event.target.value }))
                    }
                  />
                </label>
              </div>
            </section>

            <section className="form-section">
              <h3>Notes</h3>
              <textarea
                rows={5}
                value={form.notes ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="What did you learn, what to say next…"
              />
            </section>

            {pilotSection && (
              <section className="form-section">
                <h3>Pilot & feedback</h3>
                <div className="form-grid">
                  <label>
                    Pilot started
                    <input
                      type="date"
                      value={dateInputValue(form.pilotStartedAt ?? lead.pilotStartedAt)}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          pilotStartedAt: dateInputToIso(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Pilot ends
                    <input
                      type="date"
                      value={dateInputValue(form.pilotEndsAt ?? lead.pilotEndsAt)}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          pilotEndsAt: dateInputToIso(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="span-2">
                    Feedback
                    <textarea
                      rows={3}
                      value={form.feedback ?? ""}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, feedback: event.target.value }))
                      }
                    />
                  </label>
                  <label className="span-2">
                    Lost / not now reason
                    <input
                      value={form.lostReason ?? ""}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, lostReason: event.target.value }))
                      }
                    />
                  </label>
                  <label className="check-row span-2">
                    <input
                      type="checkbox"
                      checked={Boolean(form.caseStudyConsent ?? lead.caseStudyConsent)}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          caseStudyConsent: event.target.checked,
                        }))
                      }
                    />
                    Permission to feature this customer in “Who is using Camera History?”
                  </label>
                </div>
              </section>
            )}

            <div className="save-row">
              <button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saved && <span className="saved-note">Saved</span>}
            </div>

            <section className="form-section">
              <h3>Activity</h3>
              <div className="activity-composer">
                <select
                  value={activityType}
                  onChange={(event) => setActivityType(event.target.value as ActivityType)}
                  aria-label="Activity type"
                >
                  {ACTIVITY_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {ACTIVITY_LABELS[value]}
                    </option>
                  ))}
                </select>
                <textarea
                  rows={2}
                  value={activityBody}
                  onChange={(event) => setActivityBody(event.target.value)}
                  placeholder="Optional note or reply text…"
                />
                <button
                  type="button"
                  onClick={() => void logActivity()}
                  disabled={activitySaving}
                >
                  {activitySaving ? "Logging…" : "Log activity"}
                </button>
              </div>
              {activities.length === 0 ? (
                <p className="empty">No activity yet.</p>
              ) : (
                <ol className="activity-list">
                  {activities.map((activity) => (
                    <li key={activity.id} className={`activity activity-${activity.type}`}>
                      <div className="activity-head">
                        <strong>{activityLabel(activity.type)}</strong>
                        <time>{formatDateTime(activity.occurredAt)}</time>
                      </div>
                      {activity.body && <p>{activity.body}</p>}
                      {activity.createdBy && <small>{activity.createdBy}</small>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
