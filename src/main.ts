import { Plugin, TFile, debounce } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	WorkholicSettingTab,
	type WorkholicSettings,
} from './settings';
import { StatusIndex } from './status/status-index';
import { StatusDecorator } from './decoration/status-decorator';
import { ExplorerSorter } from './sorting/explorer-patch';
import { StatusPickerModal } from './ui/status-picker';
import { applyStatus } from './status/write-status';

const INDICATOR_STYLES = new Set(['icon', 'bar', 'badge', 'bar-icon']);

export default class WorkholicPlugin extends Plugin {
	settings!: WorkholicSettings;

	private index!: StatusIndex;
	private decorator!: StatusDecorator;
	private sorter!: ExplorerSorter;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.index = this.addChild(
			new StatusIndex(this.app, this.propertyName()),
		);
		this.decorator = this.addChild(
			new StatusDecorator(this.app, (path) => this.index.get(path)),
		);
		this.sorter = this.addChild(
			new ExplorerSorter(this.app, (path) => this.index.get(path)),
		);

		// Coalesce bursts of metadata events (bulk edits, sync) into a single
		// pass over the file explorer.
		this.index.onChange(debounce(() => this.apply(), 100, true));

		this.addSettingTab(new WorkholicSettingTab(this.app, this));
		this.registerStatusPicker();

		// The initial scan touches every Markdown file, so keep it out of
		// onload and off the app's startup path.
		this.app.workspace.onLayoutReady(() => {
			this.sorter.setEnabled(this.settings.sortByStatus);
			this.index.rebuild();
		});
	}

	/**
	 * Obsidian has no enum property type, so the valid statuses are not
	 * discoverable from the Properties UI. One picker, reachable from the
	 * command palette and the file context menu, makes them visible without
	 * anyone having to know the spelling.
	 */
	private registerStatusPicker(): void {
		this.addCommand({
			id: 'set-status',
			name: 'Set status',
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;

				if (!checking) this.openPicker([file]);
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile) || file.extension !== 'md') return;

				menu.addItem((item) =>
					item
						.setTitle('Set status')
						.setIcon('circle-dot')
						.setSection('action')
						.onClick(() => this.openPicker([file])),
				);
			}),
		);

		this.registerEvent(
			this.app.workspace.on('files-menu', (menu, files) => {
				const targets = files.filter(
					(file): file is TFile =>
						file instanceof TFile && file.extension === 'md',
				);
				if (targets.length === 0) return;

				menu.addItem((item) =>
					item
						.setTitle('Set status')
						.setIcon('circle-dot')
						.setSection('action')
						.onClick(() => this.openPicker(targets)),
				);
			}),
		);
	}

	private openPicker(files: TFile[]): void {
		const first = files[0];
		const current =
			files.length === 1 && first ? this.index.get(first.path) : null;
		const property = this.propertyName();

		new StatusPickerModal(this.app, files, current, (status) => {
			void applyStatus(this.app, files, property, status);
		}).open();
	}

	async updateSetting(key: string, value: unknown): Promise<void> {
		switch (key) {
			case 'property':
				if (typeof value === 'string') this.settings.property = value;
				break;
			case 'showIndicators':
				if (typeof value === 'boolean')
					this.settings.showIndicators = value;
				break;
			case 'indicatorStyle':
				if (typeof value === 'string' && INDICATOR_STYLES.has(value))
					this.settings.indicatorStyle =
						value as WorkholicSettings['indicatorStyle'];
				break;
			case 'dimCompleted':
				if (typeof value === 'boolean')
					this.settings.dimCompleted = value;
				break;
			case 'sortByStatus':
				if (typeof value === 'boolean')
					this.settings.sortByStatus = value;
				break;
			default:
				return;
		}

		await this.saveData(this.settings);

		this.sorter.setEnabled(this.settings.sortByStatus);
		// Rebuilds and re-applies on its own if the property actually changed.
		this.index.setProperty(this.propertyName());
		this.apply();
	}

	private apply(): void {
		this.decorator.configure(
			this.settings.showIndicators,
			this.settings.indicatorStyle,
			this.settings.dimCompleted,
		);
		this.sorter.refresh();
	}

	/** Stored settings may predate validation, so re-check on read. */
	private propertyName(): string {
		const property = this.settings.property.trim();
		return property.length > 0 ? property : DEFAULT_SETTINGS.property;
	}

	private async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<WorkholicSettings>;
		this.settings = { ...DEFAULT_SETTINGS, ...stored };

		// Data written by an earlier version may name a preset that no longer
		// exists; fall back rather than emitting an unknown attribute.
		if (!INDICATOR_STYLES.has(this.settings.indicatorStyle)) {
			this.settings.indicatorStyle = DEFAULT_SETTINGS.indicatorStyle;
		}
	}
}
