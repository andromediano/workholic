import type { App, FrontMatterCache } from 'obsidian';
import { FrontmatterIndex } from '../frontmatter/frontmatter-index';
import { normalizeCategory } from '../titles/label-index';

/** Where a note sits in a series. */
export interface Series {
	/** The series name, with links reduced to their name. */
	name: string;
	/** Position within the series, or null when the note has none. */
	order: number | null;
}

export interface SeriesProperties {
	series: string;
	order: string;
}

/**
 * Accepts numbers and numeric strings, since a quoted `seriesOrder: "3"` is
 * as common as a bare `3`. Anything else means "no order".
 */
export function normalizeOrder(raw: unknown): number | null {
	if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
	if (typeof raw !== 'string') return null;

	const text = raw.trim();
	if (text.length === 0) return null;

	const value = Number(text);
	return Number.isFinite(value) ? value : null;
}

/**
 * A series is read like a category: a value, a link, or a list of either.
 * An order without a series means nothing, so it is ignored.
 */
function seriesFrom(properties: SeriesProperties) {
	return (frontmatter: FrontMatterCache | undefined): Series | null => {
		const name = normalizeCategory(frontmatter?.[properties.series]);
		if (name === null) return null;

		return {
			name,
			order: normalizeOrder(frontmatter?.[properties.order]),
		};
	};
}

const sameSeries = (a: Series, b: Series): boolean =>
	a.name === b.name && a.order === b.order;

const keyOf = (properties: SeriesProperties): string =>
	JSON.stringify([properties.series, properties.order]);

/** Each Markdown file's series and position in it, read on demand. */
export class SeriesIndex extends FrontmatterIndex<Series> {
	constructor(app: App, properties: SeriesProperties) {
		super(app, keyOf(properties), seriesFrom(properties), sameSeries);
	}

	setProperties(properties: SeriesProperties): void {
		this.setSource(keyOf(properties), seriesFrom(properties));
	}
}
