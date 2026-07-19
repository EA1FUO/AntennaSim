export const CHANGELOG_STORAGE_KEY = "antennasim:changelog-seen";
export const CHANGELOG_REPEAT_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

type ChangelogStorage = Pick<Storage, "getItem" | "setItem">;

interface ChangelogSeenRecord {
  contentId: string;
  seenAt: number;
}

/**
 * Returns true when this changelog has not been dismissed on this device in
 * the last 30 days. Invalid or inaccessible storage falls back to showing it.
 */
export function shouldShowChangelog(
  storage: ChangelogStorage,
  contentId: string,
  now = Date.now(),
): boolean {
  try {
    const raw = storage.getItem(CHANGELOG_STORAGE_KEY);
    if (!raw) return true;

    const record = JSON.parse(raw) as Partial<ChangelogSeenRecord>;
    if (record.contentId !== contentId || typeof record.seenAt !== "number") {
      return true;
    }

    const age = now - record.seenAt;
    return age < 0 || age >= CHANGELOG_REPEAT_DELAY_MS;
  } catch {
    return true;
  }
}

/** Records an explicit dismissal without allowing storage errors to escape. */
export function markChangelogSeen(
  storage: ChangelogStorage,
  contentId: string,
  seenAt = Date.now(),
): void {
  try {
    const record: ChangelogSeenRecord = { contentId, seenAt };
    storage.setItem(CHANGELOG_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage may be unavailable in private or restricted browsing contexts.
  }
}
