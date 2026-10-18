#!/usr/bin/env node
// Captures admin dashboard screenshots for the sales deck from the live product.
// Usage: BASE_URL=... DEMO_EMAIL=... DEMO_PASSWORD=... node scripts/capture-admin-screenshots.mjs

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "https://camera.sengycraft.cz").replace(/\/+$/, "");
const EMAIL = process.env.DEMO_EMAIL ?? "owner@alpinesummit.example";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-Resort-2026!";

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto(`${BASE}/admin/`, { waitUntil: "networkidle" });
await page.getByTestId("login-email").fill(EMAIL);
await page.getByTestId("login-password").fill(PASSWORD);
await page.getByTestId("login-submit").click();
await page.getByTestId("admin-app").waitFor();
await page.getByText("Gondola Summit").first().waitFor();
await page.screenshot({ path: new URL("../public/admin-cameras.png", import.meta.url).pathname });
console.log("+ public/admin-cameras.png");

await page.getByTestId("nav-groups").click();
await page.getByTestId("groups-view").getByText("Summit").first().waitFor();
await page.screenshot({ path: new URL("../public/admin-groups.png", import.meta.url).pathname });
console.log("+ public/admin-groups.png");

await browser.close();
