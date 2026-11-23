import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("landing page", () => {
  it("has the product title and hero tagline", () => {
    expect(html).toContain("<title>Camera History — Time-lapse history for your camera</title>");
    expect(html).toContain("Your camera only shows now.");
    expect(html).toContain("We add the history.");
  });

  it("embeds the live group widget and anchors the demo", () => {
    const heroStart = html.indexOf('<section id="demo" class="hero">');
    const heroEnd = html.indexOf("</section>", heroStart);
    const hero = html.slice(heroStart, heroEnd);

    expect(html).toContain('href="#hero-demo"');
    expect(hero).toMatch(/src="\/group\/alpine-summit\/summit[^"]*"/);
    expect(hero).toContain('id="hero-demo"');
    expect(hero).not.toMatch(/href="\/group\/alpine-summit\/summit/);
  });

  it("puts How it works in the navigation and anchors the steps section", () => {
    expect(html).toContain('href="#how-it-works"');
    expect(html).toContain('id="how-it-works"');
    expect(html).toContain("How it works");
    expect(html).toContain("Connect. Archive. Embed.");
    expect(html).toContain("Connect your cameras");
    expect(html).toContain("Hourly captures, stored for 12 months.");
    expect(html).toContain("How often do you capture?");
    expect(html).toContain("Two ways to start");
  });

  it("describes the feature set as a spec sheet", () => {
    expect(html).toContain("More than a live frame.");
    expect(html).toContain("Every package includes the full feature set.");
    for (const label of ["Feed", "Archive", "Theme", "Groups", "Share", "Embed"]) {
      expect(html).toContain(`<span class="feature-label">${label}</span>`);
    }
    expect(html).toContain("That's the whole integration.");
  });

  it("uses the Sengycraft contact email in CTAs", () => {
    expect(html).toContain("mailto:hello@sengycraft.cz");
    expect(html).toContain("hello@sengycraft.cz");
  });

  it("says Contact us instead of Talk to us", () => {
    expect(html).toContain("Contact us");
    expect(html).not.toContain("Talk to us");
  });

  it("makes self-serve the primary path and keeps contact in a form", () => {
    expect(html).toContain('href="/admin/#/register"');
    expect(html).toContain("Get started");
    expect(html).toContain("Still have questions? Contact us");
    expect(html).toContain('id="contact"');
    expect(html).toContain("data-contact-form");
  });

  it("offers both setup paths in How it works", () => {
    expect(html).toContain("Set it up yourself");
    expect(html).toContain("Let us set it up with you");
    expect(html).toContain("Contact us");
  });

  it("links each pricing package to registration with the package preselected", () => {
    for (const code of ["solo", "starter", "plus", "pro", "network"]) {
      expect(html).toContain(`href="/admin/#/register?package=${code}"`);
    }
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
    for (const line of [
      "For a single viewpoint.",
      "For a small resort or attraction.",
      "For a destination with several angles.",
      "For larger, multi-zone sites.",
      "For a portfolio of destinations.",
    ]) {
      expect(html).toContain(line);
    }
    expect(html).toContain('class="package-card package-card-contact"');
    expect(html).toContain("Need more cameras?");
    expect(html).toContain("25+ cameras");
    expect(html).toContain("Tell us how many you need and we'll build the right package.");
  });

  it("keeps the customer wall hidden until a real story is added", () => {
    expect(html).toContain("Who is using Camera History?");
    expect(html).toContain("A few of the sites running Camera History in public.");
    expect(html).toContain("data-pilots hidden");
  });

  it("answers common questions and links to the admin", () => {
    expect(html).toContain('id="faq"');
    expect(html).toContain('<p class="section-kicker">FAQ</p>');
    expect(html).toContain("How long do you keep history?");
    expect(html).toContain("How long does setup take?");
    expect(html).toContain("Most cameras are live in minutes.");
    expect(html).toContain("For more than 25, contact us.");
    expect(html).toContain('href="/admin/"');
  });

  it("carries the resort-signage markers", () => {
    expect(html).toContain('class="ts-chip"');
    expect(html).toContain("LIVE DEMO");
    expect(html).not.toContain("LIVE — ALPINE SUMMIT");
    expect(html).toContain("MOST POPULAR");
  });

  it("keeps the customer wall hidden until the API returns pilots", () => {
    expect(html).toContain('data-pilots hidden');
    expect(html).toContain('data-pilot-list');
    expect(html).toContain("Who is using Camera History");
  });
});
