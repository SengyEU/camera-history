import { renderEmail } from "./layout.js";
import { companyName, escapeHtml, type EmailContent } from "./shared.js";

export function verificationEmail(name: string, link: string, ttlHours: number): EmailContent {
  const company = companyName(name);
  const safeCompany = escapeHtml(company);

  return {
    subject: "Confirm your email — Camera History",
    text: [
      `Hi ${company},`,
      "",
      "Confirm your email address to activate your Camera History workspace.",
      "",
      link,
      "",
      `This link expires in ${ttlHours} hours and can be used once.`,
      "If you did not create a Camera History account, you can ignore this email.",
      "",
      "Camera History",
      "support@camera-history.com",
    ].join("\n"),
    html: renderEmail({
      preheader: "One click to activate your Camera History workspace.",
      chip: "Verify email",
      title: "Confirm your email",
      body: `
        <p style="margin:0 0 14px;">Hi ${safeCompany},</p>
        <p style="margin:0;">Confirm your email address to activate your Camera History workspace. This keeps your account secure and lets us reach you about your workspace.</p>`,
      action: { label: "Verify email", url: link },
      note: `This link expires in ${ttlHours} hours and can be used once.`,
      footerNote: "If you didn’t create a Camera History account, you can ignore this email.",
      tone: "glacier",
    }),
  };
}
