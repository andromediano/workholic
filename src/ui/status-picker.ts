import { SuggestModal, type App, type TFile } from 'obsidian';
import { STATUSES, STATUS_LABELS, type Status } from '../status/types';

const CLEAR = 'CLEAR';
type Choice = Status | typeof CLEAR;

function labelOf(choice: Choice): string {
	return choice === CLEAR ? 'Clear status' : STATUS_LABELS[choice];
}

/**
 * Status picker shared by the command palette and the file context menu.
 *
 * Obsidian has no enum property type and `MenuItem` exposes no submenu, so a
 * suggest modal is the idiomatic way to offer a fixed set of values — the same
 * shape core uses for "Move file to…".
 */
export class StatusPickerModal extends SuggestModal<Choice> {
	constructor(
		app: App,
		private readonly files: TFile[],
		private readonly current: Status | null,
		private readonly onPick: (status: Status | null) => void,
	) {
		super(app);

		const first = this.files[0];
		this.setPlaceholder(
			this.files.length === 1 && first
				? `Set status for ${first.basename}`
				: `Set status for ${this.files.length} files`,
		);
		this.setInstructions([
			{ command: '↑↓', purpose: 'to navigate' },
			{ command: '↵', purpose: 'to apply' },
			{ command: 'esc', purpose: 'to dismiss' },
		]);
	}

	getSuggestions(query: string): Choice[] {
		const choices: Choice[] = [...STATUSES];

		// Clearing only makes sense when there is something to clear.
		if (this.current !== null || this.files.length > 1) choices.push(CLEAR);

		const needle = query.trim().toLowerCase();
		if (needle.length === 0) return choices;

		return choices.filter(
			(choice) =>
				labelOf(choice).toLowerCase().includes(needle) ||
				choice.toLowerCase().includes(needle),
		);
	}

	renderSuggestion(choice: Choice, el: HTMLElement): void {
		el.addClass('workholic-status-option');

		if (choice === CLEAR) {
			el.addClass('mod-clear');
		} else {
			// Reuses the icon and color custom properties from styles.css.
			el.setAttribute('data-workholic-status', choice);
		}

		el.createSpan({ cls: 'workholic-status-option-icon' });
		el.createSpan({
			cls: 'workholic-status-option-label',
			text: labelOf(choice),
		});

		if (choice !== CLEAR && choice === this.current) {
			el.createSpan({
				cls: 'workholic-status-option-current',
				text: 'Current',
			});
		}
	}

	onChooseSuggestion(choice: Choice): void {
		this.onPick(choice === CLEAR ? null : choice);
	}
}
