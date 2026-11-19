import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("landing page", () => {
  it("has the product title and hero tagline", () => {
    expect(html).toContain("<title>Camera History — Time-lapse history for your webcam</title>");
    expect(html).toContain("Your webcam only shows now.");
    expect(html).toContain("We add the history.");
  });

  it("embeds the live group widget and links to it", () => {
    expect(html).toMatch(/src="\/group\/alpine-summit\/summit[^"]*"/);
    expect(html).toMatch(/href="\/group\/alpine-summit\/summit[^"]*"/);
  });

  it("uses the Sengycraft contact email in CTAs", () => {
    expect(html).toContain("mailto:hello@sengycraft.cz");
    expect(html).toContain("hello@sengycraft.cz");
  });

  it("pins the five packages and 12-month retention", () => {
    for (const [name, cameras, price] of [
      ["Solo", "1 camera", "€7.99"],
      ["Starter", "3 cameras", "€13.99"],
      ["Plus", "5 cameras", "€19.99"],
      ["Pro", "10 cameras", "€29.99"],
      ["Network", "25 cameras", "€49.99"],
    ]) {
      expect(html).toContain(`<h3>${name}</h3>`);
      expect(html).toContain(`<span class="package-cameras">${cameras}</span>`);
      expect(html).toContain(`<strong>${price}</strong>`);
    }
    expect(html).toContain("12 months of history");
    expect(html).not.toContain("36 months");
  });

  it("answers common questions and links to the admin", () => {
    expect(html).toContain('id="faq"');
    expect(html).toContain("How long do you keep history?");
    expect(html).toContain('href="/admin/"');
  });

  it("carries the resort-signage markers", () => {
    expect(html).toContain('class="ts-chip"');
    expect(html).toContain("LIVE — ALPINE SUMMIT");
    expect(html).toContain("MOST POPULAR");
  });

  it("keeps the customer wall hidden until the API returns pilots", () => {
    expect(html).toContain('data-pilots hidden');
    expect(html).toContain('data-pilot-list');
    expect(html).toContain("Who is using Camera History");
  });
});
