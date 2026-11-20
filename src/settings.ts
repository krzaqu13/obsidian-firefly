import { App, PluginSettingTab } from 'obsidian';
import type FireflyPlugin from './main';
import type { AreaConfig } from './models/Area';
import type { StoryBeatsSettings, BeatDefinition } from './models/StoryBeats';
import type { ProjectStructureSettings } from './models/StructureProfile';
import { createDefaultStructureSettings } from './models/StructurePresets';
import { BooksSettingSection } from './views/books/BooksSettingSection';

export interface SavedBeatModel {
	id: string;
	name: string;
	beats: BeatDefinition[];
	createdAt?: number;
}

export interface FireflySettings {
	defaultArea?: string;
	areaConfigs?: AreaConfig[];
	storyBeats?: StoryBeatsSettings;
	projectStructure?: ProjectStructureSettings;
	plotGrid?: Record<string, PlotGridState>;
	customBeatModels?: SavedBeatModel[];
}

export interface PlotGridState {
	columns: { id: string; name: string; kind?: 'subplot' | 'arc' | 'custom'; sourceKey?: string }[];
	cells: Record<string, Record<string, string>>;
	hiddenMappings?: string[];
}

export const DEFAULT_SETTINGS: FireflySettings = {
	defaultArea: 'writing',
	areaConfigs: undefined,
	projectStructure: createDefaultStructureSettings(),
	customBeatModels: [],
};

export class FireflySettingTab extends PluginSettingTab {
	plugin: FireflyPlugin;

	constructor(app: App, plugin: FireflyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new BooksSettingSection(containerEl, this.plugin).render();
	}
}
