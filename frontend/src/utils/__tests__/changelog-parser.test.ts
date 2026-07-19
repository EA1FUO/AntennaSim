import { describe, expect, it } from "vitest";
import { parseChangelog } from "../changelog-parser";

describe("changelog parser", () => {
  it("parses releases, dates, sections, and changes in source order", () => {
    const entries = parseChangelog(`
## [Unreleased]

## [1.3.0] - 2026-07-19

### Added

- New version history
- Mobile controls

## [1.2.2] - 2026-06-01

### Fixed

- Correct request fields
`);

    expect(entries).toEqual([
      {
        version: "1.3.0",
        date: "2026-07-19",
        sections: [
          { title: "Added", items: ["New version history", "Mobile controls"] },
        ],
      },
      {
        version: "1.2.2",
        date: "2026-06-01",
        sections: [{ title: "Fixed", items: ["Correct request fields"] }],
      },
    ]);
  });

  it("preserves release notes and wrapped change text", () => {
    const entries = parseChangelog(`
## [0.2.0] - 2026-02-27

### Added

- Initial features
  with a wrapped description

This was the initial public release.
`);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.sections[0]?.items).toEqual([
      "Initial features with a wrapped description",
      "This was the initial public release.",
    ]);
  });
});
