import { Component, TFile, type App, type CachedMetadata } from 'obsidian';
import { normalizeStatus, type Status } from './types';

/**
 * Keeps a `path -> status` map in sync with the metadata cache.
 *
 * The map is built once after layout is ready and then maintained
 * incrementally, so no full vault scan happens during `onload`. Consumers are
 * notified through `onChange`, which only fires when the map actually changed.
 */
export class StatusIndex extends Component {
	private readonly statuses = new Map<string, Status>();
	private property: string;
	private listener: (() => void) | null = null;

	constructor(
		private readonly app: App,
		property: string,
	) {
		super();
		this.property = property;
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
				let changed = this.statuses.delete(oldPath);

				if (file instanceof TFile) {
					const cache = this.app.metadataCache.getFileCache(file);
					changed = this.apply(file.path, cache) || changed;
				}

				if (changed) this.notify();
			}),
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (this.statuses.delete(file.path)) this.notify();
			}),
		);
	}

	/** Full rebuild. Also used when the tracked property name changes. */
	rebuild(): void {
		this.statuses.clear();

		for (const file of this.app.vault.getMarkdownFiles()) {
			this.apply(file.path, this.app.metadataCache.getFileCache(file));
		}

		this.notify();
	}

	setProperty(property: string): void {
		if (property === this.property) return;
		this.property = property;
		this.rebuild();
	}

	get(path: string): Status | null {
		return this.statuses.get(path) ?? null;
	}

	/** Returns true when the stored value for `path` changed. */
	private apply(path: string, cache: CachedMetadata | null): boolean {
		const next = normalizeStatus(cache?.frontmatter?.[this.property]);
		const current = this.statuses.get(path) ?? null;

		if (next === current) return false;

		if (next === null) this.statuses.delete(path);
		else this.statuses.set(path, next);

		return true;
	}

	private notify(): void {
		this.listener?.();
	}
}
