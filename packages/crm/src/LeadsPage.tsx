import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  domainInitials,
  followUpLabel,
  formatDate,
  hostLabel,
  isOverdue,
  packageLabel,
} from "./format";
import {
  LEAD_ARCHIVEABLE,
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  PIPELINE_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Lead,
  type LeadArchiveable,
  type LeadPatch,
  type LeadPriority,
  type LeadStatus,
  type LeadSummary,
} from "./types";

type View = "leads" | "pipeline" | "followups";

interface Props {
  leads: Lead[];
  summary: LeadSummary;
  view: View;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: LeadPatch) => Promise<void>;
}

const CLOSED = new Set<LeadStatus>(["won", "lost", "not_now"]);

type SortKey =
  | "company"
  | "country"
  | "cameraCount"
  | "packageCode"
  | "archiveable"
  | "status"
  | "priority"
  | "nextFollowUpAt"
  | "lastContactAt";

type SortState = { key: SortKey; dir: "asc" | "desc" };

const PRIORITY_ORDER: Record<LeadPriority, number> = { high: 0, medium: 1, low: 2 };
const STATUS_ORDER: Record<LeadStatus, number> = {
  new: 0,
  reviewed: 1,
  contacted: 2,
  replied: 3,
  demo: 4,
  pilot: 5,
  won: 6,
  lost: 7,
  not_now: 8,
};
const ARCHIVE_ORDER: Record<Lead["archiveable"], number> = { yes: 0, maybe: 1, no: 2 };
const PACKAGE_ORDER: Record<string, number> = {
  solo: 0,
  starter: 1,
  plus: 2,
  pro: 3,
  network: 4,
  custom: 5,
};

function sortValue(lead: Lead, key: SortKey): string | number | null {
  switch (key) {
    case "company":
      return lead.company;
    case "country":
      return lead.country || null;
    case "cameraCount":
      return lead.cameraCount;
    case "packageCode":
      return PACKAGE_ORDER[lead.packageCode] ?? 99;
    case "archiveable":
      return ARCHIVE_ORDER[lead.archiveable];
    case "status":
      return STATUS_ORDER[lead.status];
    case "priority":
      return PRIORITY_ORDER[lead.priority];
    case "nextFollowUpAt":
      return lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).getTime() : null;
    case "lastContactAt":
      return lead.lastContactAt ? new Date(lead.lastContactAt).getTime() : null;
  }
}

function SortHeader({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: SortKey;
  sort: SortState;
  onSort: (column: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === column;
  const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th className={className} aria-sort={ariaSort}>
      <button
        type="button"
        className={`th-sort${active ? " active" : ""}`}
        onClick={() => onSort(column)}
      >
        {label}
        <span className="sort-mark" aria-hidden="true">
          {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`summary-card${tone ? ` ${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function LeadsPage({
  leads,
  summary,
  view,
  loading,
  error,
  onSelect,
  onUpdate,
}: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | LeadStatus>("all");
  const [priority, setPriority] = useState<"all" | LeadPriority>("all");
  const [country, setCountry] = useState("all");
  const [segment, setSegment] = useState("all");
  const [archiveable, setArchiveable] = useState("all");
  const [dueOnly, setDueOnly] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "priority", dir: "asc" });

  useEffect(() => {
    if (view === "followups") setSort({ key: "nextFollowUpAt", dir: "asc" });
  }, [view]);

  const countries = useMemo(
    () => [...new Set(leads.map((lead) => lead.country).filter(Boolean))].sort(),
    [leads],
  );
  const segments = useMemo(
    () => [...new Set(leads.map((lead) => lead.segment).filter(Boolean))].sort(),
    [leads],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = leads.filter((lead) => {
      if (status !== "all" && lead.status !== status) return false;
      if (priority !== "all" && lead.priority !== priority) return false;
      if (country !== "all" && lead.country !== country) return false;
      if (segment !== "all" && lead.segment !== segment) return false;
      if (archiveable !== "all" && lead.archiveable !== archiveable) return false;
      if (
        (dueOnly || view === "followups") &&
        (!lead.nextFollowUpAt || CLOSED.has(lead.status))
      ) {
        return false;
      }
      if (!needle) return true;
      return [lead.company, lead.website, lead.email, lead.country, lead.segment, lead.notes]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    return rows;
  }, [leads, search, status, priority, country, segment, archiveable, dueOnly, view]);

  const sorted = useMemo(() => {
    const rows = filtered.slice();
    const direction = sort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * direction;
      }
      return String(left).localeCompare(String(right), undefined, { sensitivity: "base" }) * direction;
    });
    return rows;
  }, [filtered, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

  const change = async (id: string, patch: LeadPatch) => {
    setStatusError(null);
    try {
      await onUpdate(id, patch);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const drop = async (event: DragEvent, next: LeadStatus) => {
    event.preventDefault();
    const id = dragging;
    setDragging(null);
    setDragOver(null);
    if (!id) return;
    const lead = leads.find((item) => item.id === id);
    if (!lead || lead.status === next) return;
    await change(id, { status: next });
  };

  const dueCount = leads.filter(
    (lead) => lead.nextFollowUpAt && !CLOSED.has(lead.status),
  ).length;

  return (
    <div className="page">
      <div className="summary-row">
        <SummaryCard label="Total leads" value={summary.total} />
        <SummaryCard label="New" value={summary.byStatus.new} />
        <SummaryCard label="Contacted" value={summary.byStatus.contacted} tone="tone-amber" />
        <SummaryCard label="Replied" value={summary.byStatus.replied} tone="tone-pine" />
        <SummaryCard label="Pilots" value={summary.byStatus.pilot} tone="tone-pine" />
        <SummaryCard
          label="Due follow-ups"
          value={summary.dueFollowUps}
          tone={summary.dueFollowUps > 0 ? "tone-red" : undefined}
        />
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>
              {view === "pipeline" ? "Pipeline" : view === "followups" ? "Follow-ups" : "Leads"}
            </h2>
            <p className="subtle">
              {filtered.length} of {leads.length} leads
              {view === "followups" && dueCount > 0 ? ` · ${dueCount} scheduled` : ""}
            </p>
          </div>
          <div className="panel-actions">
            <label className="check-inline">
              <input
                type="checkbox"
                checked={dueOnly || view === "followups"}
                disabled={view === "followups"}
                onChange={(event) => setDueOnly(event.target.checked)}
              />
              Due only
            </label>
          </div>
        </div>

        <div className="filters">
          <input
            type="search"
            placeholder="Search company, email, notes…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search leads"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "all" | LeadStatus)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {LEAD_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as "all" | LeadPriority)}
            aria-label="Filter by priority"
          >
            <option value="all">All priorities</option>
            {LEAD_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
          <select value={country} onChange={(event) => setCountry(event.target.value)} aria-label="Filter by country">
            <option value="all">All countries</option>
            {countries.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select value={segment} onChange={(event) => setSegment(event.target.value)} aria-label="Filter by segment">
            <option value="all">All segments</option>
            {segments.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={archiveable}
            onChange={(event) => setArchiveable(event.target.value)}
            aria-label="Filter by archiveable"
          >
            <option value="all">Any feed</option>
            {LEAD_ARCHIVEABLE.map((value) => (
              <option key={value} value={value}>
                Archiveable: {value}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setSearch("");
              setStatus("all");
              setPriority("all");
              setCountry("all");
              setSegment("all");
              setArchiveable("all");
              setDueOnly(false);
            }}
          >
            Clear
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        {statusError && <p className="error">{statusError}</p>}
        {loading ? (
          <p className="loading">Loading leads…</p>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">No leads match these filters</p>
            <p>Clear the filters or import a CSV to start.</p>
          </div>
        ) : view === "pipeline" ? (
          <div className="pipeline" data-testid="pipeline">
            {PIPELINE_STATUSES.map((column) => {
              const cards = filtered.filter((lead) => lead.status === column);
              return (
                <section
                  key={column}
                  className={`pipeline-column${dragOver === column ? " is-over" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(column);
                  }}
                  onDragLeave={() => setDragOver((current) => (current === column ? null : current))}
                  onDrop={(event) => void drop(event, column)}
                  data-testid={`pipeline-${column}`}
                >
                  <header>
                    <span className={`status-dot status-${column}`} />
                    <span>{STATUS_LABELS[column]}</span>
                    <span className="pipeline-count">{cards.length}</span>
                  </header>
                  <div className="pipeline-cards">
                    {cards.map((lead) => (
                      <article
                        key={lead.id}
                        className={`pipeline-card priority-${lead.priority}`}
                        draggable
                        onDragStart={() => setDragging(lead.id)}
                        onDragEnd={() => {
                          setDragging(null);
                          setDragOver(null);
                        }}
                        onClick={() => onSelect(lead.id)}
                        data-testid={`pipeline-card-${lead.slug}`}
                      >
                        <strong>{lead.company}</strong>
                        <span className="pipeline-meta">
                          {lead.country || "—"} · {lead.cameraCount} cam
                          {lead.cameraCount === 1 ? "" : "s"}
                        </span>
                        <span className={`follow-up${isOverdue(lead.nextFollowUpAt) ? " overdue" : ""}`}>
                          {followUpLabel(lead.nextFollowUpAt)}
                        </span>
                      </article>
                    ))}
                    {cards.length === 0 && <p className="pipeline-empty">Drop a lead here</p>}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="leads-table">
              <thead>
                <tr>
                  <SortHeader label="Company" column="company" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Country" column="country" sort={sort} onSort={toggleSort} />
                  <SortHeader
                    label="Cams"
                    column="cameraCount"
                    sort={sort}
                    onSort={toggleSort}
                    className="num"
                  />
                  <SortHeader label="Package" column="packageCode" sort={sort} onSort={toggleSort} />
                  <SortHeader
                    label="Archiveable"
                    column="archiveable"
                    sort={sort}
                    onSort={toggleSort}
                  />
                  <SortHeader label="Status" column="status" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Priority" column="priority" sort={sort} onSort={toggleSort} />
                  <SortHeader
                    label="Next follow-up"
                    column="nextFollowUpAt"
                    sort={sort}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Last contact"
                    column="lastContactAt"
                    sort={sort}
                    onSort={toggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sorted.map((lead) => (
                  <tr
                    key={lead.id}
                    className={`lead-row${isOverdue(lead.nextFollowUpAt) ? " is-overdue" : ""}`}
                    onClick={() => onSelect(lead.id)}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onSelect(lead.id);
                    }}
                  >
                    <td>
                      <div className="company-cell">
                        <span className={`company-mark priority-${lead.priority}`}>
                          {domainInitials(lead.website)}
                        </span>
                        <span className="company-text">
                          <strong>{lead.company}</strong>
                          <span className="company-links">
                            <a
                              href={lead.website}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              title={`Open ${lead.website}`}
                            >
                              {hostLabel(lead.website)} ↗
                            </a>
                            {lead.liveCamUrl && lead.liveCamUrl !== lead.website && (
                              <a
                                href={lead.liveCamUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                title="Open the live camera page"
                              >
                                Live cam ↗
                              </a>
                            )}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>{lead.country || "—"}</td>
                    <td className="num">{lead.cameraCount}</td>
                    <td>{packageLabel(lead.packageCode)}</td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div
                        className="archive-cell"
                        title={lead.archiveReason || "No archive note yet"}
                      >
                        <select
                          className={`inline-select archive-select archive-${lead.archiveable}`}
                          value={lead.archiveable}
                          onChange={(event) =>
                            void change(lead.id, {
                              archiveable: event.target.value as LeadArchiveable,
                            })
                          }
                          aria-label={`Archiveable status for ${lead.company}`}
                          data-testid={`archive-${lead.slug}`}
                        >
                          <option value="yes">Yes</option>
                          <option value="maybe">Maybe</option>
                          <option value="no">No</option>
                        </select>
                        <small>{lead.feedType}</small>
                      </div>
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <select
                        className={`inline-select status-select status-${lead.status}`}
                        value={lead.status}
                        onChange={(event) =>
                          void change(lead.id, { status: event.target.value as LeadStatus })
                        }
                        aria-label={`Status for ${lead.company}`}
                      >
                        {LEAD_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {STATUS_LABELS[value]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`priority-badge priority-${lead.priority}`}>
                        {PRIORITY_LABELS[lead.priority]}
                      </span>
                    </td>
                    <td>
                      <span className={`follow-up${isOverdue(lead.nextFollowUpAt) ? " overdue" : ""}`}>
                        {followUpLabel(lead.nextFollowUpAt)}
                      </span>
                    </td>
                    <td className="muted-cell">{formatDate(lead.lastContactAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
