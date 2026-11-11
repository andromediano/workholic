import { Component, TFile, setTooltip, type App } from 'obsidian';
import { around } from 'monkey-around';
import type { Label } from './label-index';

const FILE_EXPLORER_VIEW_TYPE = 'file-explorer';

/** Marks rows whose tooltip this feature set, so teardown removes only ours. */
const TOOLTIP_ATTR = 'data-workholic-tooltip';

const DAY_CLASS = 'workholic-label-day';
const CATEGORY_CLASS = 'workholic-label-category';

/** The shape of a file explorer file row. Not part of the public API. */
interface FileItemInternals {
	file: TFile;
	selfEl: HTMLElement;
	innerEl: HTMLElement;
	getTitle(): string;
	updateTitle(): void;
	startRename(): void;
}

/** The slice of the file explorer view this feature depends on. */
interface FileExplorerViewInternals {
	fileItems?: Record<string, unknown>;
}

export interface LabelOptions {
	/** Show the title in place of the file name. */
	title: boolean;
	/** Show the day of the month ahead of the name. */
	day: boolean;
	/** Show the category ahead of the name. */
	category: boolean;
}

export type LabelResolver = (path: string) => Label | null;

/**
 * Relabels file explorer rows from frontmatter: `11 category title`, where
 * each part appears only when the note has it and its option is on. Hovering
 * a row shows the real file name whenever the title replaced it.
 *
 * The title replaces the label text itself. The explorer renders every row
 * through `FileItem.getTitle()` (which returns `file.basename`) via
 * `updateTitle()`, so wrapping `getTitle` changes the label everywhere the
 * explorer draws it, including after Obsidian's own re-renders.
 *
 * The day and category are separate elements placed before the label, not
 * part of its text. That keeps them out of the rename editor and lets each be
 * styled on its own (see `styles.css`). They live on the row's own element,
 * which belongs to one file for its whole life, so virtualization does not
 * mix them up.
 *
 * Inline rename needs care: `startRename` turns the label element itself into
 * the editor and `saveRename` reads the new name back from its text. Left
 * alone, pressing F2 then Enter would rename the file to its title. The
 * wrapper puts the real base name back before editing starts; `exitRename`
 * already calls `updateTitle()` afterwards, which restores the title.
 *
 * Obsidian does not expose the file explorer to plugins, so everything here is
 * feature-detected and the feature disables itself if the shape changes.
 */
export class ExplorerLabels extends Component {
	private uninstall: (() => void) | null = null;
	private options: LabelOptions = { title: false, day: false, category: false };
	private unavailable = false;

	constructor(
		private readonly app: App,
		private readonly resolve: LabelResolver,
	) {
		super();
	}

	override onload(): void {
		// The file explorer may be deferred at startup, or be recreated when
		// the user rearranges the workspace.
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				if (this.wanted() && !this.uninstall) this.install();
			}),
		);
	}

	override onunload(): void {
		this.teardown();
	}

	configure(options: LabelOptions): void {
		this.options = { ...options };

		if (!this.wanted()) this.teardown();
		else if (!this.uninstall) this.install();
		else this.refresh();
	}

	/** Re-render rows whose label changed. Safe to call at any time. */
	refresh(): void {
		if (!this.wanted()) return;

		// An empty vault has no file row to patch yet; try again now that
		// something changed.
		if (!this.uninstall) {
			this.install();
			return;
		}

		for (const item of this.fileItems()) {
			// Never overwrite a name the user is in the middle of typing.
			if (item.selfEl.hasClass('is-being-renamed')) continue;

			if (item.innerEl.getText() !== item.getTitle()) {
				item.updateTitle();
			} else {
				this.syncParts(item);
				syncTooltip(item);
			}
		}
	}

	private wanted(): boolean {
		const { title, day, category } = this.options;
		return !this.unavailable && (title || day || category);
	}

	private view(): FileExplorerViewInternals | null {
		const leaf = this.app.workspace.getLeavesOfType(
			FILE_EXPLORER_VIEW_TYPE,
		)[0];

		// A deferred leaf carries a placeholder view, so patching its
		// prototype would hit the wrong class. Wait for it to load instead.
		if (!leaf || leaf.isDeferred) return null;

		return leaf.view as unknown as FileExplorerViewInternals;
	}

	private fileItems(): FileItemInternals[] {
		const items = this.view()?.fileItems;
		if (!items || typeof items !== 'object') return [];

		return Object.values(items).filter(isFileItem);
	}

	private install(): void {
		if (this.uninstall) return;

		const view = this.view();
		if (!view) return;

		if (!view.fileItems || typeof view.fileItems !== 'object') {
			console.error(
				'Workholic: this Obsidian build does not expose file explorer rows; frontmatter labels are unavailable.',
			);
			this.unavailable = true;
			return;
		}

		const sample = Object.values(view.fileItems).find(isFileItem);
		if (!sample) return;

		const prototype = Object.getPrototypeOf(sample) as object;
		const resolve = this.resolve;
		const showTitle = () => this.options.title;
		const syncParts = (item: FileItemInternals) => this.syncParts(item);

		this.uninstall = around(
			prototype as Record<string, unknown>,
			{
				getTitle(original: () => string) {
					return function (this: FileItemInternals): string {
						const title = showTitle()
							? resolve(this.file.path)?.title
							: null;
						return title ?? original.call(this);
					};
				},
				updateTitle(original: () => void) {
					return function (this: FileItemInternals): void {
						original.call(this);
						syncParts(this);
						syncTooltip(this);
					};
				},
				startRename(original: () => void) {
					return function (this: FileItemInternals): void {
						this.innerEl.setText(this.file.basename);
						original.call(this);
					};
				},
			} as Parameters<typeof around>[1],
		);

		this.refresh();
	}

	/** Adds, updates, or removes the day and category ahead of the label. */
	private syncParts(item: FileItemInternals): void {
		const label = this.resolve(item.file.path);

		syncPart(item, DAY_CLASS, this.options.day ? label?.day : null);
		syncPart(
			item,
			CATEGORY_CLASS,
			this.options.category ? label?.category : null,
		);
	}

	private teardown(): void {
		if (!this.uninstall) return;

		this.uninstall();
		this.uninstall = null;

		for (const item of this.fileItems()) {
			syncPart(item, DAY_CLASS, null);
			syncPart(item, CATEGORY_CLASS, null);

			if (item.selfEl.hasAttribute(TOOLTIP_ATTR)) {
				item.selfEl.removeAttribute('aria-label');
				item.selfEl.removeAttribute(TOOLTIP_ATTR);
			}

			if (item.selfEl.hasClass('is-being-renamed')) continue;
			item.updateTitle();
		}
	}
}

function isFileItem(item: unknown): item is FileItemInternals {
	if (!item || typeof item !== 'object') return false;

	const candidate = item as Partial<FileItemInternals>;
	return (
		candidate.file instanceof TFile &&
		typeof candidate.getTitle === 'function' &&
		typeof candidate.updateTitle === 'function' &&
		typeof candidate.startRename === 'function' &&
		typeof candidate.selfEl?.setAttribute === 'function' &&
		typeof candidate.innerEl?.setText === 'function'
	);
}

/**
 * Keeps one part element in front of the label in step with `text`: created
 * on demand, updated only when the text differs, removed when there is none.
 * Category sits directly before the label, and day before category (or before
 * the label when there is no category), so the order is always day, category,
 * title.
 */
function syncPart(
	item: FileItemInternals,
	cls: string,
	text: string | null | undefined,
): void {
	const { selfEl, innerEl } = item;
	let el = selfEl.querySelector<HTMLElement>(`:scope > .${cls}`);

	if (!text) {
		el?.remove();
		return;
	}

	if (!el) {
		el = createSpan({ cls });
		const anchor =
			cls === DAY_CLASS
				? (selfEl.querySelector(`:scope > .${CATEGORY_CLASS}`) ?? innerEl)
				: innerEl;
		selfEl.insertBefore(el, anchor);
	}

	if (el.getText() !== text) el.setText(text);
}

/**
 * Shows the real file name on hover, but only when the row is displaying a
 * title instead of it — a tooltip repeating the visible name is just noise.
 */
function syncTooltip(item: FileItemInternals): void {
	const el = item.selfEl;
	const name = item.file.name;

	if (item.getTitle() !== item.file.basename) {
		if (el.getAttribute('aria-label') !== name) setTooltip(el, name);
		el.setAttribute(TOOLTIP_ATTR, 'true');
	} else if (el.hasAttribute(TOOLTIP_ATTR)) {
		el.removeAttribute('aria-label');
		el.removeAttribute(TOOLTIP_ATTR);
	}
}
