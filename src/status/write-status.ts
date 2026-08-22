import { Notice, type App, type TFile } from 'obsidian';
import type { Status } from './types';

/**
 * Writes (or clears) the status property on every given file.
 *
 * Uses `processFrontMatter` rather than editing text directly: it runs
 * atomically, so a concurrent edit from another plugin can't clobber the
 * file, and it keeps the YAML layout consistent.
 */
export async function applyStatus(
	app: App,
	files: TFile[],
	property: string,
	status: Status | null,
): Promise<void> {
	let updated = 0;
	const failures: string[] = [];

	for (const file of files) {
		try {
			await app.fileManager.processFrontMatter(
				file,
				(frontmatter: Record<string, unknown>) => {
					if (status === null) delete frontmatter[property];
					else frontmatter[property] = status;
				},
			);
			updated++;
		} catch (error) {
			failures.push(file.path);
			console.error(`Workholic: could not update ${file.path}`, error);
		}
	}

	if (failures.length > 0) {
		new Notice(
			`Workholic: could not update ${failures.length} of ${files.length} files. See the console for details.`,
		);
		return;
	}

	// A single file shows its new indicator immediately, so stay quiet there
	// and only confirm the bulk case, where the change is easy to miss.
	if (updated > 1) {
		new Notice(`Updated ${updated} files.`);
	}
}
