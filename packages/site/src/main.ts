import { pilotStories, type PilotStory } from "./pilots";

/*
 * The widget is transparent by design, but a dark color-scheme iframe paints
 * its canvas with the browser default instead of showing the parent through.
 * Paint the hero demo canvas with the same midnight token as its card so the
 * landing showcase stays one blue panel; the widget itself is not touched.
 */
const heroDemo = document.querySelector<HTMLIFrameElement>("#hero-demo iframe");

function paintHeroDemoBackdrop(): void {
  if (!heroDemo) return;
  try {
    const doc = heroDemo.contentDocument;
    if (!doc) return;
    const backdrop = getComputedStyle(document.documentElement)
      .getPropertyValue("--theme-midnight-bg")
      .trim();
    if (backdrop) doc.documentElement.style.background = backdrop;
  } catch {
    // Cross-origin previews keep their own background.
  }
}

if (heroDemo) {
  heroDemo.addEventListener("load", paintHeroDemoBackdrop);
  paintHeroDemoBackdrop();
}

const menu = document.querySelector<HTMLDetailsElement>(".mobile-nav");

if (menu) {
  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      menu.open = false;
    });
  });

  document.addEventListener("click", (event) => {
    if (menu.open && event.target instanceof Node && !menu.contains(event.target)) {
      menu.open = false;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") menu.open = false;
  });
}

const contactForm = document.querySelector<HTMLFormElement>("[data-contact-form]");

if (contactForm) {
  const status = contactForm.querySelector<HTMLElement>(".contact-status");

  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(contactForm);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const topic = value("topic");
    const lines = [`Topic: ${topic}`, `Name: ${value("name")}`, `Email: ${value("email")}`];

    if (value("website")) lines.push(`Website: ${value("website")}`);
    if (value("cameras")) lines.push(`Cameras: ${value("cameras")}`);
    lines.push("", value("message"));

    const subject = encodeURIComponent(`Camera History — ${topic}`);

    if (status) {
      status.hidden = false;
      status.textContent = "Opening your email app… If nothing happens, email marek@camera-history.com.";
    }

    window.location.href = `mailto:marek@camera-history.com?subject=${subject}&body=${encodeURIComponent(lines.join("\n"))}`;
  });
}

const pilotSection = document.querySelector<HTMLElement>("[data-pilots]");
const pilotList = document.querySelector<HTMLUListElement>("[data-pilot-list]");

function renderPilot(pilot: PilotStory): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "pilot-card";

  if (pilot.screenshot) {
    const image = document.createElement("img");
    image.className = "pilot-shot";
    image.src = pilot.screenshot.src;
    image.alt = pilot.screenshot.alt;
    image.loading = "lazy";
    item.append(image);
  }

  const body = document.createElement("div");
  body.className = "pilot-body";

  const name = document.createElement("h3");
  name.className = "pilot-name";
  name.textContent = pilot.name;
  body.append(name);

  const caption = document.createElement("p");
  caption.className = "pilot-caption";
  caption.textContent = pilot.caption;
  body.append(caption);

  if (pilot.href) {
    const link = document.createElement("a");
    link.className = "pilot-link";
    link.href = pilot.href;
    if (pilot.href.startsWith("http")) {
      link.target = "_blank";
      link.rel = "noopener";
    }
    link.textContent = pilot.linkLabel ?? "View site →";
    body.append(link);
  }

  item.append(body);
  return item;
}

if (pilotSection && pilotList && pilotStories.length > 0) {
  pilotList.append(...pilotStories.map(renderPilot));
  pilotList.classList.toggle("pilot-list-single", pilotStories.length === 1);
  pilotSection.hidden = false;
}
