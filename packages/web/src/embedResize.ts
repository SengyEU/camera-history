const MESSAGE_TYPE = "camera-history:resize";

/**
 * When the widget runs inside an iframe, report its content height to the
 * parent page so the embed can size itself without a hard-coded height.
 */
export function setupEmbedResize(): void {
  if (typeof window === "undefined" || window.parent === window) return;

  let lastHeight = 0;
  let frame = 0;

  const post = () => {
    frame = 0;
    const height = Math.ceil(
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    );
    if (Math.abs(height - lastHeight) < 1) return;
    lastHeight = height;
    window.parent.postMessage({ type: MESSAGE_TYPE, height }, "*");
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
