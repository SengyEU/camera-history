import { RETENTION_MONTHS, retentionCutoff } from "@ch/core";
import type { ObjectStorage, Repos } from "@ch/db";

export interface RetentionPurgeInput {
  repos: Pick<Repos, "listImagesBefore" | "deleteImages">;
  storage: Pick<ObjectStorage, "remove">;
  now?: Date;
  batchSize?: number;
  log?: (message: string) => void;
}

/**
 * Delete images older than 12 months. DB rows go first so a storage failure
 * can only leave an orphan object, never a row pointing to a missing file.
 */
export async function purgeExpiredImages(input: RetentionPurgeInput): Promise<number> {
  const cutoff = retentionCutoff(RETENTION_MONTHS, input.now ?? new Date());
  const batchSize = input.batchSize ?? 500;
  const log = input.log ?? (() => {});
  let removed = 0;

  for (;;) {
    const rows = await input.repos.listImagesBefore(cutoff, batchSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      try {
        await input.repos.deleteImages([row.id]);
        removed += 1;
      } catch (error) {
        log(`retention: failed row ${row.id}: ${String(error)}`);
        continue;
      }
      try {
        await input.storage.remove(row.storageKey);
      } catch (error) {
        log(`retention: orphan object ${row.storageKey}: ${String(error)}`);
      }
    }
    if (rows.length < batchSize) break;
  }
  return removed;
}
