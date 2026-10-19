const WIDGET_ORIGIN = "https://camera.sengycraft.cz";
const RESIZE_TYPE = "camera-history:resize";
const HELLO_TYPE = "camera-history:hello";
const FONT_TYPE = "camera-history:font";

interface WidgetMessage {
  type?: string;
  height?: number;
}

const sendFont = (source: MessageEventSource | null) => {
  if (!source || typeof (source as Window).postMessage !== "function") return;
  const fontLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .map((link) => link.href)
    .filter((href) => /fonts\.googleapis\.com|fonts\.google\.com/.test(href));
  (source as Window).postMessage(
    {
      type: FONT_TYPE,
      fontFamily: getComputedStyle(document.body).fontFamily,
      fontLinks,
    },
    "*",
  );
};

window.addEventListener("message", (event) => {
  if (event.origin !== WIDGET_ORIGIN) return;
  const data = event.data as WidgetMessage | null;
  if (!data) return;
  if (data.type === HELLO_TYPE) {
    sendFont(event.source);
    return;
  }
  if (data.type !== RESIZE_TYPE || typeof data.height !== "number") return;
  const height = Math.max(240, Math.round(data.height));
  for (const frame of document.querySelectorAll("iframe")) {
    if (frame.contentWindow === event.source) frame.style.height = `${height}px`;
  }
});

for (const frame of document.querySelectorAll("iframe")) {
  frame.addEventListener("load", () => {
    if (frame.contentWindow) sendFont(frame.contentWindow);
  });
}
