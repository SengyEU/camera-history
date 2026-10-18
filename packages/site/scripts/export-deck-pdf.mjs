#!/usr/bin/env node
// Renders the built deck (dist/) to PDF via headless Chromium print-to-PDF.
// Requires `vite preview` running on DECK_BASE (default http://127.0.0.1:8081).

import { chromium } from "playwright";

const DECK_BASE = (process.env.DECK_BASE ?? "http://127.0.0.1:8081").replace(/\/+$/, "");
const out = new URL("../dist/deck.pdf", import.meta.url).pathname;

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
