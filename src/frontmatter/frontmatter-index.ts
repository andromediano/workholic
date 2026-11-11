import {
	Component,
	TFile,
	type App,
	type CachedMetadata,
	type FrontMatterCache,
} from 'obsidian';

/**
 * Derives a value from a note's frontmatter, or null when the note should be
 * treated as not having one.
 */
export type Extractor<T> = (frontmatter: FrontMatterCache | undefined) => T | null;

/**
 * Keeps a `path -> value` map derived from frontmatter in sync with the
 * metadata cache.
 *
 * The map is built once after layout is ready and then maintained
 * incrementally, so no full vault scan happens during `onload`. Consumers are
 * notified through `onChange`, which only fires when the map actually changed.
 *
 * `key` identifies what the extractor reads (typically the property names);
 * `setSource` rebuilds only when it differs.
 */
export class FrontmatterIndex<T> extends Component {
	private readonly values = new Map<string, T>();
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
				if (this.apply(file.path, cache)) this.notify();
			}),
		);

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				const previous = this.values.get(oldPath) ?? null;
				let changed = this.values.delete(oldPath);

				if (file instanceof TFile) {
					// When this fires, the metadata cache may not have moved
					// its entry to the new path yet, and no `changed` event
					// follows a rename. A rename never touches the contents,
					// so carry the old value over when the cache has nothing.
					const cache = this.app.metadataCache.getFileCache(file);
					const next = cache ? this.extract(cache.frontmatter) : previous;
					changed = this.set(file.path, next) || changed;
				}

				if (changed) this.notify();
			}),
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (this.values.delete(file.path)) this.notify();
			}),
		);
	}

	/** Full rebuild. Also used when what the index reads changes. */
	rebuild(): void {
		this.values.clear();

		for (const file of this.app.vault.getMarkdownFiles()) {
			this.apply(file.path, this.app.metadataCache.getFileCache(file));
		}

		this.notify();
	}

	get(path: string): T | null {
		return this.values.get(path) ?? null;
	}

	/** Switches what the index reads, rebuilding only if `key` changed. */
	protected setSource(key: string, extract: Extractor<T>): void {
		if (key === this.key) return;
		this.key = key;
		this.extract = extract;
		this.rebuild();
	}

	/** Returns true when the stored value for `path` changed. */
	private apply(path: string, cache: CachedMetadata | null): boolean {
		return this.set(path, this.extract(cache?.frontmatter));
	}

	/** Returns true when the stored value for `path` changed. */
	private set(path: string, next: T | null): boolean {
		const current = this.values.get(path) ?? null;

		const same =
			current === null || next === null
				? current === next
				: this.equals(current, next);
		if (same) return false;

		if (next === null) this.values.delete(path);
		else this.values.set(path, next);

		return true;
	}

	private notify(): void {
		this.listener?.();
	}
}
