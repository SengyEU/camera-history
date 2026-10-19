import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const landing = read("../index.html");
const web = read("../../web/index.html");
const admin = read("../../admin/index.html");
const demo = read("../demo/index.html");
const skiDemo = read("../demo/skilouise/index.html");
const deck = read("../deck/index.html");
const robots = read("../public/robots.txt");
const sitemap = read("../public/sitemap.xml");

describe("landing SEO", () => {
  it("is indexable and canonical", () => {
    expect(landing).toContain('<meta name="robots" content="index, follow, max-image-preview:large" />');
    expect(landing).toContain('<link rel="canonical" href="https://camera.sengycraft.cz/" />');
  });

  it("has Open Graph and Twitter metadata with a 1200x630 image", () => {
    expect(landing).toContain('<meta property="og:type" content="website" />');
    expect(landing).toContain('<meta property="og:site_name" content="Camera History" />');
    expect(landing).toContain('<meta property="og:url" content="https://camera.sengycraft.cz/" />');
    expect(landing).toContain(
      '<meta property="og:image" content="https://camera.sengycraft.cz/og-image.png" />',
    );
    expect(landing).toContain('<meta property="og:image:width" content="1200" />');
    expect(landing).toContain('<meta property="og:image:height" content="630" />');
    expect(landing).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(landing).toContain(
      '<meta name="twitter:image" content="https://camera.sengycraft.cz/og-image.png" />',
    );
  });

  it("embeds valid SoftwareApplication and WebSite structured data", () => {
    const match = landing.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    );
    expect(match).not.toBeNull();
    const data = JSON.parse(match![1]!) as { "@graph"?: Array<{ "@type"?: string }> };
    const types = (data["@graph"] ?? []).map((node) => node["@type"]);
    expect(types).toContain("SoftwareApplication");
    expect(types).toContain("WebSite");
  });

  it("ships an OG image at 1200x630", () => {
    const path = new URL("../public/og-image.png", import.meta.url);
    expect(existsSync(path)).toBe(true);
    const png = readFileSync(path);
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});

describe("non-public pages are noindex", () => {
  for (const [name, html] of [
    ["widget shell", web],
    ["admin shell", admin],
    ["demo", demo],
    ["ski demo", skiDemo],
    ["deck", deck],
  ] as const) {
    it(`${name} is noindex`, () => {
      expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    });
  }
});

describe("robots and sitemap", () => {
  it("keeps widget pages crawlable so their noindex is visible", () => {
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Disallow: /admin/");
    expect(robots).not.toContain("Disallow: /widget/");
    expect(robots).not.toContain("Disallow: /group/");
    expect(robots).toContain("Sitemap: https://camera.sengycraft.cz/sitemap.xml");
  });

  it("lists only the landing page", () => {
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locations).toEqual(["https://camera.sengycraft.cz/"]);
  });
});
