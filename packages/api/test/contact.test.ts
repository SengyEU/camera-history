import { describe, expect, it } from "vitest";
import type { MailMessage, Mailer } from "../src/mailer.js";
import { makeApp } from "./helpers.js";

function makeMailer() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = {
    async send(message) {
      sent.push(message);
    },
  };
  return { mailer, sent };
}

const valid = {
  name: "Alpine Resort",
  email: "ops@example.com",
  topic: "A camera or setup",
  website: "https://example.com",
  cameras: "2-3",
  message: "We have two public cameras and want to archive them.",
  privacy: true,
};

describe("contact route", () => {
  it("sends a valid contact message to the configured inbox", async () => {
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ mailer });

    const res = await app.inject({ method: "POST", url: "/api/v1/contact", payload: valid });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: "ok" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "marek@camera-history.com",
      replyTo: "ops@example.com",
    });
    expect(sent[0]!.subject).toContain("Alpine Resort");
    expect(sent[0]!.text).toContain("We have two public cameras");
    expect(sent[0]!.html).toContain("New contact message");
    expect(sent[0]!.html).toContain("New inquiry");
    await app.close();
  });

  it("requires privacy consent", async () => {
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ mailer });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/contact",
      payload: { ...valid, privacy: false },
    });

    expect(res.statusCode).toBe(400);
    expect(sent).toHaveLength(0);
    await app.close();
  });

  it("rejects an invalid email", async () => {
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ mailer });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/contact",
      payload: { ...valid, email: "not-an-email" },
    });

    expect(res.statusCode).toBe(400);
    expect(sent).toHaveLength(0);
    await app.close();
  });

  it("accepts and drops a honeypot submission without sending", async () => {
    const { mailer, sent } = makeMailer();
    const { app } = makeApp({ mailer });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/contact",
      payload: { ...valid, botfield: "https://spam.example" },
    });

    expect(res.statusCode).toBe(202);
    expect(sent).toHaveLength(0);
    await app.close();
  });

  it("returns 503 when SMTP is not configured", async () => {
    const { app } = makeApp({ mailer: null });

    const res = await app.inject({ method: "POST", url: "/api/v1/contact", payload: valid });

    expect(res.statusCode).toBe(503);
    await app.close();
  });
});
