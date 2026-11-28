import { describe, expect, it } from "vitest";
import { csvEscape, parseCsv } from "../src/routes/internal.js";
import { makeApp } from "./helpers.js";

async function register(
  app: ReturnType<typeof makeApp>["app"],
  email: string,
  slug: string,
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "CRM Test", slug, email, password: "Password123" },
  });
  expect(res.statusCode).toBe(201);
  return res.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function internalApp() {
  const app = makeApp();
  const cookie = await register(app.app, "marek@example.com", "crm");
  return { ...app, cookie };
}

describe("internal CRM access", () => {
  it("allows configured emails and rejects everyone else with 404", async () => {
    const { app } = makeApp();
    const allowed = await register(app, "marek@example.com", "crm-allowed");
    const denied = await register(app, "owner@customer.example", "crm-denied");

    const ok = await app.inject({
      method: "GET",
      url: "/api/v1/internal/me",
      headers: { cookie: allowed },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ email: "marek@example.com" });

    const no = await app.inject({
      method: "GET",
      url: "/api/v1/internal/me",
      headers: { cookie: denied },
    });
    expect(no.statusCode).toBe(404);

    const anonymous = await app.inject({ method: "GET", url: "/api/v1/internal/me" });
    expect(anonymous.statusCode).toBe(401);
    await app.close();
  });

});

describe("internal leads", () => {
  it("creates a lead and lists it with a summary", async () => {
    const { app, cookie } = await internalApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/internal/leads",
      headers: { cookie },
      payload: {
        company: "Vogel Ski Resort",
        website: "https://vogel.si/",
        country: "Slovenia",
        segment: "Ski resort",
        priority: "high",
        cameraCount: 5,
        email: "info@vogel.si",
      },
    });
    expect(created.statusCode).toBe(201);
    const lead = created.json().lead;
    expect(lead).toMatchObject({
      company: "Vogel Ski Resort",
      slug: "vogel-ski-resort",
      packageCode: "plus",
      status: "new",
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/internal/leads",
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().leads).toHaveLength(1);
    expect(list.json().summary.total).toBe(1);
    expect(list.json().summary.byStatus.new).toBe(1);
    expect(list.json().summary.withEmail).toBe(1);
    await app.close();
  });

  it("logs an email, moves the lead to contacted and sets a follow-up", async () => {
    const { app, cookie } = await internalApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/internal/leads",
      headers: { cookie },
      payload: { company: "Marina Punat", website: "https://marina-punat.hr/" },
    });
    const id = created.json().lead.id as string;

    const activity = await app.inject({
      method: "POST",
      url: `/api/v1/internal/leads/${id}/activities`,
      headers: { cookie },
      payload: { type: "email_sent", body: "Sent the intro email." },
    });
    expect(activity.statusCode).toBe(201);
    expect(activity.json().lead.status).toBe("contacted");
    expect(activity.json().lead.lastContactAt).toBeTruthy();
    expect(activity.json().lead.nextFollowUpAt).toBeTruthy();
    expect(activity.json().activity.type).toBe("email_sent");

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/internal/leads/${id}`,
      headers: { cookie },
    });
    expect(detail.json().activities).toHaveLength(2);
    expect(
      detail
        .json()
        .activities.map((item: { type: string }) => item.type)
        .sort(),
    ).toEqual(["email_sent", "status_change"]);
    await app.close();
  });

  it("records a reply and clears the follow-up", async () => {
    const { app, cookie } = await internalApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/internal/leads",
      headers: { cookie },
      payload: { company: "Hotel Punta Scario", website: "https://hotelpuntascario.it/" },
    });
    const id = created.json().lead.id as string;
    await app.inject({
      method: "POST",
      url: `/api/v1/internal/leads/${id}/activities`,
      headers: { cookie },
      payload: { type: "email_sent" },
    });
    const reply = await app.inject({
      method: "POST",
      url: `/api/v1/internal/leads/${id}/activities`,
      headers: { cookie },
      payload: { type: "reply", body: "Interested, send details." },
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json().lead.status).toBe("replied");
    expect(reply.json().lead.nextFollowUpAt).toBeNull();
    await app.close();
  });

  it("imports CSV, preserves manual state and exports the same rows", async () => {
    const { app, cookie } = await internalApp();
    const csv = [
      "slug,company,website,country,segment,priority,camera_count,package,status,email,notes",
      'vogel,vogel.si,"https://vogel.si/",Slovenia,Ski resort,high,5,Plus,new,info@vogel.si,"Five cameras, one page."',
      "marina,Marina Punat,https://marina-punat.hr/,Croatia,Marina,medium,2,Starter,new,,",
    ].join("\n");
    const imported = await app.inject({
      method: "POST",
      url: "/api/v1/internal/leads/import",
      headers: { cookie, "content-type": "text/plain" },
      payload: csv,
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toMatchObject({ created: 2, updated: 0, skipped: 0 });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/internal/leads",
      headers: { cookie },
    });
    const vogel = list.json().leads.find((lead: { slug: string }) => lead.slug === "vogel");
    await app.inject({
      method: "PATCH",
      url: `/api/v1/internal/leads/${vogel.id}`,
      headers: { cookie },
      payload: { status: "contacted", notes: "Keep this note" },
    });

    const reimport = await app.inject({
      method: "POST",
      url: "/api/v1/internal/leads/import",
      headers: { cookie, "content-type": "text/plain" },
      payload: csv.replace("Five cameras, one page.", "Updated source text"),
    });
    expect(reimport.json()).toMatchObject({ created: 0, updated: 2, skipped: 0 });

    const after = await app.inject({
      method: "GET",
      url: `/api/v1/internal/leads/${vogel.id}`,
      headers: { cookie },
    });
    expect(after.json().lead.status).toBe("contacted");
    expect(after.json().lead.notes).toBe("Keep this note");

    const exported = await app.inject({
      method: "GET",
      url: "/api/v1/internal/leads/export.csv",
      headers: { cookie },
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-disposition"]).toContain("attachment");
    expect(exported.body).toContain("vogel.si");
    expect(exported.body).toContain("contacted");
    await app.close();
  });

  it("does not overwrite status, notes or contact dates during import", async () => {
    const { app, cookie } = await internalApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/internal/leads",
      headers: { cookie },
      payload: { company: "Keep Me", website: "https://keep.example/" },
    });
    const id = created.json().lead.id as string;
    await app.inject({
      method: "PATCH",
      url: `/api/v1/internal/leads/${id}`,
      headers: { cookie },
      payload: { status: "pilot", notes: "manual", pilotStartedAt: "2026-11-01T00:00:00.000Z" },
    });
    // patch status pilot also sets pilotEndsAt
    const csv =
      "slug,company,website,status,notes,last_contact\nkeep-me,Keep Me,https://keep.example/,new,imported,2026-01-01";
    await app.inject({
      method: "POST",
      url: "/api/v1/internal/leads/import",
      headers: { cookie, "content-type": "text/plain" },
      payload: csv,
    });
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/internal/leads/${id}`,
      headers: { cookie },
    });
    expect(detail.json().lead.status).toBe("pilot");
    expect(detail.json().lead.notes).toBe("manual");
    expect(detail.json().lead.lastContactAt).toBeNull();
    await app.close();
  });

  it("requires an allowed email for every internal route", async () => {
    const { app } = makeApp();
    const denied = await register(app, "owner@customer.example", "crm-denied-2");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/internal/leads",
      headers: { cookie: denied },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("CSV helpers", () => {
  it("parses quoted commas, escaped quotes and newlines", () => {
    const rows = parseCsv('a,b\n"one, two","say ""hi""\nnext"');
    expect(rows).toEqual([
      ["a", "b"],
      ["one, two", 'say "hi"\nnext'],
    ]);
  });

  it("escapes values for export", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape('a,b"c')).toBe('"a,b""c"');
  });
});
