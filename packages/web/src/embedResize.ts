const RESIZE_TYPE = "camera-history:resize";
const HELLO_TYPE = "camera-history:hello";
const FONT_TYPE = "camera-history:font";

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

  window.addEventListener("message", (event) => {
    const data = event.data as FontMessage | null;
    if (!data || data.type !== FONT_TYPE) return;
    if (typeof data.fontFamily === "string" && data.fontFamily.trim()) {
      const family = data.fontFamily.replace(/[;{}<>]/g, "").trim().slice(0, 300);
      document.documentElement.style.setProperty("--widget-font", family);
    }
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

  const hello = () => window.parent.postMessage({ type: HELLO_TYPE }, "*");
  hello();
  window.addEventListener("load", hello);

  let lastHeight = 0;
  let frame = 0;

  const post = () => {
    frame = 0;
    const height = Math.ceil(document.body.getBoundingClientRect().height) + 1;
    if (Math.abs(height - lastHeight) < 1) return;
    lastHeight = height;
    window.parent.postMessage({ type: RESIZE_TYPE, height }, "*");
  };

  const schedule = () => {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(post);
  };

  schedule();
  const observer =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  observer?.observe(document.body);
  window.addEventListener("resize", schedule);
  window.addEventListener("load", schedule);
  void document.fonts?.ready.then(schedule).catch(() => {});
  window.setTimeout(schedule, 300);
}
