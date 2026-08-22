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

## Setting a status

You don't have to remember the values or type them. A status picker is available from two places:

- **Right-click a file** in the file explorer → **Set status**
- **Command palette** → **Workholic: Set status** (assign a hotkey if you use it often)

Select several files first and the picker applies the status to all of them at once. The picker also offers **Clear status**, which removes the property.

Typing the value by hand still works, of course.

## Features

**Status indicators.** Files with a status are marked in the file explorer. Four presets are available:

| Preset | Looks like |
| --- | --- |
| Status icon *(default)* | An icon whose shape tracks progress — dashed circle, empty circle, half, three-quarter, check |
| Left accent bar | A colored bar down the left edge of the row |
| Text badge | A small label at the right edge (`Backlog`, `Ready`, `WIP`, `Review`, `Done`) |
| Accent bar and icon | Both, for maximum visibility |

The icons are inline SVG masks rather than font glyphs, so they render identically on desktop and mobile instead of depending on font coverage. Shape carries the status on its own, which keeps the indicators readable without relying on color alone.

Colors come from Obsidian's theme variables, so they follow your theme in both light and dark mode.

**Dim completed files.** Files marked `DONE` fade back so unfinished work stands out. On by default.

**Sort by status.** Files are grouped by status in the file explorer. Your existing sort order (name, modified time, …) is preserved *within* each status group, and files without a status go last. Folders keep their positions.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Status property | `status` | Frontmatter property to read. |
| Status indicators | on | Turns the markers on or off. |
| Indicator style | Status icon | See the presets above. |
| Dim completed files | on | Fades `DONE` files. |
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
  
  --workholic-icon-size: 0.95em;
  --workholic-bar-width: 3px;
  --workholic-done-opacity: 0.5;
}
```

To swap an icon, override `--workholic-icon` on the matching status:

```css
.nav-file-title[data-workholic-status='IN_PROGRESS'] {
  --workholic-icon: url("data:image/svg+xml,...");
}
```

## Caveats

**Sorting is per folder.** The file explorer sorts each folder independently, so statuses group within a folder rather than across the whole vault. For a vault-wide status board, use a Base with `group by status`.

**Sorting relies on an internal API.** Obsidian does not expose the file explorer to plugins, so this feature hooks an internal method. It is feature-detected and fails safe: if a future Obsidian release changes that method, sorting silently reverts to the default order and the status indicators keep working. Indicators themselves use only public API and CSS.

**Indicators are DOM-driven.** The file explorer virtualizes its rows, so Workholic watches it with a MutationObserver and stamps each row with a `data-workholic-status` attribute. All styling is static CSS keyed off that attribute, so the cost does not grow with vault size.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type-check and production build
npm run lint
```

## License

MIT
