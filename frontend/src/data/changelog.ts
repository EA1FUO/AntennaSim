import changelogMarkdown from "../../../CHANGELOG.md?raw";
import { parseChangelog } from "../utils/changelog-parser";

/** Full release history, generated from the project's canonical changelog. */
export const CHANGELOG_ENTRIES = parseChangelog(changelogMarkdown).filter(
  (entry) => entry.version !== "Unreleased",
);

/** Changing the app version makes a new release eligible for automatic display. */
export const CURRENT_CHANGELOG_ID =
  typeof __APP_VERSION__ !== "undefined"
    ? __APP_VERSION__
    : (CHANGELOG_ENTRIES[0]?.version ?? "unknown");
