import { EMAIL_COLORS, renderEmail } from "./layout.js";
import { companyName, type EmailContent } from "./shared.js";

const STEPS = [
  {
    title: "Add your first camera",
    text: "Connect a static image or stream and give it a clear name.",
  },
  {
    title: "Choose the schedule",
    text: "Pick how often Camera History should capture. Every plan keeps 12 months of history.",
  },
  {
    title: "Embed the widget",
    text: "Drop the archive into your website with an iframe or the WordPress block.",
  },
];

export function welcomeEmail(name: string, signInUrl: string): EmailContent {
  const company = companyName(name);
  const steps = STEPS.map(
    (step, index) => `
          <tr>
            <td width="34" valign="top" style="padding:0 10px 12px 0;">
              <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:999px;background-color:${EMAIL_COLORS.glacierWeak};color:${EMAIL_COLORS.glacierDeep};font-size:12px;font-weight:700;">${index + 1}</span>
            </td>
            <td valign="top" style="padding:0 0 12px;font-size:14px;line-height:1.55;color:${EMAIL_COLORS.muted};">
              <strong style="color:${EMAIL_COLORS.ink};">${step.title}</strong><br />
              ${step.text}
            </td>
          </tr>`,
  ).join("");

  return {
    subject: `Welcome to Camera History, ${company}`,
    text: [
      `Welcome to Camera History, ${company}.`,
      "",
      "Your email is verified and your workspace is ready.",
      "",
      "A good place to start:",
      ...STEPS.map((step, index) => `${index + 1}. ${step.title} — ${step.text}`),
      "",
      `Sign in: ${signInUrl}`,
      "",
      "If you need help, write to support@camera-history.com.",
      "",
      "Camera History",
    ].join("\n"),
    html: renderEmail({
      preheader: "Your workspace is ready. Add your first camera and start your archive.",
      chip: "Workspace ready",
      title: `Welcome, ${company}`,
      body: `
        <p style="margin:0 0 16px;">Your email is verified and your Camera History workspace is ready. A good place to start:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">${steps}
        </table>`,
      action: { label: "Open your workspace", url: signInUrl },
      footerNote: "You’re receiving this because your email was verified on Camera History.",
      tone: "pine",
    }),
  };
}
