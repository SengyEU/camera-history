const RESIZE_TYPE = "camera-history:resize";
const HELLO_TYPE = "camera-history:hello";
const FONT_TYPE = "camera-history:font";
const SCRIPT_OK_TYPE = "camera-history:script-ok";
const THEME_TYPE = "camera-history:theme";
const SCRIPT_MISSING_EVENT = "camera-history:script-missing";
const SCRIPT_OK_EVENT = "camera-history:script-ok";
const SCRIPT_NOTICE_DELAY_MS = 2500;

interface FontMessage {
  type?: string;
  fontFamily?: string;
  fontLinks?: string[];
  backgroundColor?: string;
}

interface ThemeMessage {
  type?: string;
  theme?: string;
  colors?: Record<string, string> | null;
}

const PRESET_THEMES = ["light", "dark", "forest", "midnight"];
const CUSTOM_THEME_VARS: Record<string, string> = {
  bg: "--bg",
  surface: "--surface",
  ink: "--ink",
  muted: "--muted",
  line: "--line",
  accent: "--accent",
  onAccent: "--on-accent",
  pine: "--pine",
  onPine: "--on-pine",
};
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function applyThemeOverride(root: HTMLElement, data: ThemeMessage): void {
  if (!data.theme) return;
  for (const cssVar of Object.values(CUSTOM_THEME_VARS)) {
    root.style.removeProperty(cssVar);
  }
  root.style.removeProperty("--widget-bg");
  root.style.removeProperty("--widget-custom-theme");
  root.dataset.themeOverride = "1";

  if (data.theme === "custom" && data.colors) {
    const colors = data.colors;
    const complete = Object.keys(CUSTOM_THEME_VARS).every(
      (key) => typeof colors[key] === "string" && HEX_COLOR.test(colors[key]!),
    );
    if (!complete) return;
    root.dataset.theme = "light";
    for (const [key, cssVar] of Object.entries(CUSTOM_THEME_VARS)) {
      root.style.setProperty(cssVar, colors[key]!);
    }
    root.style.setProperty("--widget-bg", colors.bg!);
    root.style.setProperty("--widget-custom-theme", "1");
    return;
  }

  if (PRESET_THEMES.includes(data.theme)) {
    root.dataset.theme = data.theme;
  }
}

/**
 * When the widget runs inside an iframe:
 * - report its content height so the embed can size itself,
 * - ask the parent for its font (and webfont stylesheets) so the widget can
 *   blend into the host page,
 * - hide the document scrollbar that would otherwise show up inside the frame.
 */
export function setupEmbedResize(): void {
  if (typeof window === "undefined" || window.parent === window) return;

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  const noEmbedNotice = new URLSearchParams(window.location.search).get("noembed") === "1";
  let scriptConfirmed = false;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  const confirmScript = () => {
    if (scriptConfirmed) return;
    scriptConfirmed = true;
    if (noticeTimer !== undefined) {
      clearTimeout(noticeTimer);
      noticeTimer = undefined;
    }
    window.dispatchEvent(new CustomEvent(SCRIPT_OK_EVENT));
  };

  if (!noEmbedNotice) {
    noticeTimer = setTimeout(() => {
      noticeTimer = undefined;
      if (!scriptConfirmed) window.dispatchEvent(new CustomEvent(SCRIPT_MISSING_EVENT));
    }, SCRIPT_NOTICE_DELAY_MS);
  }

  const hello = () => window.parent.postMessage({ type: HELLO_TYPE }, "*");
  hello();
  window.addEventListener("load", hello);

  let lastHeight = 0;
  let pending = false;

  const applyHeight = (height: number) => {
    try {
      const ownFrame = window.frameElement as HTMLIFrameElement | null;
      if (ownFrame) {
        const next = `${height}px`;
        if (ownFrame.style.height !== next) ownFrame.style.height = next;
      }
    } catch {
      // Cross-origin parents are handled through postMessage below.
    }
    window.parent.postMessage({ type: RESIZE_TYPE, height }, "*");
  };

  const post = () => {
    pending = false;
    const height = Math.ceil(document.body.getBoundingClientRect().height) + 2;
    if (Math.abs(height - lastHeight) < 1) return;
    lastHeight = height;
    applyHeight(height);
  };

  const schedule = () => {
    if (pending) return;
    pending = true;
    // setTimeout (not rAF) so embeds below the fold still report their height.
    window.setTimeout(post, 0);
  };

  window.addEventListener("message", (event) => {
    const data = event.data as FontMessage | null;
    if (!data) return;

    if (data.type === SCRIPT_OK_TYPE) {
      confirmScript();
      return;
    }

    if (data.type === THEME_TYPE) {
      applyThemeOverride(document.documentElement, data as ThemeMessage);
      return;
    }

    if (data.type !== FONT_TYPE) return;
    confirmScript();
    if (typeof data.fontFamily === "string" && data.fontFamily.trim()) {
      const family = data.fontFamily.replace(/[;{}<>]/g, "").trim().slice(0, 300);
      document.documentElement.style.setProperty("--widget-font", family);
    }
    if (
      typeof data.backgroundColor === "string" &&
      document.documentElement.style.getPropertyValue("--widget-custom-theme") !== "1"
    ) {
      const background = data.backgroundColor.trim();
      if (/^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([^)]*\))$/i.test(background)) {
        document.documentElement.style.setProperty("--widget-bg", background);
      }
    }
    // The parent script may load after the iframe; re-report our height even if
    // an earlier retry already sent the same value.
    lastHeight = 0;
    schedule();
    for (const href of data.fontLinks ?? []) {
      if (typeof href !== "string" || !href.startsWith("https://")) continue;
      if (document.querySelector(`link[data-embed-font="${CSS.escape(href)}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.embedFont = href;
      document.head.appendChild(link);
    }
  });

  schedule();
  const observer =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  observer?.observe(document.body);
  const mutations =
    typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule);
  mutations?.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  window.addEventListener("resize", schedule);
  window.addEventListener("load", schedule);
  void document.fonts?.ready.then(schedule).catch(() => {});
  for (const delay of [0, 100, 400, 1200, 2500]) {
    window.setTimeout(schedule, delay);
  }
}
