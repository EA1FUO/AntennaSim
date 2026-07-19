import { describe, expect, it, vi } from "vitest";
import {
  CHANGELOG_REPEAT_DELAY_MS,
  CHANGELOG_STORAGE_KEY,
  markChangelogSeen,
  shouldShowChangelog,
} from "../changelog-storage";

const CONTENT_ID = "test-changelog";
const NOW = 2_000_000_000_000;

function storageWith(value: string | null) {
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn(),
  };
}

describe("changelog storage", () => {
  it("shows when there is no dismissal record", () => {
    expect(shouldShowChangelog(storageWith(null), CONTENT_ID, NOW)).toBe(true);
  });

  it("hides the same changelog for 30 days after dismissal", () => {
    const storage = storageWith(
      JSON.stringify({ contentId: CONTENT_ID, seenAt: NOW - 1_000 }),
    );

    expect(shouldShowChangelog(storage, CONTENT_ID, NOW)).toBe(false);
  });

  it("shows the same changelog again after 30 days", () => {
    const storage = storageWith(
      JSON.stringify({
        contentId: CONTENT_ID,
        seenAt: NOW - CHANGELOG_REPEAT_DELAY_MS,
      }),
    );

    expect(shouldShowChangelog(storage, CONTENT_ID, NOW)).toBe(true);
  });

  it("shows new changelog content immediately", () => {
    const storage = storageWith(
      JSON.stringify({ contentId: "older-changelog", seenAt: NOW - 1_000 }),
    );

    expect(shouldShowChangelog(storage, CONTENT_ID, NOW)).toBe(true);
  });

  it("shows when the stored record is malformed or dated in the future", () => {
    expect(shouldShowChangelog(storageWith("not-json"), CONTENT_ID, NOW)).toBe(true);
    expect(
      shouldShowChangelog(
        storageWith(JSON.stringify({ contentId: CONTENT_ID, seenAt: NOW + 1 })),
        CONTENT_ID,
        NOW,
      ),
    ).toBe(true);
  });

  it("records the content ID and dismissal time", () => {
    const storage = storageWith(null);
    markChangelogSeen(storage, CONTENT_ID, NOW);

    expect(storage.setItem).toHaveBeenCalledWith(
      CHANGELOG_STORAGE_KEY,
      JSON.stringify({ contentId: CONTENT_ID, seenAt: NOW }),
    );
  });

  it("does not throw when storage is inaccessible", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };

    expect(shouldShowChangelog(storage, CONTENT_ID, NOW)).toBe(true);
    expect(() => markChangelogSeen(storage, CONTENT_ID, NOW)).not.toThrow();
  });
});
