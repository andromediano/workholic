import type { App } from 'obsidian';
import { FrontmatterIndex, type Extractor } from '../frontmatter/frontmatter-index';
import { normalizeStatus, type Status } from './types';

function statusFrom(property: string): Extractor<Status> {
	return (frontmatter) => normalizeStatus(frontmatter?.[property]);
}

/** `path -> status` for every Markdown file with a recognized status. */
export class StatusIndex extends FrontmatterIndex<Status> {
	constructor(app: App, property: string) {
		super(app, property, statusFrom(property));
	}

	setProperty(property: string): void {
		this.setSource(property, statusFrom(property));
	}
}
