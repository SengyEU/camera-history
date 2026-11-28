import { pilotStories, type PilotStory } from "./pilots";

/*
 * The widget is transparent by design, but a dark color-scheme iframe paints
 * its canvas with the browser default instead of showing the parent through.
 * Paint the hero demo canvas with the same midnight token as its card so the
 * landing showcase stays one blue panel; the widget itself is not touched.
 */
const heroDemo = document.querySelector<HTMLIFrameElement>("#live-demo iframe");

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
  const submit = contactForm.querySelector<HTMLButtonElement>('button[type="submit"]');

  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!contactForm.reportValidity() || submit?.disabled) return;

    const data = new FormData(contactForm);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const payload = {
      topic: value("topic"),
      name: value("name"),
      email: value("email"),
      website: value("website"),
      cameras: value("cameras"),
      message: value("message"),
      privacy: data.get("privacy") === "on",
      botfield: value("botfield"),
    };

    if (status) {
      status.hidden = false;
      status.className = "contact-status";
      status.textContent = "Sending…";
    }
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Sending…";
    }

    void fetch("/api/v1/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
          throw new Error(typeof body?.detail === "string" ? body.detail : "Message could not be sent.");
        }
        contactForm.reset();
        if (status) {
          status.hidden = false;
          status.className = "contact-status is-success";
          status.textContent =
            "Message sent. We’ll reply to the email address you entered.";
        }
      })
      .catch((err: unknown) => {
        if (status) {
          status.hidden = false;
          status.className = "contact-status is-error";
          status.textContent =
            err instanceof Error
              ? `${err.message} You can also write to support@camera-history.com.`
              : "Message could not be sent. Write to support@camera-history.com.";
        }
      })
      .finally(() => {
        if (submit) {
          submit.disabled = false;
          submit.textContent = "Send message";
        }
      });
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
