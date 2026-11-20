import type {
	ArcElementDef,
	BeatDef,
	FieldMap,
	ProjectStructureSettings,
	StructurePresetDefinition,
	StructureProfile,
} from './StructureProfile';

export const DEFAULT_FIELD_MAP: FieldMap = {
	'Class': 'Class',
	'Beat Model': 'Beat Model',
	'Act': 'Act',
	'Range': 'Range',
	'Order': 'Order',
	'StoryTension': 'StoryTension',
	'StoryPacing': 'StoryPacing',
	'Purpose': 'Purpose',
	'Arc': 'Arc',
	'Character': 'Character',
	'Color': 'Color',
	'Lie': 'Lie',
	'Truth': 'Truth',
	'Want': 'Want',
	'Need': 'Need',
	'Ghost': 'Ghost',
	'LieActive': 'LieActive',
	'LieTested': 'LieTested',
	'TruthContact': 'TruthContact',
	'TruthAccepted': 'TruthAccepted',
};

export const SANDERSON_9_BEATS: BeatDef[] = [
	{ key: 'hook', name: 'Haczyk', act: 1, range: '0-10', purpose: 'Zaczepienie i zaangażowanie czytelnika.', enabled: true, order: 1 },
	{ key: 'call', name: 'Wezwanie', act: 1, range: '10-20', purpose: 'Początek drogi i wprowadzenie konfliktu.', enabled: true, order: 2 },
	{ key: 'new-world', name: 'Nowy Świat', act: 1, range: '20-35', purpose: 'Bohater wchodzi w nową rzeczywistość i zasady gry.', enabled: true, order: 3 },
	{ key: 'threat', name: 'Zagrożenie', act: 2, range: '35-50', purpose: 'Narastanie presji i konfliktu.', enabled: true, order: 4 },
	{ key: 'midpoint', name: 'Midpoint — Objawienie', act: 2, range: '50-60', purpose: 'Punkt zwrotny rozpoznający prawdę.', enabled: true, order: 5 },
	{ key: 'escalation', name: 'Eskalacja', act: 2, range: '60-75', purpose: 'Wzrost ryzyka i konieczność działania.', enabled: true, order: 6 },
	{ key: 'lowest-point', name: 'Najniższy punkt', act: 3, range: '75-85', purpose: 'Upadek i utrata nadziei.', enabled: true, order: 7 },
	{ key: 'climax', name: 'Kulminacja / Katharsis', act: 3, range: '85-92', purpose: 'Decydująca konfrontacja i ostateczny wybór.', enabled: true, order: 8 },
	{ key: 'resolution', name: 'Rozwiązanie — Nowa normalność', act: 3, range: '92-100', purpose: 'Skutek, zamknięcie i przemiana.', enabled: true, order: 9 },
];

export const SANDERSON_9_ARC_ELEMENTS: ArcElementDef[] = [
	{ key: 'lie', name: 'Kłamstwo', kind: 'text' },
	{ key: 'truth', name: 'Prawda', kind: 'text' },
	{ key: 'want', name: 'Pragnienie (Want)', kind: 'text' },
	{ key: 'need', name: 'Potrzeba (Need)', kind: 'text' },
	{ key: 'ghost', name: 'Duch', kind: 'anchor', multi: false },
	{ key: 'lieActive', name: 'Kłamstwo aktywne', kind: 'anchor', multi: true },
	{ key: 'lieTested', name: 'Kłamstwo testowane', kind: 'anchor', multi: true },
	{ key: 'truthContact', name: 'Pierwszy kontakt z Prawdą', kind: 'anchor', multi: true },
	{ key: 'truthAccepted', name: 'Prawda przyjęta', kind: 'anchor', multi: true },
];

export const SANDERSON_9_DEFAULT: StructurePresetDefinition = {
	id: 'sanderson-9',
	name: 'Sanderson — 9 punktów',
	version: 1,
	basedOn: 'sanderson-9',
	description: 'Struktura oparta na 9 punktach narracji Sandersona: zaczątek, wzmocnienie konfliktu, midpoint, największy upadek i rozwiązanie.',
	acts: [
		{ id: 1, name: 'Akt I' },
		{ id: 2, name: 'Akt II' },
		{ id: 3, name: 'Akt III' },
	],
	beats: SANDERSON_9_BEATS,
	arcElements: SANDERSON_9_ARC_ELEMENTS,
	fieldMap: DEFAULT_FIELD_MAP,
	folders: {
		beats: 'Beaty',
		scenes: 'Sceny',
		arcs: 'Arci',
		subplots: 'Subploty',
	},
	naming: {
		beatPattern: '{order} {name}',
		orderPadding: 2,
	},
};

export const EMPTY_STRUCTURE_PRESET: StructurePresetDefinition = {
	id: 'empty-structure',
	name: 'Pusty',
	version: 1,
	basedOn: 'empty-structure',
	description: 'Pusta struktura projektu bez gotowych beatów. Umożliwia zbudowanie własnej, dostosowanej ścieżki narracyjnej.',
	acts: [
		{ id: 1, name: 'Akt I' },
		{ id: 2, name: 'Akt II' },
		{ id: 3, name: 'Akt III' },
	],
	beats: [],
	arcElements: [],
	fieldMap: DEFAULT_FIELD_MAP,
	folders: {
		beats: 'Beaty',
		scenes: 'Sceny',
		arcs: 'Arci',
		subplots: 'Subploty',
	},
	naming: {
		beatPattern: '{order} {name}',
		orderPadding: 2,
	},
};

export const ALL_STRUCTURE_PRESETS: StructurePresetDefinition[] = [
	SANDERSON_9_DEFAULT,
	EMPTY_STRUCTURE_PRESET,
];

export function cloneStructureProfile(profile: StructureProfile): StructureProfile {
	return JSON.parse(JSON.stringify(profile)) as StructureProfile;
}

export function createProfileFromPreset(preset: StructurePresetDefinition): StructureProfile {
	const base = cloneStructureProfile(preset);
	base.id = `${preset.id}-${Date.now().toString(36)}`;
	base.basedOn = preset.id;
	base.createdAt = Date.now();
	base.updatedAt = Date.now();
	base.beats = base.beats.map((beat, index) => ({
		...beat,
		key: beat.key ?? `beat-${index + 1}`,
		enabled: beat.enabled ?? true,
		order: beat.order ?? index + 1,
	}));
	return base;
}

export function createDefaultStructureSettings(): ProjectStructureSettings {
	const defaultProfile = createProfileFromPreset(SANDERSON_9_DEFAULT);
	return {
		profiles: [defaultProfile],
		activeProfileId: defaultProfile.id,
		storageMode: 'manifest',
	};
}
