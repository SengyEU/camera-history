const WIDGET_ORIGIN = "https://camera.sengycraft.cz";

interface ResizeMessage {
  type?: string;
  height?: number;
}

window.addEventListener("message", (event) => {
  if (event.origin !== WIDGET_ORIGIN) return;
  const data = event.data as ResizeMessage | null;
  if (!data || data.type !== "camera-history:resize" || typeof data.height !== "number") return;
  const height = Math.max(240, Math.round(data.height));
  for (const frame of document.querySelectorAll("iframe")) {
    if (frame.contentWindow === event.source) frame.style.height = `${height}px`;
  }
});
