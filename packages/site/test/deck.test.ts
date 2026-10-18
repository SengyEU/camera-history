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

  it("embeds the live demo and the admin screenshot", () => {
    expect(html).toContain('src="/group/alpine-summit/summit"');
    expect(html).toContain('src="/admin-cameras.png"');
  });

  it("includes pricing and the contact CTA", () => {
    expect(html).toContain("36 months");
    expect(html).toContain("€69");
    expect(html).toContain("mailto:hello@sengycraft.cz");
  });
});
