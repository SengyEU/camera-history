#!/usr/bin/env node
// Renders the built deck (dist/) to PDF via headless Chromium print-to-PDF.
// Requires `vite preview` running on DECK_BASE (default http://127.0.0.1:8082).
// Writes to public/ so Vite copies the PDF into dist/ on every build.

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const DECK_BASE = (process.env.DECK_BASE ?? "http://127.0.0.1:8082").replace(/\/+$/, "");
const out = new URL("../public/deck.pdf", import.meta.url).pathname;
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${DECK_BASE}/deck/?print-pdf`, { waitUntil: "networkidle" });
await page.waitForFunction(
  () => document.documentElement.classList.contains("reveal-print"),
  null,
  { timeout: 15000 },
);
await page.pdf({
  path: out,
  width: "13.333in",
  height: "7.5in",
  printBackground: true,
  pageRanges: "1-12",
});
await browser.close();
console.log(`+ ${out}`);
