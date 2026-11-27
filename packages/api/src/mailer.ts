import { createTransport } from "nodemailer";
import type { AppConfig } from "@ch/core";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Returns null when SMTP is not configured. The contact route turns that into
 * a clear 503 instead of pretending a message was sent.
 */
export function createSmtpMailer(cfg: AppConfig): Mailer | null {
  const { host, port, secure, user, pass, from } = cfg.mail;
  if (!host || !user || !pass) return null;

  const transport = createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return {
    async send(message) {
      await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
      });
    },
  };
}
