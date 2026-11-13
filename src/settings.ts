import {
	PluginSettingTab,
	type App,
	type SettingDefinitionItem,
} from 'obsidian';
import type { IndicatorStyle } from './decoration/status-decorator';
import type WorkholicPlugin from './main';

export interface WorkholicSettings {
	property: string;
	showIndicators: boolean;
	indicatorStyle: IndicatorStyle;
	dimCompleted: boolean;
	sortByStatus: boolean;
	showTitles: boolean;
	titleProperty: string;
	showDay: boolean;
	dateProperty: string;
	showCategory: boolean;
	categoryProperty: string;
	sortByLabel: boolean;
}

export const DEFAULT_SETTINGS: WorkholicSettings = {
	property: 'status',
	showIndicators: true,
	indicatorStyle: 'icon',
	dimCompleted: true,
	sortByStatus: true,
	showTitles: true,
	titleProperty: 'title',
	showDay: true,
	dateProperty: 'date',
	showCategory: true,
	categoryProperty: 'category',
	sortByLabel: true,
};

/** Text settings that name a frontmatter property, and must not be blank. */
export const PROPERTY_SETTINGS = [
	'property',
	'titleProperty',
	'dateProperty',
	'categoryProperty',
] as const;

export type PropertySetting = (typeof PROPERTY_SETTINGS)[number];

const validateProperty = (value: string): string | undefined =>
	value.trim().length > 0 ? undefined : 'Enter a property name.';

export class WorkholicSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: WorkholicPlugin,
	) {
		super(app, plugin);
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Status property',
				desc: 'Frontmatter property that holds the workflow status.',
				aliases: ['frontmatter', 'BACKLOG', 'IN_PROGRESS', 'DONE'],
				control: {
					type: 'text',
					key: 'property',
					placeholder: DEFAULT_SETTINGS.property,
					validate: validateProperty,
				},
			},
			{
				name: 'Status indicators',
				desc: 'Mark files in the file explorer with their status color.',
				control: { type: 'toggle', key: 'showIndicators' },
			},
			{
				name: 'Indicator style',
				visible: () => this.plugin.settings.showIndicators,
				control: {
					type: 'dropdown',
					key: 'indicatorStyle',
					defaultValue: DEFAULT_SETTINGS.indicatorStyle,
					options: {
						icon: 'Status icon',
						bar: 'Left accent bar',
						badge: 'Text badge',
						'bar-icon': 'Accent bar and icon',
					},
				},
			},
			{
				name: 'Dim completed files',
				desc: 'Fade files marked DONE so unfinished work stands out.',
				control: { type: 'toggle', key: 'dimCompleted' },
			},
			{
				name: 'Sort by status',
				desc: 'Group files in the file explorer by status, keeping your existing sort order within each group. Files without a status go last.',
				control: { type: 'toggle', key: 'sortByStatus' },
			},
			{
				name: 'Show titles',
				desc: 'Show a frontmatter title in place of the file name in the file explorer. Hover a file to see its real name. Files without a title keep their file name.',
				control: { type: 'toggle', key: 'showTitles' },
			},
			{
				name: 'Title property',
				desc: 'Frontmatter property that holds the display title.',
				visible: () => this.plugin.settings.showTitles,
				control: {
					type: 'text',
					key: 'titleProperty',
					placeholder: DEFAULT_SETTINGS.titleProperty,
					validate: validateProperty,
				},
			},
			{
				name: 'Show day',
				desc: 'Show the day of the month from a date property ahead of the name, such as 11 for 2026-11-11.',
				control: { type: 'toggle', key: 'showDay' },
			},
			{
				name: 'Date property',
				desc: 'Frontmatter property that holds the date.',
				visible: () => this.plugin.settings.showDay,
				control: {
					type: 'text',
					key: 'dateProperty',
					placeholder: DEFAULT_SETTINGS.dateProperty,
					validate: validateProperty,
				},
			},
			{
				name: 'Show category',
				desc: 'Show a category property ahead of the name.',
				control: { type: 'toggle', key: 'showCategory' },
			},
			{
				name: 'Category property',
				desc: 'Frontmatter property that holds the category.',
				visible: () => this.plugin.settings.showCategory,
				control: {
					type: 'text',
					key: 'categoryProperty',
					placeholder: DEFAULT_SETTINGS.categoryProperty,
					validate: validateProperty,
				},
			},
			{
				name: 'Sort by date, category, and title',
				desc: 'When the file explorer is sorted by name, order files by date when days are shown, then by category when categories are shown, then by their displayed title. Files without a date or category go after the ones that have it.',
				visible: () =>
					this.plugin.settings.showTitles ||
					this.plugin.settings.showDay ||
					this.plugin.settings.showCategory,
				control: { type: 'toggle', key: 'sortByLabel' },
			},
		];
	}

	override async setControlValue(
		key: string,
		value: unknown,
	): Promise<void> {
		await this.plugin.updateSetting(key, value);

		// Toggling indicators or labels changes which rows are visible, so
		// re-evaluate the `visible` predicates.
		this.update();
	}
}
