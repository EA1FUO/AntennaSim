export interface ChangelogSection {
  title: string;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date?: string;
  sections: ChangelogSection[];
}

/**
 * Parses the subset of Keep a Changelog markdown used by this project.
 * Empty releases (normally "Unreleased") are omitted from the visible history.
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let entry: ChangelogEntry | null = null;
  let section: ChangelogSection | null = null;

  const saveEntry = () => {
    if (entry?.sections.some((candidate) => candidate.items.length > 0)) {
      entries.push(entry);
    }
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const releaseMatch = line.match(/^## \[([^\]]+)](?: - (.+))?$/);
    if (releaseMatch) {
      const version = releaseMatch[1];
      if (!version) continue;
      saveEntry();
      entry = {
        version,
        date: releaseMatch[2],
        sections: [],
      };
      section = null;
      continue;
    }

    if (!entry) continue;

    const sectionMatch = line.match(/^### (.+)$/);
    if (sectionMatch) {
      const title = sectionMatch[1];
      if (!title) continue;
      const nextSection = { title, items: [] };
      entry.sections.push(nextSection);
      section = nextSection;
      continue;
    }

    if (!line || line.startsWith("[")) continue;

    const itemMatch = line.match(/^- (.+)$/);
    if (itemMatch) {
      const item = itemMatch[1];
      if (!item) continue;
      if (!section) {
        section = { title: "Notes", items: [] };
        entry.sections.push(section);
      }
      section.items.push(item);
      continue;
    }

    // Preserve prose notes and wrapped list lines without exposing markdown syntax.
    if (!section) {
      section = { title: "Notes", items: [] };
      entry.sections.push(section);
    }
    const lastItem = section.items[section.items.length - 1];
    if (/^\s+/.test(rawLine) && lastItem) {
      section.items[section.items.length - 1] = `${lastItem} ${line}`;
    } else {
      section.items.push(line);
    }
  }

  saveEntry();
  return entries;
}
