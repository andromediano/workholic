import { Component, TFile, type App, type TFolder } from 'obsidian';
import { around } from 'monkey-around';
import { rankOf, type Status } from '../status/types';
import { reorderByRank } from './reorder';

const FILE_EXPLORER_VIEW_TYPE = 'file-explorer';

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
}

export type StatusResolver = (path: string) => Status | null;

/**
 * Reorders file explorer rows so status becomes the primary sort key while the
 * user's own sort order (name, modified time, …) survives as the secondary
 * key.
 *
 * Two properties make that work:
 *
 * - The wrapper calls the original `getSortedFolderItems` first, so the input
 *   is already in the user's chosen order.
 * - `Array.prototype.sort` is stable, so ranking by status alone preserves
 *   that order within each status.
 *
 * Folders keep their exact positions; only file rows are reordered.
 */
export class ExplorerSorter extends Component {
	private uninstall: (() => void) | null = null;
	private enabled = false;
	private retryQueued = false;

	constructor(
		private readonly app: App,
		private readonly resolve: StatusResolver,
	) {
		super();
	}

	override onload(): void {
		// The file explorer may still be deferred at startup, or be recreated
		// when the user rearranges the workspace. Re-check on layout changes.
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				if (this.enabled && !this.uninstall) this.install();
			}),
		);
	}

	override onunload(): void {
		this.teardown();
	}

	setEnabled(enabled: boolean): void {
		if (enabled === this.enabled) return;
		this.enabled = enabled;

		if (enabled) this.install();
		else this.teardown();
	}

	/** Ask the file explorer to re-run its sort. Safe to call at any time. */
	refresh(): void {
		if (!this.enabled) return;
		this.view()?.requestSort?.();
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
				'Workholic: this Obsidian build does not expose the file explorer sort hook; status sorting is unavailable.',
			);
			this.enabled = false;
			return;
		}

		const prototype = Object.getPrototypeOf(view) as object;
		const resolve = this.resolve;

		this.uninstall = around(
			prototype as Record<string, unknown>,
			{
				getSortedFolderItems(
					original: (folder: TFolder) => ExplorerItem[],
				) {
					return function (
						this: unknown,
						folder: TFolder,
					): ExplorerItem[] {
						const items = original.call(this, folder);
						try {
							return reorderByStatus(items, resolve);
						} catch (error) {
							console.error(
								'Workholic: failed to sort by status, falling back to the default order.',
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
			if (this.enabled && !this.uninstall) this.install();
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
