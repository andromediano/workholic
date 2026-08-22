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
}

export const DEFAULT_SETTINGS: WorkholicSettings = {
	property: 'status',
	showIndicators: true,
	indicatorStyle: 'icon',
	dimCompleted: true,
	sortByStatus: true,
};

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
					validate: (value: string) =>
						value.trim().length > 0
							? undefined
							: 'Enter a property name.',
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
		];
	}

	override async setControlValue(
		key: string,
		value: unknown,
	): Promise<void> {
		await this.plugin.updateSetting(key, value);

		// Toggling indicators changes which rows are visible, so re-evaluate
		// the `visible` predicates.
		this.update();
	}
}
