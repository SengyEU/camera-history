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
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Visit site →";
    body.append(link);
  }

  item.append(body);
  return item;
}

if (pilotSection && pilotList && pilotStories.length > 0) {
  pilotList.append(...pilotStories.map(renderPilot));
  pilotSection.hidden = false;
}
