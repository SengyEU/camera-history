#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_TIERS, RETENTION_MONTHS, packageForCameraCount } from "@ch/core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const { chromium } = require(join(ROOT, "packages/site/node_modules/playwright"));
const TEMPLATE = readFileSync(join(ROOT, "scripts/pilot-onepager/template.html"), "utf8");
const MONTSERRAT_DIR = join(ROOT, "node_modules/@fontsource-variable/montserrat/files");

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

const USAGE = `Usage: node scripts/pilot-onepager/generate.mjs <lead.json> [output-dir]

Example:
  node scripts/pilot-onepager/generate.mjs pilots/kitesportcentre.json

Output defaults to out/proposals/<slug>/:
  one-pager-wordpress.html or one-pager-iframe.html
  camera-history-proposal-<slug>-wordpress.pdf or ...-iframe.pdf
  preview-wordpress.png or preview-iframe.png
  email-wordpress.txt or email-iframe.txt
`;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function numberWord(value) {
  return NUMBER_WORDS[value] ?? String(value);
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid preparedAt date: ${value}`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function fontCss() {
  const fonts = [
    {
      file: "montserrat-latin-wght-normal.woff2",
      range:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
    {
      file: "montserrat-latin-ext-wght-normal.woff2",
      range:
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ];
  return fonts
    .map(({ file, range }) => {
      const data = readFileSync(join(MONTSERRAT_DIR, file)).toString("base64");
      return `@font-face{font-family:'Montserrat Variable';font-style:normal;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${data}) format('woff2-variations');unicode-range:${range};}`;
    })
    .join("\n");
}

function validateLead(lead) {
  if (!lead || typeof lead !== "object") throw new Error("Lead JSON must be an object.");
  for (const key of ["company", "website", "email", "slug"]) {
    if (typeof lead[key] !== "string" || !lead[key].trim()) {
      throw new Error(`Lead is missing "${key}".`);
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    throw new Error('Lead "email" is not a valid email address.');
  }
  if (!/^[a-z0-9-]+$/.test(lead.slug)) {
    throw new Error('Lead "slug" must contain only lowercase letters, numbers and dashes.');
  }
  if (!Number.isInteger(lead.cameraCount) || lead.cameraCount < 1) {
    throw new Error('Lead "cameraCount" must be a positive integer.');
  }
  if (lead.cameraLocations !== undefined && !Array.isArray(lead.cameraLocations)) {
    throw new Error('Lead "cameraLocations" must be an array of strings.');
  }
  if (lead.wordpress !== undefined && typeof lead.wordpress !== "boolean") {
    throw new Error('Lead "wordpress" must be true or false.');
  }
  if (lead.layout !== undefined && !["separate-pages", "one-page"].includes(lead.layout)) {
    throw new Error('Lead "layout" must be "separate-pages" or "one-page".');
  }
  if (lead.signupUrl !== undefined && (typeof lead.signupUrl !== "string" || !lead.signupUrl.startsWith("https://"))) {
    throw new Error('Lead "signupUrl" must be an https:// URL.');
  }
}

function resolvePackage(lead) {
  if (lead.cameraCount > 25) {
    return {
      code: "custom",
      name: "Custom",
      limit: null,
      price: null,
      custom: true,
    };
  }
  if (lead.packageCode) {
    const tier = PACKAGE_TIERS.find((item) => item.code === lead.packageCode);
    if (!tier) {
      throw new Error(
        `Unknown packageCode "${lead.packageCode}". Use one of: ${PACKAGE_TIERS.map((item) => item.code).join(", ")}.`,
      );
    }
    if (lead.cameraCount > tier.maxCameras) {
      throw new Error(
        `packageCode "${tier.code}" allows ${tier.maxCameras} cameras, but the lead has ${lead.cameraCount}.`,
      );
    }
    return { ...tier, limit: tier.maxCameras, custom: false };
  }
  const tier = packageForCameraCount(lead.cameraCount);
  return { ...tier, limit: tier.maxCameras, custom: false };
}

function listFormat(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(items);
}

function buildEmail(lead, pkg, emailLocations, websiteLabel, wordpress) {
  const greeting = lead.contactName ? `Hi ${lead.contactName},` : "Hi there,";
  const number = numberWord(lead.cameraCount);
  const cameras = `${number} live ${lead.cameraCount === 1 ? "camera" : "cameras"}`;
  const locationLine = emailLocations ? ` — ${emailLocations}` : "";
  const onePage = lead.layout === "one-page";
  const coverage = pkg.custom
    ? `We'll shape the plan around your ${lead.cameraCount} cameras.`
    : lead.cameraCount === 1
      ? `The ${pkg.name} plan covers your camera.`
      : `The ${pkg.name} plan covers up to ${pkg.limit} cameras, so all ${number} of your cameras are covered.`;
  const widgetSentence = wordpress
    ? onePage
      ? "You will just embed the WordPress group widget on your live cam page."
      : "You will just embed the WordPress widget on each camera's page."
    : onePage
      ? "You will just embed the group widget on your live cam page."
      : "You will just embed the widget on each camera's page.";
  const priceLine = pkg.custom
    ? "If you like it, we can agree a custom monthly price after that."
    : `If you like it, you can keep it for €${pkg.eurPerMonth.toFixed(2)} a month after that.`;

  const signupUrl = lead.signupUrl ?? "https://camera-history.com/admin/#/register";
  const setupPhrase = lead.cameraCount === 1 ? "add your camera" : `add all ${number} cameras`;
  const selfSetup = lead.signupUrl
    ? `If you'd rather set it up yourself, register here:\n${signupUrl}\n\nThat link gives you the ${pkg.custom ? "right plan" : `${pkg.name} plan`} and three months free. After registering, add your cameras in the dashboard — you can use the URLs from your site.`
    : `If you'd rather set it up yourself, register at ${signupUrl} and I'll activate your three free months.`;

  return `To: ${lead.email}
Subject: A ${RETENTION_MONTHS}-month archive for ${lead.company}'s live cameras

${greeting}

I had a look at ${websiteLabel} and your ${cameras}${locationLine}. The live view is great, but visitors only see the current moment. I'd like to show you our service, Camera History — it keeps a ${RETENTION_MONTHS}-month archive of your cameras and lets visitors browse the history by day, right from your site.

As one of our first users, you will get three months for free, with no commitment. For ${lead.company}, ${coverage.charAt(0).toLowerCase() + coverage.slice(1)} ${widgetSentence} ${priceLine} If not, we simply switch it off.

In return, I'd love your feedback after a few weeks and, if it works well, permission to feature ${lead.company} on our website in the "Who is using Camera History?" section.

I've attached a one-page overview. You can find even more at https://camera-history.com.

If you'd like us to set it up, just reply with the email address you want to use for signing in. We'll take the camera URLs from your site, create the workspace, ${setupPhrase}, and send you a temporary password you can change after your first sign-in.

${selfSetup}

Marek
Camera History
marek@camera-history.com
`;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args[0] || args[0] === "--help" || args[0] === "-h") {
    console.log(USAGE);
    process.exit(args[0] ? 0 : 1);
  }

  const leadPath = resolve(process.cwd(), args[0]);
  const lead = JSON.parse(readFileSync(leadPath, "utf8"));
  validateLead(lead);
  lead.freeMonths = lead.freeMonths ?? 3;
  lead.layout = lead.layout ?? "separate-pages";

  const pkg = resolvePackage(lead);
  const locations = (lead.cameraLocations ?? []).map((item) => String(item).trim()).filter(Boolean);
  const cameraWord = lead.cameraCount === 1 ? "camera" : "cameras";
  const company = escapeHtml(lead.company);
  const eyebrow = escapeHtml(
    lead.location ? `${lead.company} · ${lead.location}` : lead.company,
  );
  const website = /^https?:\/\//.test(lead.website) ? lead.website : `https://${lead.website}`;
  const websiteUrl = escapeHtml(website);
  const websiteLabel = escapeHtml(website.replace(/^https?:\/\//, "").replace(/\/$/, ""));
  const date = formatDate(lead.preparedAt);
  const headline = lead.headline ?? "Your cameras, beyond the live moment.";
  const heroSub = `A ${RETENTION_MONTHS}-month visual archive for ${lead.company}'s ${numberWord(lead.cameraCount)} live ${cameraWord} — embedded on your site.`;
  const intro = `<strong>${company}</strong> already gives visitors a live view. Camera History adds the part they miss: a browsable archive of every day, week and season.`;
  const onePage = lead.layout === "one-page";
  const setupSub = lead.location
    ? `Your live ${cameraWord} across ${lead.location}${lead.wordpress ? " on your WordPress site" : ""}. One archive, one ${onePage ? "group " : ""}${lead.wordpress ? "widget" : "embed"}${onePage ? "" : " per camera"}.`
    : `Your live ${cameraWord}${lead.wordpress ? " on your WordPress site" : ""}. One archive, one ${onePage ? "group " : ""}${lead.wordpress ? "widget" : "embed"}${onePage ? "" : " per camera"}.`;
  const embedChecklist = lead.wordpress
    ? onePage
      ? "One WordPress group widget <span>— paste it on your live cam page.</span>"
      : "One WordPress widget <span>— paste it on each camera page.</span>"
    : onePage
      ? "One group embed <span>— all cameras in one place.</span>"
      : "One iframe snippet <span>— one per camera page.</span>";
  const embedStep = lead.wordpress
    ? onePage
      ? "Drop the WordPress group widget on your live cam page. Visitors browse by day."
      : "Drop the WordPress widget on each camera page. Visitors browse by day."
    : onePage
      ? "Drop one group embed on your live cam page. Visitors browse by day."
      : "Drop one iframe on each camera page. Visitors browse by day.";
  const insight = lead.insight
    ? escapeHtml(lead.insight)
    : "<strong>Your live cameras already bring people in.</strong> The archive gives them a reason to come back tomorrow — and next season.";

  const cameraLocationsHtml =
    locations.length > 0
      ? locations.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n                ")
      : "<li>Camera locations to confirm</li>";

  const offerCopy = pkg.custom
    ? `We'll shape the plan around your ${lead.cameraCount} cameras.`
    : lead.cameraCount === 1
      ? `The ${pkg.name} plan covers your camera for ${lead.freeMonths} months, free.`
      : `The ${pkg.name} plan covers up to ${pkg.limit} cameras, so all ${numberWord(lead.cameraCount)} of your cameras are covered.`;
  const packagePriceHtml = pkg.custom
    ? 'Custom <span>quote</span>'
    : `€${pkg.eurPerMonth.toFixed(2)} <span>/ month</span>`;
  const packageLimitWord = pkg.limit === 1 ? "camera" : "cameras";
  const packageMeta = pkg.custom
    ? `${lead.cameraCount} cameras · let's talk`
    : `Up to ${pkg.limit} ${packageLimitWord}`;

  const cameraLocationsText = locations.length
    ? locations.map((item) => escapeHtml(item)).join(" · ")
    : "Camera locations to confirm";
  const packageStatPrice = pkg.custom
    ? "custom quote"
    : `€${pkg.eurPerMonth.toFixed(2)} / month after`;
  const widgetPlanLine = lead.wordpress
    ? onePage
      ? "WordPress group widget on your live cam page."
      : "WordPress widget on each camera page."
    : onePage
      ? "One group embed on your live cam page."
      : "One iframe on each camera page.";

  const embedStatTitle = lead.wordpress ? "WordPress" : "Iframe";
  const embedStatLabel = lead.wordpress
    ? onePage
      ? "group widget on one page"
      : "widget on each camera page"
    : onePage
      ? "one group embed"
      : "one on each camera page";
  const cameraCoverage = lead.cameraCount === 1
    ? "your camera"
    : `all ${numberWord(lead.cameraCount)} of your cameras`;
  const packagePriceLabel = pkg.custom
    ? "Custom pricing"
    : `€${pkg.eurPerMonth.toFixed(2)} / month`;
  const afterPilot = pkg.custom
    ? "Custom pricing"
    : `${pkg.name} · €${pkg.eurPerMonth.toFixed(2)}/month`;

  const widgetFile = onePage ? "widget-group.png" : "widget-single.png";
  const widgetImage = `data:image/png;base64,${readFileSync(join(ROOT, "scripts/pilot-onepager/assets", widgetFile)).toString("base64")}`;
  const widgetAlt = onePage
    ? "Demo group widget with a day of camera captures"
    : "Demo single-camera widget with a day of captures";
  const widgetCaption = onePage ? "Demo group widget" : "Demo single-camera widget";

  const replacements = {
    "{{PAGE_TITLE}}": escapeHtml(`Camera History — proposal for ${lead.company}`),
    "{{FONT_CSS}}": fontCss(),
    "{{COMPANY}}": company,
    "{{EYEBROW}}": eyebrow,
    "{{HEADLINE}}": escapeHtml(headline),
    "{{HERO_SUB}}": escapeHtml(heroSub),
    "{{CAMERA_COUNT}}": String(lead.cameraCount),
    "{{CAMERA_WORD}}": cameraWord,
    "{{CAMERA_LOCATIONS_TEXT}}": cameraLocationsText,
    "{{FREE_MONTHS}}": String(lead.freeMonths),
    "{{INTRO}}": intro,
    "{{OFFER_COPY}}": escapeHtml(offerCopy),
    "{{SETUP_SUB}}": escapeHtml(setupSub),
    "{{EMBED_CHECKLIST}}": embedChecklist,
    "{{EMBED_STEP}}": escapeHtml(embedStep),
    "{{WIDGET_IMAGE}}": widgetImage,
    "{{WIDGET_ALT}}": escapeHtml(widgetAlt),
    "{{WIDGET_CAPTION}}": escapeHtml(widgetCaption),
    "{{CAMERA_LOCATIONS}}": cameraLocationsHtml,
    "{{WEBSITE_URL}}": websiteUrl,
    "{{WEBSITE_LABEL}}": websiteLabel,
    "{{PACKAGE_NAME}}": escapeHtml(pkg.name),
    "{{EMBED_STAT_TITLE}}": escapeHtml(embedStatTitle),
    "{{EMBED_STAT_LABEL}}": escapeHtml(embedStatLabel),
    "{{AFTER_PILOT}}": escapeHtml(afterPilot),
    "{{CAMERA_COVERAGE}}": escapeHtml(cameraCoverage),
    "{{PACKAGE_PRICE_LABEL}}": escapeHtml(packagePriceLabel),
    "{{PACKAGE_STAT_PRICE}}": escapeHtml(packageStatPrice),
    "{{WIDGET_PLAN_LINE}}": escapeHtml(widgetPlanLine),
    "{{PACKAGE_PRICE_HTML}}": packagePriceHtml,
    "{{PACKAGE_META}}": escapeHtml(packageMeta),
    "{{INSIGHT}}": insight,
    "{{DATE}}": escapeHtml(date),
  };

  let html = TEMPLATE;
  for (const [token, value] of Object.entries(replacements)) {
    html = html.replaceAll(token, value);
  }
  const leftover = html.match(/{{[A-Z0-9_]+}}/);
  if (leftover) throw new Error(`Template placeholder was not replaced: ${leftover[0]}`);

  const outputDir = args[1]
    ? resolve(process.cwd(), args[1])
    : join(ROOT, "out/proposals", lead.slug);
  mkdirSync(outputDir, { recursive: true });

  const variant = lead.wordpress ? "wordpress" : "iframe";
  const htmlPath = join(outputDir, `one-pager-${variant}.html`);
  const pdfPath = join(outputDir, `camera-history-proposal-${lead.slug}-${variant}.pdf`);
  const previewPath = join(outputDir, `preview-${variant}.png`);
  const emailPath = join(outputDir, `email-${variant}.txt`);
  writeFileSync(htmlPath, html);
  writeFileSync(emailPath, buildEmail(lead, pkg, listFormat(locations), websiteLabel, lead.wordpress));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: previewPath, fullPage: false });
    await page.pdf({
      path: pdfPath,
      preferCSSPageSize: true,
      printBackground: true,
    });
  } finally {
    await browser.close();
  }

  console.log(`PDF:     ${pdfPath}`);
  console.log(`Preview: ${previewPath}`);
  console.log(`Email:   ${emailPath}`);
  console.log(`HTML:    ${htmlPath}`);
  console.log(
    `Package: ${pkg.name}${
      pkg.custom
        ? " (custom quote)"
        : ` (${pkg.limit} ${pkg.limit === 1 ? "camera" : "cameras"}, €${pkg.eurPerMonth.toFixed(2)}/month)`
    }`,
  );
  console.log(`Variant: ${lead.wordpress ? "WordPress" : "iframe"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
