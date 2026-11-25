/**
 * Keep long account emails readable in the topbar. Prefer the domain over the
 * local part, because the domain identifies the workspace.
 */
export function shortEmail(value: string, max = 27): string {
  if (value.length <= max) return value;

  const at = value.lastIndexOf("@");
  if (at > 0) {
    const local = value.slice(0, at);
    const domain = value.slice(at);
    const localBudget = max - domain.length - 1;
    if (localBudget >= 4) {
      return `${local.slice(0, localBudget)}…${domain}`;
    }
  }

  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
