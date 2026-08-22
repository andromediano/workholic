import { Plugin, debounce } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	WorkholicSettingTab,
	type WorkholicSettings,
} from './settings';
import { StatusIndex } from './status/status-index';
import { StatusDecorator } from './decoration/status-decorator';
import { ExplorerSorter } from './sorting/explorer-patch';

const INDICATOR_STYLES = new Set(['dot', 'text', 'both']);

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

		// The initial scan touches every Markdown file, so keep it out of
		// onload and off the app's startup path.
		this.app.workspace.onLayoutReady(() => {
			this.sorter.setEnabled(this.settings.sortByStatus);
			this.index.rebuild();
		});
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
	}
}
