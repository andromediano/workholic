import { Plugin, TFile, debounce } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	PROPERTY_SETTINGS,
	WorkholicSettingTab,
	type PropertySetting,
	type WorkholicSettings,
} from './settings';
import { StatusIndex } from './status/status-index';
import { StatusDecorator } from './decoration/status-decorator';
import { ExplorerSorter, type NameSortKey } from './sorting/explorer-patch';
import { StatusPickerModal } from './ui/status-picker';
import { applyStatus } from './status/write-status';
import { LabelIndex, type LabelProperties } from './titles/label-index';
import { ExplorerLabels } from './titles/explorer-labels';

const INDICATOR_STYLES = new Set(['icon', 'bar', 'badge', 'bar-icon']);

const BOOLEAN_SETTINGS = [
	'showIndicators',
	'dimCompleted',
	'sortByStatus',
	'showTitles',
	'showDay',
	'showCategory',
	'sortByLabel',
] as const;

type BooleanSetting = (typeof BOOLEAN_SETTINGS)[number];

const isBooleanSetting = (key: string): key is BooleanSetting =>
	(BOOLEAN_SETTINGS as readonly string[]).includes(key);

const isPropertySetting = (key: string): key is PropertySetting =>
	(PROPERTY_SETTINGS as readonly string[]).includes(key);

export default class WorkholicPlugin extends Plugin {
	settings!: WorkholicSettings;

	private index!: StatusIndex;
	private labelIndex!: LabelIndex;
	private decorator!: StatusDecorator;
	private labels!: ExplorerLabels;
	private sorter!: ExplorerSorter;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.index = this.addChild(
			new StatusIndex(this.app, this.propertyName('property')),
		);
		this.labelIndex = this.addChild(
			new LabelIndex(this.app, this.labelProperties()),
		);
		this.decorator = this.addChild(
			new StatusDecorator(this.app, (path) => this.index.get(path)),
		);
		this.labels = this.addChild(
			new ExplorerLabels(this.app, (path) => this.labelIndex.get(path)),
		);
		this.sorter = this.addChild(
			new ExplorerSorter(
				this.app,
				(path) => this.index.get(path),
				(file) => this.nameSortKey(file),
			),
		);

		// Coalesce bursts of metadata events (bulk edits, sync) into a single
		// pass over the file explorer.
		const apply = debounce(() => this.apply(), 100, true);
		this.index.onChange(apply);
		this.labelIndex.onChange(apply);

		this.addSettingTab(new WorkholicSettingTab(this.app, this));
		this.registerStatusPicker();

		// The initial scan touches every Markdown file, so keep it out of
		// onload and off the app's startup path.
		this.app.workspace.onLayoutReady(() => {
			this.index.rebuild();
			this.labelIndex.rebuild();
			this.configureExplorer();
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
		const property = this.propertyName('property');

		new StatusPickerModal(this.app, files, current, (status) => {
			void applyStatus(this.app, files, property, status);
		}).open();
	}

	async updateSetting(key: string, value: unknown): Promise<void> {
		if (isBooleanSetting(key)) {
			if (typeof value !== 'boolean') return;
			this.settings[key] = value;
		} else if (isPropertySetting(key)) {
			if (typeof value !== 'string') return;
			this.settings[key] = value;
		} else if (key === 'indicatorStyle') {
			if (typeof value !== 'string' || !INDICATOR_STYLES.has(value)) return;
			this.settings.indicatorStyle =
				value as WorkholicSettings['indicatorStyle'];
		} else {
			return;
		}

		await this.saveData(this.settings);

		// Rebuild and re-apply on their own if a property actually changed.
		this.index.setProperty(this.propertyName('property'));
		this.labelIndex.setProperties(this.labelProperties());
		this.configureExplorer();
		this.apply();
	}

	/** Turns the file explorer patches on or off to match the settings. */
	private configureExplorer(): void {
		const { showTitles, showDay, showCategory } = this.settings;

		this.labels.configure({
			title: showTitles,
			day: showDay,
			category: showCategory,
		});
		this.sorter.configure({
			byStatus: this.settings.sortByStatus,
			byLabel: (showTitles || showDay) && this.settings.sortByLabel,
		});
	}

	private apply(): void {
		this.decorator.configure(
			this.settings.showIndicators,
			this.settings.indicatorStyle,
			this.settings.dimCompleted,
		);
		this.labels.refresh();
		this.sorter.refresh();
	}

	/**
	 * Name sorting follows what the row shows: the date only counts while the
	 * day is displayed, and the title only while titles are displayed.
	 */
	private nameSortKey(file: TFile): NameSortKey {
		const label = this.labelIndex.get(file.path);
		const { showTitles, showDay } = this.settings;

		return {
			date: showDay ? (label?.date ?? null) : null,
			name: (showTitles ? label?.title : null) ?? file.basename,
		};
	}

	private labelProperties(): LabelProperties {
		return {
			title: this.propertyName('titleProperty'),
			date: this.propertyName('dateProperty'),
			category: this.propertyName('categoryProperty'),
		};
	}

	/** Stored settings may predate validation, so re-check on read. */
	private propertyName(key: PropertySetting): string {
		const property = this.settings[key].trim();
		return property.length > 0 ? property : DEFAULT_SETTINGS[key];
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
