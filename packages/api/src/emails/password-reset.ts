import { renderEmail } from "./layout.js";
import { companyName, escapeHtml, type EmailContent } from "./shared.js";

export function passwordResetEmail(
  name: string,
  link: string,
  ttlMinutes: number,
): EmailContent {
  const company = companyName(name);
  const safeCompany = escapeHtml(company);

  return {
    subject: "Reset your Camera History password",
    text: [
      `Hi ${company},`,
      "",
      "We received a request to reset the password for your Camera History account.",
      "",
      link,
      "",
      `This link expires in ${ttlMinutes} minutes and can be used once.`,
      "If you did not request this, you can ignore this email. Your password stays the same.",
      "",
      "Camera History",
      "support@camera-history.com",
    ].join("\n"),
    html: renderEmail({
      preheader: "Choose a new password. The link expires in one hour.",
      chip: "Reset password",
      title: "Choose a new password",
      body: `
        <p style="margin:0 0 14px;">Hi ${safeCompany},</p>
        <p style="margin:0;">We received a request to reset the password for your Camera History account. Use the button below to choose a new one.</p>`,
      action: { label: "Choose a new password", url: link },
      note: `This link expires in ${ttlMinutes} minutes and can be used once.`,
      footerNote:
        "If you didn’t request this, you can ignore this email. Your password stays the same.",
      tone: "amber",
    }),
  };
}
