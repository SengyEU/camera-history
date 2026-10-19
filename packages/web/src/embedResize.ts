const RESIZE_TYPE = "camera-history:resize";
const HELLO_TYPE = "camera-history:hello";
const FONT_TYPE = "camera-history:font";
const SCRIPT_OK_TYPE = "camera-history:script-ok";
const SCRIPT_MISSING_EVENT = "camera-history:script-missing";
const SCRIPT_OK_EVENT = "camera-history:script-ok";
const SCRIPT_NOTICE_DELAY_MS = 2500;

interface FontMessage {
  type?: string;
  fontFamily?: string;
  fontLinks?: string[];
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

    if (data.type !== FONT_TYPE) return;
    confirmScript();
    if (typeof data.fontFamily === "string" && data.fontFamily.trim()) {
      const family = data.fontFamily.replace(/[;{}<>]/g, "").trim().slice(0, 300);
      document.documentElement.style.setProperty("--widget-font", family);
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
