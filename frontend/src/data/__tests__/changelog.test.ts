import { describe, expect, it } from "vitest";
import { CHANGELOG_ENTRIES, CURRENT_CHANGELOG_ID } from "../changelog";

describe("visible changelog history", () => {
  it("contains every documented release from the current to the initial version", () => {
    expect(CURRENT_CHANGELOG_ID).toBe("1.4.0");
    expect(CHANGELOG_ENTRIES[0]?.version).toBe("1.4.0");
    expect(CHANGELOG_ENTRIES[CHANGELOG_ENTRIES.length - 1]?.version).toBe(
      "0.2.0",
    );
    expect(CHANGELOG_ENTRIES).toHaveLength(28);
    expect(
      CHANGELOG_ENTRIES.every((entry) =>
        entry.sections.some((section) => section.items.length > 0),
      ),
    ).toBe(true);
  });
});
