import {
	Component,
	TFile,
	type App,
	type FrontMatterCache,
} from 'obsidian';

/**
 * Derives a value from a note's frontmatter, or null when the note should be
 * treated as not having one.
 */
export type Extractor<T> = (frontmatter: FrontMatterCache | undefined) => T | null;

/**
 * Answers "what value does this file have?" from the metadata cache, on
 * demand, one path at a time.
 *
 * Nothing is scanned up front. A path is read the first time something asks
 * for it — the file explorer, as it draws or sorts the rows it actually shows
 * — and the result is memoized so repeated lookups during a sort stay cheap.
 * The plugin therefore never enumerates the vault, and startup cost no longer
 * grows with vault size.
 *
 * The memo is kept current from `changed`, `rename`, and `delete` events.
 * Consumers are notified through `onChange`, which only fires when a value
 * someone could have seen actually changed.
 *
 * `key` identifies what the extractor reads (typically the property names);
 * `setSource` resets the memo only when it differs.
 */
export class FrontmatterIndex<T> extends Component {
	/** Memoized values. Null is stored too, for files known to have none. */
	private readonly memo = new Map<string, T | null>();
	private listener: (() => void) | null = null;

	constructor(
		private readonly app: App,
		private key: string,
		private extract: Extractor<T>,
		private readonly equals: (a: T, b: T) => boolean = Object.is,
	) {
		super();
	}

	onChange(listener: () => void): void {
		this.listener = listener;
	}

	override onload(): void {
		this.registerEvent(
			this.app.metadataCache.on('changed', (file, _data, cache) => {
				if (this.store(file.path, this.extract(cache.frontmatter))) {
					this.notify();
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				const previous = this.memo.get(oldPath) ?? null;
				this.memo.delete(oldPath);

				let next: T | null = null;
				if (file instanceof TFile) {
					// When this fires, the metadata cache may not have moved
					// its entry to the new path yet, and no `changed` event
					// follows a rename. A rename never touches the contents,
					// so carry the old value over when the cache has nothing.
					const cache = this.app.metadataCache.getFileCache(file);
					next = cache ? this.extract(cache.frontmatter) : previous;
					this.memo.set(file.path, next);
				}

				// The row moved either way; only a row with a value needs
				// redrawing.
				if (previous !== null || next !== null) this.notify();
			}),
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				const previous = this.memo.get(file.path) ?? null;
				this.memo.delete(file.path);
				if (previous !== null) this.notify();
			}),
		);
	}

	/**
	 * Forgets every memoized value and tells consumers to look again. Used
	 * when what the index reads changes, and once the workspace is ready.
	 */
	reset(): void {
		this.memo.clear();
		this.notify();
	}

	get(path: string): T | null {
		const memoized = this.memo.get(path);
		if (memoized !== undefined) return memoized;

		const file = this.app.vault.getFileByPath(path);
		if (!file) return null;

		// Only Markdown files have frontmatter. Remember that, so sorting a
		// folder full of attachments does not repeat the lookup.
		if (file.extension !== 'md') {
			this.memo.set(path, null);
			return null;
		}

		// Not indexed yet. Answer "nothing" without memoizing it: the
		// `changed` event that follows indexing will fill it in.
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return null;

		const value = this.extract(cache.frontmatter);
		this.memo.set(path, value);
		return value;
	}

	/** Switches what the index reads, resetting only if `key` changed. */
	protected setSource(key: string, extract: Extractor<T>): void {
		if (key === this.key) return;
		this.key = key;
		this.extract = extract;
		this.reset();
	}

	/**
	 * Stores a fresh value. Returns true when it differs from what a consumer
	 * could have seen — the memoized value, or null if the path was never
	 * asked for.
	 */
	private store(path: string, next: T | null): boolean {
		const current = this.memo.get(path) ?? null;
		this.memo.set(path, next);

		if (current === null || next === null) return current !== next;
		return !this.equals(current, next);
	}

	private notify(): void {
		this.listener?.();
	}
}
