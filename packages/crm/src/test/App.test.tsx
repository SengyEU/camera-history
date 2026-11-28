import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { Lead } from "../types";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    slug: "vogel",
    company: "Vogel Ski Resort",
    website: "https://vogel.si/",
    country: "Slovenia",
    segment: "Ski resort",
    priority: "high",
    cameraCount: 5,
    cameraLocations: "Vogel",
    packageCode: "plus",
    wordpress: true,
    layout: "separate-pages",
    feedType: "static_url",
    feedUrl: "https://vogel.si/cam.jpg",
    archiveable: "yes",
    archiveReason: "Direct JPEG",
    contactName: "",
    email: "info@vogel.si",
    phone: "",
    language: "sl",
    status: "new",
    source: "WorldCam",
    sourceUrl: "https://worldcam.eu/vogel",
    liveCamUrl: "https://vogel.si/live",
    notes: "Five cameras",
    lastContactAt: null,
    nextFollowUpAt: null,
    proposalStatus: "none",
    pilotStartedAt: null,
    pilotEndsAt: null,
    feedback: "",
    caseStudyConsent: false,
    lostReason: "",
    tenantId: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

const summary = {
  total: 1,
  dueFollowUps: 0,
  withEmail: 1,
  byStatus: {
    new: 1,
    reviewed: 0,
    contacted: 0,
    replied: 0,
    demo: 0,
    pilot: 0,
    won: 0,
    lost: 0,
    not_now: 0,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CRM app", () => {
  it("shows the lead table for an allowed session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/internal/me")) return jsonResponse({ email: "marek@example.com" });
        if (url.endsWith("/api/v1/internal/leads")) {
          return jsonResponse({ leads: [lead()], summary });
        }
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    expect(await screen.findByText("Vogel Ski Resort")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /vogel\.si/ })).toHaveAttribute(
      "href",
      "https://vogel.si/",
    );
    expect(screen.getByRole("link", { name: /Live cam/ })).toHaveAttribute(
      "href",
      "https://vogel.si/live",
    );
    expect(screen.getByText("marek@example.com")).toBeInTheDocument();
  });

  it("shows a login form when the session is missing", async () => {
    let loggedIn = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/v1/internal/me")) {
          return loggedIn
            ? jsonResponse({ email: "marek@example.com" })
            : jsonResponse({ detail: "unauthorized" }, 401);
        }
        if (url.endsWith("/api/v1/auth/refresh")) return jsonResponse({ detail: "no" }, 401);
        if (url.endsWith("/api/v1/auth/login") && init?.method === "POST") {
          loggedIn = true;
          return jsonResponse({ status: "ok" });
        }
        if (url.endsWith("/api/v1/internal/leads")) {
          return jsonResponse({ leads: [lead()], summary });
        }
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Email"), "marek@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Password123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Vogel Ski Resort")).toBeInTheDocument();
  });

  it("shows no access when the account is not allowlisted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/internal/me")) return jsonResponse({ detail: "not found" }, 404);
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });

  it("changes a lead status from the table", async () => {
    const patches: Array<{ url: string; body: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/v1/internal/me")) return jsonResponse({ email: "marek@example.com" });
        if (url.endsWith("/api/v1/internal/leads")) {
          return jsonResponse({ leads: [lead()], summary });
        }
        if (url.includes("/api/v1/internal/leads/lead-1") && init?.method === "PATCH") {
          patches.push({ url, body: String(init.body) });
          return jsonResponse({ lead: lead({ status: "contacted" }) });
        }
        if (url.endsWith("/api/v1/internal/leads/lead-1")) {
          return jsonResponse({ lead: lead(), activities: [] });
        }
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    await screen.findByText("Vogel Ski Resort");
    const select = screen.getByLabelText("Status for Vogel Ski Resort");
    await userEvent.selectOptions(select, "contacted");
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(JSON.parse(patches[0]!.body)).toEqual({ status: "contacted" });
  });

  it("shows archiveable state and sorts the table by column", async () => {
    const marina = lead({
      id: "lead-2",
      slug: "marina",
      company: "Marina Punat",
      website: "https://marina-punat.hr/",
      country: "Croatia",
      cameraCount: 2,
      packageCode: "starter",
      priority: "medium",
      archiveable: "no",
      archiveReason: "iframe only",
      feedType: "ipcamlive",
      email: "",
    });
    const twoSummary = {
      ...summary,
      total: 2,
      withEmail: 1,
      byStatus: { ...summary.byStatus, new: 2 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/internal/me")) return jsonResponse({ email: "marek@example.com" });
        if (url.endsWith("/api/v1/internal/leads")) {
          return jsonResponse({ leads: [lead(), marina], summary: twoSummary });
        }
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    await screen.findByText("Vogel Ski Resort");
    expect(screen.getByTestId("archive-vogel")).toHaveValue("yes");
    expect(screen.getByTestId("archive-marina")).toHaveValue("no");

    const companyOrder = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent ?? "");

    expect(companyOrder()[0]).toContain("Vogel");
    await userEvent.click(screen.getByRole("button", { name: /Cams/ }));
    expect(companyOrder()[0]).toContain("Marina");
    await userEvent.click(screen.getByRole("button", { name: /Cams/ }));
    expect(companyOrder()[0]).toContain("Vogel");
  });

  it("changes archiveable state from the table", async () => {
    const patches: Array<{ body: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/v1/internal/me")) return jsonResponse({ email: "marek@example.com" });
        if (url.endsWith("/api/v1/internal/leads")) {
          return jsonResponse({ leads: [lead()], summary });
        }
        if (url.includes("/api/v1/internal/leads/lead-1") && init?.method === "PATCH") {
          patches.push({ body: String(init.body) });
          return jsonResponse({ lead: lead({ archiveable: "no" }) });
        }
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    await screen.findByText("Vogel Ski Resort");
    await userEvent.selectOptions(screen.getByTestId("archive-vogel"), "no");
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(JSON.parse(patches[0]!.body)).toEqual({ archiveable: "no" });
  });

  it("derives the package from the camera count in the detail", async () => {
    const patches: Array<{ body: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/v1/internal/me")) return jsonResponse({ email: "marek@example.com" });
        if (url.endsWith("/api/v1/internal/leads")) {
          return jsonResponse({ leads: [lead()], summary });
        }
        if (url.endsWith("/api/v1/internal/leads/lead-1") && init?.method === "PATCH") {
          patches.push({ body: String(init.body) });
          return jsonResponse({ lead: lead({ cameraCount: 6, packageCode: "pro" }) });
        }
        if (url.endsWith("/api/v1/internal/leads/lead-1")) {
          return jsonResponse({ lead: lead(), activities: [] });
        }
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    await userEvent.click(await screen.findByText("Vogel Ski Resort"));
    const cameras = await screen.findByLabelText("Cameras");
    expect(screen.getByLabelText("Package")).toHaveValue("Plus");
    fireEvent.change(cameras, { target: { value: "6" } });
    expect(screen.getByLabelText("Package")).toHaveValue("Pro");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(JSON.parse(patches[0]!.body).packageCode).toBe("pro");
  });

  it("opens the lead detail drawer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/internal/me")) return jsonResponse({ email: "marek@example.com" });
        if (url.endsWith("/api/v1/internal/leads")) {
          return jsonResponse({ leads: [lead()], summary });
        }
        if (url.endsWith("/api/v1/internal/leads/lead-1")) {
          return jsonResponse({
            lead: lead(),
            activities: [
              {
                id: "a1",
                leadId: "lead-1",
                type: "note",
                body: "Call next week",
                occurredAt: "2026-11-02T10:00:00.000Z",
                createdBy: "marek@example.com",
                createdAt: "2026-11-02T10:00:00.000Z",
              },
            ],
          });
        }
        return jsonResponse({ detail: "not found" }, 404);
      }),
    );

    render(<App />);
    await userEvent.click(await screen.findByText("Vogel Ski Resort"));
    expect(await screen.findByRole("heading", { name: "Vogel Ski Resort" })).toBeInTheDocument();
    expect(screen.getByText("Call next week")).toBeInTheDocument();
  });
});
