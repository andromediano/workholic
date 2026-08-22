# Workholic

Show workflow status from frontmatter as colored indicators in the file explorer, and sort files by status.

Add a `status` property to a note's frontmatter and Workholic marks it in the file explorer:

```yaml
---
status: IN_PROGRESS
---
```

## Statuses

`BACKLOG` → `READY` → `IN_PROGRESS` → `IN_REVIEW` → `DONE`

Values are matched loosely, so `in progress`, `In-Progress`, and `IN_PROGRESS` all resolve to the same status. Anything unrecognized is treated as having no status.

## Features

**Status indicators.** Files with a status get a colored dot, a colored file name, or both. Colors come from Obsidian's theme variables, so they follow your theme in both light and dark mode.

**Sort by status.** Files are grouped by status in the file explorer. Your existing sort order (name, modified time, …) is preserved *within* each status group, and files without a status go last. Folders keep their positions.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Status property | `status` | Frontmatter property to read. |
| Status indicators | on | Turns the colored markers on or off. |
| Indicator style | Colored dot | Dot, file name, or both. |
| Sort by status | on | See the caveat below. |

## Customizing colors

Override the palette in a CSS snippet:

```css
.theme-light,
.theme-dark {
	--workholic-color-backlog: var(--text-faint);
	--workholic-color-ready: var(--color-blue);
	--workholic-color-in-progress: var(--color-yellow);
	--workholic-color-in-review: var(--color-purple);
	--workholic-color-done: var(--color-green);
}
```

## Caveats

**Sorting is per folder.** The file explorer sorts each folder independently, so statuses group within a folder rather than across the whole vault. For a vault-wide status board, use a Base with `group by status`.

**Sorting relies on an internal API.** Obsidian does not expose the file explorer to plugins, so this feature hooks an internal method. It is feature-detected and fails safe: if a future Obsidian release changes that method, sorting silently reverts to the default order and the status indicators keep working. Indicators themselves use only public API and CSS.

**Large vaults.** Indicators are applied through a generated stylesheet with one selector per statused file. This is fine for hundreds of statused notes; tens of thousands may slow down style recalculation.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type-check and production build
npm run lint
```

## License

MIT
