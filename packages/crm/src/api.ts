import type { Lead, LeadActivity, LeadPatch, LeadSummary } from "./types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const AUTH_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  "/api/v1/auth/refresh",
];

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const run = () => {
    const headers = new Headers(init.headers);
    if (init.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(url, { credentials: "include", ...init, headers });
  };

  let res = await run();
  if (res.status === 401 && !AUTH_PATHS.some((path) => url.startsWith(path))) {
    if (await refreshSession()) res = await run();
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // non-json error
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  me: () => request<{ email: string }>("/api/v1/internal/me"),
  login: (email: string, password: string) =>
    request<{ status: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    request<{ status: string }>("/api/v1/auth/logout", {
      method: "POST",
    }),
  listLeads: () =>
    request<{ leads: Lead[]; summary: LeadSummary }>("/api/v1/internal/leads"),
  getLead: (id: string) =>
    request<{ lead: Lead; activities: LeadActivity[] }>(
      `/api/v1/internal/leads/${encodeURIComponent(id)}`,
    ),
  createLead: (input: LeadPatch & { company: string; website: string }) =>
    request<{ lead: Lead }>("/api/v1/internal/leads", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateLead: (id: string, patch: LeadPatch) =>
    request<{ lead: Lead }>(`/api/v1/internal/leads/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  addActivity: (
    id: string,
    type: string,
    body: string,
    occurredAt?: string,
  ) =>
    request<{ activity: LeadActivity; lead: Lead }>(
      `/api/v1/internal/leads/${encodeURIComponent(id)}/activities`,
      {
        method: "POST",
        body: JSON.stringify({ type, body, occurredAt }),
      },
    ),
  importCsv: async (csv: string) => {
    let res = await fetch("/api/v1/internal/leads/import", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "text/plain" },
      body: csv,
    });
    if (res.status === 401 && (await refreshSession())) {
      res = await fetch("/api/v1/internal/leads/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "text/plain" },
        body: csv,
      });
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: string };
        if (typeof body.detail === "string") detail = body.detail;
      } catch {
        // ignore
      }
      throw new ApiError(detail, res.status);
    }
    return (await res.json()) as {
      created: number;
      updated: number;
      skipped: number;
      errors: Array<{ row: number; message: string }>;
    };
  },
  exportUrl: "/api/v1/internal/leads/export.csv",
};
