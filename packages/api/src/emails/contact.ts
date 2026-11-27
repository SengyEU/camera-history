import { EMAIL_COLORS, renderEmail } from "./layout.js";
import { escapeHtml, singleLine, type EmailContent } from "./shared.js";

export interface ContactEmailInput {
  name: string;
  email: string;
  topic: string;
  website: string;
  cameras: string;
  message: string;
}

function websiteHtml(value: string): string {
  if (!value) return "—";
  const text = escapeHtml(value);
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener" style="color:${EMAIL_COLORS.glacierDeep};text-decoration:underline;">${text}</a>`;
    }
  } catch {
    // Not a URL; show the text as entered.
  }
  return text;
}

function fieldRow(label: string, valueHtml: string): string {
  return `
          <tr>
            <td width="104" valign="top" style="padding:10px 12px;background-color:${EMAIL_COLORS.snow};border-bottom:1px solid ${EMAIL_COLORS.line};font-size:11px;line-height:1.4;text-transform:uppercase;letter-spacing:0.9px;color:${EMAIL_COLORS.slate500};">${label}</td>
            <td valign="top" style="padding:10px 14px;border-bottom:1px solid ${EMAIL_COLORS.line};font-size:14px;line-height:1.5;color:${EMAIL_COLORS.ink};">${valueHtml}</td>
          </tr>`;
}

export function contactEmail(input: ContactEmailInput): EmailContent {
  const subject = `New Camera History inquiry — ${singleLine(input.topic)} — ${singleLine(input.name)}`;
  const safeName = escapeHtml(input.name);
  const safeEmail = escapeHtml(input.email);
  const safeTopic = escapeHtml(input.topic);
  const messageHtml = escapeHtml(input.message).replace(/\r?\n/g, "<br />");
  const replyAddress = `mailto:${encodeURIComponent(input.email)}?subject=${encodeURIComponent(
    `Re: Camera History — ${singleLine(input.topic)}`,
  )}`;

  return {
    subject,
    text: [
      "New Camera History contact message",
      "",
      `Topic: ${input.topic}`,
      `Name: ${input.name}`,
      `Email: ${input.email}`,
      `Website: ${input.website || "—"}`,
      `Cameras: ${input.cameras || "—"}`,
      "",
      "Message:",
      input.message,
    ].join("\n"),
    html: renderEmail({
      preheader: `${input.name} — ${input.topic}`,
      chip: "New inquiry",
      title: "New contact message",
      body: `
        <p style="margin:0 0 18px;">A new inquiry arrived from the form on camera-history.com. Reply directly to this email to reach ${safeName}.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border:1px solid ${EMAIL_COLORS.line};border-radius:10px;overflow:hidden;">
          ${fieldRow("Topic", safeTopic)}
          ${fieldRow("Name", safeName)}
          ${fieldRow("Email", `<a href="mailto:${safeEmail}" style="color:${EMAIL_COLORS.glacierDeep};text-decoration:underline;">${safeEmail}</a>`)}
          ${fieldRow("Website", websiteHtml(input.website))}
          ${fieldRow("Cameras", escapeHtml(input.cameras || "—"))}
        </table>
        <div style="margin:0 0 6px;font-size:11px;line-height:1.4;text-transform:uppercase;letter-spacing:0.9px;color:${EMAIL_COLORS.slate500};">Message</div>
        <div style="padding:14px 16px;background-color:${EMAIL_COLORS.snow};border:1px solid ${EMAIL_COLORS.line};border-radius:10px;font-size:14px;line-height:1.6;color:${EMAIL_COLORS.ink};">${messageHtml}</div>`,
      action: { label: `Reply to ${singleLine(input.name)}`, url: replyAddress },
      footerNote: "Sent from the contact form on camera-history.com.",
      tone: "amber",
    }),
  };
}
