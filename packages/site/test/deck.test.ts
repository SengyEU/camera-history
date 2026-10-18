import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../deck/index.html", import.meta.url), "utf8");
const slideCount = (html.match(/<section/g) ?? []).length;

describe("deck", () => {
  it("has exactly 12 slides", () => {
    expect(slideCount).toBe(12);
  });

  it("opens with the hero tagline", () => {
    expect(html).toContain("<title>Camera History — Sales Deck</title>");
    expect(html).toContain("Your webcam only shows now.");
    expect(html).toContain("We add the history.");
  });

  it("embeds the live demo and the admin screenshots", () => {
    expect(html).toContain('src="/group/alpine-summit/summit"');
    expect(html).toContain('src="/admin-cameras.png"');
    expect(html).toContain('src="/admin-groups.png"');
  });

  it("pins the full pricing table as row pairs and the contact CTA", () => {
    const normalized = html.replace(/\s+/g, " ");
    for (const [label, price] of [
      ["14 days", "€5"],
      ["1 month", "€9"],
      ["3 months", "€15"],
      ["6 months", "€22"],
      ["12 months", "€29"],
      ["24 months", "€49"],
      ["36 months", "€69"],
    ]) {
      expect(normalized).toContain(`<td>${label}</td><td>${price}</td>`);
    }
    expect(html).toContain("mailto:hello@sengycraft.cz");
  });

  it("lists the audiences including weather & nature streams", () => {
    for (const item of [
      "Ski resorts &amp; mountain destinations",
      "Beaches, marinas &amp; kite spots",
      "Tourist attractions &amp; landmarks",
      "Construction &amp; progress cameras",
      "Weather &amp; nature streams",
    ]) {
      expect(html).toContain(`<li>${item}</li>`);
    }
  });
});
