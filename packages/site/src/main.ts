type PilotCamera = { id: string; name: string };
type Pilot = { name: string; slug: string; cameras: PilotCamera[] };

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

function renderPilot(pilot: Pilot): HTMLLIElement {
  const item = document.createElement("li");

  const name = document.createElement("span");
  name.className = "pilot-name";
  name.textContent = pilot.name;

  const aside = document.createElement("span");
  aside.className = "pilot-aside";

  const count = pilot.cameras.length;
  const meta = document.createElement("span");
  meta.className = "pilot-meta";
  meta.textContent = `${count} camera${count === 1 ? "" : "s"}`;
  aside.append(meta);

  const first = pilot.cameras[0];
  if (first) {
    const link = document.createElement("a");
    link.className = "pilot-link";
    link.href = `/widget/${encodeURIComponent(pilot.slug)}/${encodeURIComponent(first.id)}`;
    link.textContent = "See the live view →";
    aside.append(link);
  }

  item.append(name, aside);
  return item;
}

if (pilotSection && pilotList) {
  fetch("/api/v1/public/pilots")
    .then((response) => (response.ok ? (response.json() as Promise<{ pilots?: Pilot[] }>) : null))
    .then((data) => {
      const pilots = data?.pilots ?? [];
      if (pilots.length === 0) return;
      pilotList.append(...pilots.map(renderPilot));
      pilotSection.hidden = false;
    })
    .catch(() => undefined);
}
