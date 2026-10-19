export function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} kB`;
  return `${n} B`;
}

export function formatAge(iso: string | null): string {
  if (!iso) return "—";
  const started = new Date(iso).getTime();
  if (!Number.isFinite(started)) return "—";
  const diff = Date.now() - started;
  if (diff <= 0) return "just now";
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `${hours} h`;
  const minutes = Math.max(1, Math.floor(diff / 60_000));
  return `${minutes} min`;
}
