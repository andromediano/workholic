import type { App, FrontMatterCache } from 'obsidian';
import { FrontmatterIndex } from '../frontmatter/frontmatter-index';

/** What a note contributes to its file explorer row. */
export interface Label {
	/** Display title, shown in place of the file name. */
	title: string | null;
	/**
	 * The note's date as `YYYY-MM-DD`, with `THH:mm:ss` appended when a time
	 * is given. Zero-padded, so plain string comparison orders it correctly.
	 */
	date: string | null;
	/** Day of the month, zero-padded to two digits. */
	day: string | null;
	category: string | null;
}

export interface LabelProperties {
	title: string;
	date: string;
	category: string;
}

/**
 * Accepts strings and numbers, since YAML turns an unquoted `title: 2024`
 * into a number. Whitespace is collapsed so a folded multi-line value still
 * fits on one explorer row. Anything else — lists, objects, blanks — means
 * "no value".
 */
export function normalizeText(raw: unknown): string | null {
	let text: string;
	if (typeof raw === 'string') text = raw;
	else if (typeof raw === 'number' && Number.isFinite(raw)) text = String(raw);
	else return null;

	const result = text.replace(/\s+/g, ' ').trim();
	return result.length > 0 ? result : null;
}

const pad = (value: number): string => String(value).padStart(2, '0');

const DATE_PATTERN =
	/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;

/**
 * Obsidian parses frontmatter as YAML 1.2 core schema, so an unquoted
 * `date: 2026-11-11` arrives as a string, not a `Date`. Date and datetime
 * properties are both accepted, as are `/` and `.` separators. A `Date` is
 * handled too, in case another tool wrote the cache.
 */
export function normalizeDate(
	raw: unknown,
): { date: string; day: string } | null {
	if (raw instanceof Date) {
		if (Number.isNaN(raw.getTime())) return null;
		const day = pad(raw.getDate());
		return {
			date: `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${day}`,
			day,
		};
	}

	if (typeof raw !== 'string') return null;

	const match = DATE_PATTERN.exec(raw.trim());
	if (!match) return null;

	const [, year, month, day, hour, minute, second] = match;
	const m = Number(month);
	const d = Number(day);
	if (m < 1 || m > 12 || d < 1 || d > 31) return null;

	let date = `${year}-${pad(m)}-${pad(d)}`;
	if (hour !== undefined && minute !== undefined) {
		date += `T${pad(Number(hour))}:${minute}:${second ?? '00'}`;
	}

	return { date, day: pad(d) };
}

const WIKILINK_PATTERN = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;

/** `[[Area/Dev|Development]]` → `Development`, `[[Area/Dev]]` → `Dev`. */
function unlink(text: string): string {
	const match = WIKILINK_PATTERN.exec(text);
	if (!match) return text;

	const [, target = text, alias] = match;
	return alias ?? target.split('/').pop() ?? target;
}

/**
 * A category may be a single value, a link, or a list of either. Lists are
 * joined with commas so every category stays visible.
 */
export function normalizeCategory(raw: unknown): string | null {
	const values = Array.isArray(raw) ? raw : [raw];

	const parts = values
		.map(normalizeText)
		.filter((part): part is string => part !== null)
		.map(unlink);

	return parts.length > 0 ? parts.join(', ') : null;
}

function labelFrom(properties: LabelProperties) {
	return (frontmatter: FrontMatterCache | undefined): Label | null => {
		const title = normalizeText(frontmatter?.[properties.title]);
		const date = normalizeDate(frontmatter?.[properties.date]);
		const category = normalizeCategory(frontmatter?.[properties.category]);

		if (title === null && date === null && category === null) return null;

		return {
			title,
			date: date?.date ?? null,
			day: date?.day ?? null,
			category,
		};
	};
}

function sameLabel(a: Label, b: Label): boolean {
	return (
		a.title === b.title &&
		a.date === b.date &&
		a.day === b.day &&
		a.category === b.category
	);
}

const keyOf = (properties: LabelProperties): string =>
	JSON.stringify([properties.title, properties.date, properties.category]);

/** Each Markdown file's title, date, and category, read on demand. */
export class LabelIndex extends FrontmatterIndex<Label> {
	constructor(app: App, properties: LabelProperties) {
		super(app, keyOf(properties), labelFrom(properties), sameLabel);
	}

	setProperties(properties: LabelProperties): void {
		this.setSource(keyOf(properties), labelFrom(properties));
	}
}
