import { escapeHtml } from "./shared.js";

/**
 * Literal values mirror packages/design/tokens.css. Email clients do not
 * support CSS variables or external stylesheets reliably, so the palette and
 * font stack have to be inlined.
 */
export const EMAIL_COLORS = {
  snow: "#f7f9fb",
  surface: "#ffffff",
  ink: "#101828",
  muted: "#5b6b7c",
  line: "#e3e9ef",
  glacier: "#0e7490",
  glacierDeep: "#0b5f76",
  glacierWeak: "#e0f2fe",
  pine: "#15803d",
  pineWeak: "#dcfce7",
  amber: "#b45309",
  amberWeak: "#fef3c7",
  slate400: "#94a3b8",
  slate500: "#64748b",
  white: "#ffffff",
} as const;
const COLORS = EMAIL_COLORS;

const FONT =
  "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

type Tone = "glacier" | "pine" | "amber";

const TONES: Record<
  Tone,
  { bar: string; chipBg: string; chipText: string; noteBg: string; noteBorder: string; noteText: string }
> = {
  glacier: {
    bar: COLORS.glacier,
    chipBg: COLORS.glacierWeak,
    chipText: COLORS.glacierDeep,
    noteBg: COLORS.glacierWeak,
    noteBorder: COLORS.glacier,
    noteText: COLORS.glacierDeep,
  },
  pine: {
    bar: COLORS.pine,
    chipBg: COLORS.pineWeak,
    chipText: COLORS.pine,
    noteBg: COLORS.pineWeak,
    noteBorder: COLORS.pine,
    noteText: COLORS.pine,
  },
  amber: {
    bar: COLORS.amber,
    chipBg: COLORS.amberWeak,
    chipText: COLORS.amber,
    noteBg: COLORS.amberWeak,
    noteBorder: COLORS.amber,
    noteText: COLORS.amber,
  },
};

export interface LayoutInput {
  preheader: string;
  chip: string;
  title: string;
  /** Trusted HTML assembled by a template; escape every dynamic value first. */
  body: string;
  action?: { label: string; url: string };
  note?: string;
  footerNote?: string;
  tone?: Tone;
}

export function renderEmail(input: LayoutInput): string {
  const tone = TONES[input.tone ?? "glacier"];
  const action =
    input.action && input.action.url.startsWith("mailto:")
      ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 22px;">
                <tr>
                  <td align="center" bgcolor="${COLORS.glacier}" style="border-radius:10px;">
                    <a href="${escapeHtml(input.action.url)}" target="_blank" rel="noopener" style="display:block;padding:14px 24px;font-family:${FONT};font-size:15px;line-height:1.2;font-weight:700;color:${COLORS.white};text-decoration:none;border-radius:10px;">${escapeHtml(input.action.label)}</a>
                  </td>
                </tr>
              </table>`
      : input.action
        ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 14px;">
                <tr>
                  <td align="center" bgcolor="${COLORS.glacier}" style="border-radius:10px;">
                    <a href="${escapeHtml(input.action.url)}" target="_blank" rel="noopener" style="display:block;padding:14px 24px;font-family:${FONT};font-size:15px;line-height:1.2;font-weight:700;color:${COLORS.white};text-decoration:none;border-radius:10px;">${escapeHtml(input.action.label)}</a>
                  </td>
                </tr>
              </table>
              <div style="margin:0 0 22px;font-family:${FONT};font-size:12px;line-height:1.65;color:${COLORS.slate500};">
                Button not working? Copy this link into your browser:<br />
                <a href="${escapeHtml(input.action.url)}" target="_blank" rel="noopener" style="color:${COLORS.glacierDeep};text-decoration:underline;word-break:break-all;">${escapeHtml(input.action.url)}</a>
              </div>`
        : "";

  const note = input.note
    ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;">
                <tr>
                  <td style="padding:12px 14px;background-color:${tone.noteBg};border-left:3px solid ${tone.noteBorder};border-radius:8px;font-family:${FONT};font-size:13px;line-height:1.55;color:${tone.noteText};">${escapeHtml(input.note)}</td>
                </tr>
              </table>`
    : "";

  const footerNote = input.footerNote
    ? `<div style="margin-top:10px;color:${COLORS.slate500};">${escapeHtml(input.footerNote)}</div>`
    : "";

  const filler = "&#847;&zwnj;&nbsp;".repeat(24);

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(input.title)}</title>
    <!--[if mso]>
    <style>
      td, h1, a, p, div { font-family: Arial, Helvetica, sans-serif !important; }
    </style>
    <![endif]-->
    <style>
      @media screen and (max-width: 620px) {
        .email-outer { padding: 20px 10px !important; }
        .email-card { width: 100% !important; }
        .email-pad { padding-left: 22px !important; padding-right: 22px !important; }
        .email-title { font-size: 23px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${COLORS.snow};-webkit-text-size-adjust:100%;">
    <div style="display:none;font-size:1px;color:${COLORS.snow};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(input.preheader)}${filler}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.snow}" style="background-color:${COLORS.snow};">
      <tr>
        <td align="center" class="email-outer" style="padding:40px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" class="email-card" style="width:100%;max-width:560px;background-color:${COLORS.surface};border:1px solid ${COLORS.line};border-radius:18px;overflow:hidden;">
            <tr>
              <td height="4" bgcolor="${tone.bar}" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td class="email-pad" style="padding:34px 36px 30px;">
                <div style="font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:-0.2px;color:${COLORS.ink};">Camera <span style="color:${COLORS.slate400};font-weight:500;">History</span></div>
                <div style="margin-top:22px;">
                  <span style="display:inline-block;padding:5px 10px;border-radius:999px;background-color:${tone.chipBg};color:${tone.chipText};font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">${escapeHtml(input.chip)}</span>
                </div>
                <h1 class="email-title" style="margin:14px 0 10px;font-family:${FONT};font-size:26px;line-height:1.25;letter-spacing:-0.5px;font-weight:700;color:${COLORS.ink};">${escapeHtml(input.title)}</h1>
                <div style="font-family:${FONT};font-size:15px;line-height:1.65;color:${COLORS.muted};">${input.body}</div>
                ${action}
                ${note}
              </td>
            </tr>
            <tr>
              <td class="email-pad" style="padding:0 36px 30px;">
                <div style="border-top:1px solid ${COLORS.line};padding-top:18px;font-family:${FONT};font-size:12px;line-height:1.65;color:${COLORS.slate500};">
                  <div style="font-weight:600;color:${COLORS.ink};">Camera History</div>
                  <div>Jílovská 262, 257 41 Týnec nad Sázavou</div>
                  <div><a href="mailto:support@camera-history.com" style="color:${COLORS.glacierDeep};text-decoration:none;">support@camera-history.com</a></div>
                  ${footerNote}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
