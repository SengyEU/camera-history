#!/usr/bin/env node
// Regenerates the OG/banner assets with the canonical camera + Connect.Archive.Embed copy.
// Run from packages/site: node scripts/generate-brand-images.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const C = {
  snow: "#f7f9fb",
  ink: "#101828",
  muted: "#5b6b7c",
  night: "#0b1220",
  onDark: "#f1f5f9",
  darkMuted: "#8b99ad",
  glacier: "#0e7490",
  bright: "#0891b2",
  slate400: "#94a3b8",
};

const fontPath = fileURLToPath(
  new URL("../../../node_modules/@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2", import.meta.url),
);
const font = `data:font/woff2;base64,${readFileSync(fontPath).toString("base64")}`;
const logo = (name) =>
  `data:image/svg+xml;base64,${readFileSync(
    fileURLToPath(new URL(`../public/brand/logotypes/${name}`, import.meta.url)),
  ).toString("base64")}`;

const face = `@font-face{font-family:Montserrat;src:url("${font}") format("woff2");font-weight:100 900;font-style:normal;font-display:block}`;

function ridge(dark) {
  const opacity = dark ? 0.3 : 0.18;
  return `<svg class="ridge" viewBox="0 0 1200 630" preserveAspectRatio="none" aria-hidden="true">
    <g fill="none" stroke="${C.bright}" stroke-opacity="${opacity}" stroke-width="1.5">
      <polyline points="0,380 120,300 260,350 400,280 540,340 680,270 820,330 960,280 1100,340 1200,300" />
      <polyline points="0,450 160,370 320,420 480,350 640,410 800,340 960,400 1120,360 1200,390" />
      <polyline points="0,520 140,450 300,500 460,430 620,490 780,420 940,480 1100,440 1200,470" />
    </g>
  </svg>`;
}

function lightOg() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${face}
    html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:${C.snow};color:${C.ink};font-family:Montserrat,sans-serif}
    .ridge{position:absolute;inset:0;width:100%;height:100%}
    .logo{position:absolute;left:190px;top:170px;width:820px;height:auto}
    .tagline{position:absolute;top:382px;left:0;width:100%;text-align:center;font-size:28px;font-weight:500;letter-spacing:-.015em;line-height:1.2}
    .tagline strong{color:${C.glacier};font-weight:600}
    .small{position:absolute;top:460px;left:0;width:100%;text-align:center;color:${C.muted};font-size:11px;font-weight:500;letter-spacing:.18em}
  </style></head><body>
    ${ridge(false)}
    <img class="logo" src="${logo("horizontal-caps-light.svg")}" alt="">
    <div class="tagline">Your camera only shows now. <strong>We add the history.</strong></div>
    <div class="small">CONNECT / ARCHIVE / EMBED</div>
  </body></html>`;
}

function darkBanner({ width, height, caps, wide }) {
  const title = caps ? "CAPS" : "TITLE";
  const label = wide ? `${title} / WIDE` : `${title} / OG`;
  const markLeft = wide ? 110 : 70;
  const markTop = wide ? 170 : 205;
  const markSize = wide ? 180 : 150;
  const textLeft = wide ? 380 : 300;
  const wordmarkWidth = wide ? (caps ? 820 : 650) : caps ? 720 : 570;
  const wordmarkTop = wide ? 200 : 230;
  const taglineTop = wide ? 300 : 330;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${face}
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${C.night};color:${C.onDark};font-family:Montserrat,sans-serif}
    .ridge{position:absolute;inset:0;width:100%;height:100%}
    .top{position:absolute;top:44px;left:64px;right:64px;display:flex;justify-content:space-between;color:${C.bright};font-size:11px;font-weight:500;letter-spacing:.16em;text-transform:uppercase}
    .mark{position:absolute;left:${markLeft}px;top:${markTop}px;width:${markSize}px;height:${markSize}px}
    .wordmark{position:absolute;left:${textLeft}px;top:${wordmarkTop}px;width:${wordmarkWidth}px;height:auto}
    .tagline{position:absolute;left:${textLeft}px;top:${taglineTop}px;color:${C.darkMuted};font-size:26px;font-weight:500;letter-spacing:-.01em}
    .small{position:absolute;left:${textLeft}px;top:${wide ? 360 : 385}px;color:${C.bright};font-size:11px;font-weight:500;letter-spacing:.2em;text-transform:uppercase}
    .bottom{position:absolute;left:64px;right:64px;bottom:${wide ? 30 : 36}px;display:flex;justify-content:space-between;color:${C.slate400};font-size:11px;font-weight:500}
    .bottom .right{letter-spacing:.16em;text-transform:uppercase}
  </style></head><body>
    ${ridge(true)}
    <div class="top"><span>Camera History / Web Archive</span><span>A2 / ${label}</span></div>
    <img class="mark" src="${logo("symbol-dark.svg")}" alt="">
    <img class="wordmark" src="${logo(`wordmark-${caps ? "caps" : "title"}-dark.svg`)}" alt="">
    <div class="tagline">Your camera has a memory now.</div>
    <div class="small">Connect / Archive / Embed</div>
    <div class="bottom"><span>camera-history.com</span><span class="right">Archive / Embed / Share</span></div>
  </body></html>`;
}

const browser = await chromium.launch();
async function render(html, width, height, path) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path, type: "png" });
  await page.close();
  console.log(`+ ${path}`);
}

const publicDir = new URL("../public/", import.meta.url);
await render(lightOg(), 1200, 630, fileURLToPath(new URL("og-image-a2-final.png", publicDir)));
await render(
  darkBanner({ width: 1200, height: 630, caps: false, wide: false }),
  1200,
  630,
  fileURLToPath(new URL("brand/banner-a2-title-og.png", publicDir)),
);
await render(
  darkBanner({ width: 1200, height: 630, caps: true, wide: false }),
  1200,
  630,
  fileURLToPath(new URL("brand/banner-a2-caps-og.png", publicDir)),
);
await render(
  darkBanner({ width: 1600, height: 600, caps: false, wide: true }),
  1600,
  600,
  fileURLToPath(new URL("brand/banner-a2-title-wide.png", publicDir)),
);
await render(
  darkBanner({ width: 1600, height: 600, caps: true, wide: true }),
  1600,
  600,
  fileURLToPath(new URL("brand/banner-a2-caps-wide.png", publicDir)),
);

await browser.close();
