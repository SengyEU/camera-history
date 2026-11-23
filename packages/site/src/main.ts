import { pilotStories, type PilotStory } from "./pilots";

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
      status.textContent = "Opening your email app… If nothing happens, email hello@sengycraft.cz.";
    }

    window.location.href = `mailto:hello@sengycraft.cz?subject=${subject}&body=${encodeURIComponent(lines.join("\n"))}`;
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
