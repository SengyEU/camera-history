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
    expect(html).toContain('src="/group/alpine-summit/summit"');
    expect(html).toContain('href="/group/alpine-summit/summit"');
  });

  it("uses the Sengycraft contact email in CTAs", () => {
    expect(html).toContain("mailto:hello@sengycraft.cz");
    expect(html).toContain("hello@sengycraft.cz");
  });

  it("pins the exact pricing tiers as row pairs", () => {
    const normalized = html
      .replace(/\s+/g, " ")
      .replaceAll("</td><td>", "</td> <td>")
      .replaceAll("</th><td>", "</th> <td>");
    for (const [label, price] of [
      ["14 days", "€5"],
      ["1 month", "€9"],
      ["3 months", "€15"],
      ["6 months", "€22"],
      ["12 months", "€29"],
      ["24 months", "€49"],
      ["36 months", "€69"],
    ]) {
      expect(normalized).toContain(`<th scope="row">${label}</th> <td>${price}</td>`);
    }
  });

  it("carries the resort-signage markers", () => {
    expect(html).toContain('class="ts-chip"');
    expect(html).toContain("LIVE — ALPINE SUMMIT");
    expect(html).toContain("MOST POPULAR");
  });
});
