export function groupEmbedSrc(tenantSlug: string, slug: string): string {
  return `${window.location.origin}/group/${tenantSlug}/${slug}`;
}

export function cameraEmbedSrc(tenantSlug: string, cameraId: string): string {
  return `${window.location.origin}/widget/${tenantSlug}/${cameraId}`;
}

export function groupEmbedId(tenantSlug: string, slug: string): string {
  return `camera-history-group-${tenantSlug}-${slug}`;
}

export function cameraEmbedId(tenantSlug: string, cameraId: string): string {
  return `camera-history-widget-${tenantSlug}-${cameraId}`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function embedSnippet(url: string, id: string, title: string): string {
  const scriptUrl = `${window.location.origin}/embed.js`;
  return `<script src="${scriptUrl}" defer></script>\n<iframe id="${id}" src="${url}" title="${escapeHtmlAttribute(title)}" style="width:100%;height:720px;border:0;border-radius:12px" loading="lazy"></iframe>`;
}
