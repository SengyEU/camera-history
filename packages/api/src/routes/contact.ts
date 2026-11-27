import type { FastifyPluginAsync } from "fastify";
import { HttpError } from "@ch/core";
import type { AppDeps } from "../app.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX = {
  name: 100,
  email: 254,
  topic: 100,
  website: 300,
  cameras: 20,
  message: 5000,
};

type ContactBody = {
  name?: unknown;
  email?: unknown;
  topic?: unknown;
  website?: unknown;
  cameras?: unknown;
  message?: unknown;
  privacy?: unknown;
  botfield?: unknown;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const singleLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

export const registerContactRoutes: FastifyPluginAsync<AppDeps> = async (app, deps) => {
  app.post<{ Body: ContactBody }>(
    "/api/v1/contact",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const body = req.body ?? {};
      const name = text(body.name);
      const email = text(body.email).toLowerCase();
      const topic = text(body.topic) || "Something else";
      const website = text(body.website);
      const cameras = text(body.cameras);
      const message = text(body.message);
      const privacy = body.privacy === true;

      // Honeypot: accepted without sending so bots do not learn the difference.
      if (text(body.botfield)) return reply.code(202).send({ status: "ok" });

      if (!name || name.length > MAX.name) {
        throw new HttpError(400, "bad_request", "Please enter your name.");
      }
      if (!EMAIL_RE.test(email) || email.length > MAX.email) {
        throw new HttpError(400, "bad_request", "Please enter a valid email address.");
      }
      if (topic.length > MAX.topic) {
        throw new HttpError(400, "bad_request", "Please choose a shorter topic.");
      }
      if (website.length > MAX.website) {
        throw new HttpError(400, "bad_request", "Please use a shorter website address.");
      }
      if (cameras.length > MAX.cameras) {
        throw new HttpError(400, "bad_request", "Please use a shorter camera range.");
      }
      if (!message || message.length > MAX.message) {
        throw new HttpError(400, "bad_request", "Please enter a message (up to 5000 characters).");
      }
      if (!privacy) {
        throw new HttpError(400, "bad_request", "Please agree to the privacy note.");
      }
      if (!deps.mailer) {
        throw new HttpError(503, "contact_unavailable", "Contact is not configured right now.");
      }

      const lines = [
        "New Camera History contact message",
        "",
        `Topic: ${topic}`,
        `Name: ${name}`,
        `Email: ${email}`,
        `Website: ${website || "—"}`,
        `Cameras: ${cameras || "—"}`,
        "",
        "Message:",
        message,
      ];

      try {
        await deps.mailer.send({
          to: deps.cfg.mail.contactTo,
          replyTo: email,
          subject: `Camera History contact — ${singleLine(topic)} — ${singleLine(name)}`,
          text: lines.join("\n"),
        });
      } catch (err) {
        req.log.error({ err }, "contact email failed");
        throw new HttpError(502, "contact_unavailable", "Message could not be sent. Please try again.");
      }

      return reply.code(202).send({ status: "ok" });
    },
  );
};
