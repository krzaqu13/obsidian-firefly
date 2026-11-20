export interface BeatDefinition {
	id?: string;
	name: string;
	act: number;
	purpose?: string;
	range?: string;
	placement?: string;
}

export type BeatSourceKind = 'builtin' | 'starter' | 'saved' | 'blank';
export type BeatLibraryCategory = 'narrative' | 'format' | 'genre' | 'blank';

export interface BeatSystemConfig {
	beatYamlAdvanced?: string;
	beatHoverMetadataFields?: { key: string; label: string; icon: string; enabled: boolean }[];
}

export interface LoadedBeatTab {
	tabId: string;
	sourceKind: BeatSourceKind;
	sourceId?: string;
	name: string;
	description?: string;
	beats: BeatDefinition[];
	config?: BeatSystemConfig;
	dirty?: boolean;
}

export interface BeatLibraryItem {
	id: string;
	kind: BeatSourceKind;
	category: BeatLibraryCategory;
	icon: string;
	name: string;
	description: string;
	beats: BeatDefinition[];
	config?: BeatSystemConfig;
}

export interface StoryBeatsSettings {
	loadedTabs: LoadedBeatTab[];
	activeTabId?: string;
	actCount?: number;
}
