import type { App } from 'obsidian';
import { FrontmatterIndex, type Extractor } from '../frontmatter/frontmatter-index';
import { normalizeStatus, type Status } from './types';

function statusFrom(property: string): Extractor<Status> {
	return (frontmatter) => normalizeStatus(frontmatter?.[property]);
}

/** Each Markdown file's recognized status, read on demand. */
export class StatusIndex extends FrontmatterIndex<Status> {
	constructor(app: App, property: string) {
		super(app, property, statusFrom(property));
	}

	setProperty(property: string): void {
		this.setSource(property, statusFrom(property));
	}
}
