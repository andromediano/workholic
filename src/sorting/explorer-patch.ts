import { Component, TFile, type App, type TFolder } from 'obsidian';
import { around } from 'monkey-around';
import { rankOf, type Status } from '../status/types';
import { reorderByRank, reorderPinned } from './reorder';

const FILE_EXPLORER_VIEW_TYPE = 'file-explorer';

/** The explorer's name-based sort orders, as stored in `sortOrder`. */
const NAME_SORT_ORDERS: Record<string, 1 | -1> = {
	alphabetical: 1,
	alphabeticalReverse: -1,
};

/**
 * Matches the collator Obsidian itself uses for name sorting, so files without
 * a label land exactly where they would without this plugin.
 */
const collator = new Intl.Collator(undefined, {
	usage: 'sort',
	sensitivity: 'base',
	numeric: true,
});

/** The shape of a file explorer row. Not part of the public API. */
interface ExplorerItem {
	file?: unknown;
}

/**
 * The slice of the file explorer view this feature depends on. Obsidian does
 * not expose the file explorer to plugins, so everything here is
 * feature-detected before use and the feature disables itself if the shape
 * ever changes.
 */
interface FileExplorerViewInternals {
	getSortedFolderItems?: (folder: TFolder) => ExplorerItem[];
	requestSort?: () => void;
	sortOrder?: unknown;
}

export type StatusResolver = (path: string) => Status | null;

/** What a file is ordered by when the explorer is sorted by name. */
export interface NameSortKey {
	/** Sortable date (`YYYY-MM-DD…`), or null to order by name alone. */
	date: string | null;
	/** The name the user sees: the title, or the file name. */
	name: string;
}

export type NameSortKeyResolver = (file: TFile) => NameSortKey;

export interface SortOptions {
	/** Group files by status, ahead of every other key. */
	byStatus: boolean;
	/**
	 * When the explorer is sorted by name, order files by `NameSortKey`
	 * instead of their file name.
	 */
	byLabel: boolean;
}

/**
 * Reorders file explorer rows on top of the user's own sort order.
 *
 * The wrapper calls the original `getSortedFolderItems` first, so the input is
 * already in the user's chosen order, and every pass after that is a stable
 * sort over file rows only. That gives this precedence:
 *
 * 1. Status (when enabled)
 * 2. Date, then displayed name (when enabled and the explorer is sorted by
 *    name), or else the user's own sort order
 *
 * Folders keep their exact positions; only file rows are reordered.
 */
export class ExplorerSorter extends Component {
	private uninstall: (() => void) | null = null;
	private options: SortOptions = { byStatus: false, byLabel: false };
	private retryQueued = false;
	private unavailable = false;

	constructor(
		private readonly app: App,
		private readonly resolveStatus: StatusResolver,
		private readonly resolveNameKey: NameSortKeyResolver,
	) {
		super();
	}

	override onload(): void {
		// The file explorer may still be deferred at startup, or be recreated
		// when the user rearranges the workspace. Re-check on layout changes.
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				if (this.wanted() && !this.uninstall) this.install();
			}),
		);
	}

	override onunload(): void {
		this.teardown();
	}

	configure(options: SortOptions): void {
		const changed =
			options.byStatus !== this.options.byStatus ||
			options.byLabel !== this.options.byLabel;
		this.options = { ...options };

		if (!this.wanted()) {
			this.teardown();
			return;
		}

		if (!this.uninstall) this.install();
		else if (changed) this.refresh();
	}

	/** Ask the file explorer to re-run its sort. Safe to call at any time. */
	refresh(): void {
		if (!this.uninstall) return;
		this.view()?.requestSort?.();
	}

	private wanted(): boolean {
		return (
			!this.unavailable && (this.options.byStatus || this.options.byLabel)
		);
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

	private install(): void {
		if (this.uninstall) return;

		const view = this.view();
		if (!view) {
			this.queueRetry();
			return;
		}

		if (typeof view.getSortedFolderItems !== 'function') {
			console.error(
				'Workholic: this Obsidian build does not expose the file explorer sort hook; sorting by status and label is unavailable.',
			);
			this.unavailable = true;
			return;
		}

		const prototype = Object.getPrototypeOf(view) as object;
		const reorder = (items: ExplorerItem[], sortOrder: unknown) =>
			this.reorder(items, sortOrder);

		this.uninstall = around(
			prototype as Record<string, unknown>,
			{
				getSortedFolderItems(
					original: (folder: TFolder) => ExplorerItem[],
				) {
					return function (
						this: FileExplorerViewInternals,
						folder: TFolder,
					): ExplorerItem[] {
						const items = original.call(this, folder);
						try {
							return reorder(items, this.sortOrder);
						} catch (error) {
							console.error(
								'Workholic: failed to sort the file explorer, falling back to the default order.',
								error,
							);
							return items;
						}
					};
				},
			} as Parameters<typeof around>[1],
		);

		view.requestSort?.();
	}

	private reorder(items: ExplorerItem[], sortOrder: unknown): ExplorerItem[] {
		let result = items;

		const direction =
			typeof sortOrder === 'string' ? NAME_SORT_ORDERS[sortOrder] : undefined;
		if (this.options.byLabel && direction !== undefined) {
			result = reorderByNameKey(result, this.resolveNameKey, direction);
		}

		if (this.options.byStatus) {
			result = reorderByStatus(result, this.resolveStatus);
		}

		return result;
	}

	private teardown(): void {
		if (!this.uninstall) return;

		this.uninstall();
		this.uninstall = null;
		this.view()?.requestSort?.();
	}

	/**
	 * The explorer was deferred or missing. `layout-change` will fire once it
	 * loads; this just avoids spinning if it never does.
	 */
	private queueRetry(): void {
		if (this.retryQueued) return;
		this.retryQueued = true;

		this.app.workspace.onLayoutReady(() => {
			this.retryQueued = false;
			if (this.wanted() && !this.uninstall) this.install();
		});
	}
}

/**
 * Rewrites file rows in status order while leaving folder rows untouched at
 * their original indices.
 */
export function reorderByStatus(
	items: ExplorerItem[],
	resolve: StatusResolver,
): ExplorerItem[] {
	return reorderByRank(items, (item) => {
		const file = item?.file;
		// Folders return null, which pins them to their current position.
		if (!(file instanceof TFile)) return null;
		return rankOf(resolve(file.path));
	});
}

/**
 * Compares name sort keys. Dated files come first, ordered by date; files with
 * no date follow, so they never interleave with the dated ones. Ties, and the
 * undated files, are ordered by displayed name. `direction` flips the date and
 * name order but keeps undated files last either way.
 */
export function compareNameKeys(
	a: NameSortKey,
	b: NameSortKey,
	direction: 1 | -1,
): number {
	if (a.date !== null && b.date !== null && a.date !== b.date) {
		return direction * (a.date < b.date ? -1 : 1);
	}
	if (a.date !== null && b.date === null) return -1;
	if (a.date === null && b.date !== null) return 1;

	return direction * collator.compare(a.name, b.name);
}

/**
 * Rewrites file rows in name-key order, leaving folder rows in place.
 */
export function reorderByNameKey(
	items: ExplorerItem[],
	resolve: NameSortKeyResolver,
	direction: 1 | -1,
): ExplorerItem[] {
	return reorderPinned(
		items,
		(item) => {
			const file = item?.file;
			if (!(file instanceof TFile)) return null;
			return resolve(file);
		},
		(a, b) => compareNameKeys(a, b, direction),
	);
}
