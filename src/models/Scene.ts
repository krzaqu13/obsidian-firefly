export type SceneStatus =
	| 'idea'
	| 'outlined'
	| 'draft'
	| 'written'
	| 'revised'
	| 'final'
	| 'todo'
	| 'working'
	| 'complete'
	| (string & {});

export type TimelineMode = 'linear' | 'parallel' | 'flashback' | 'flashforward' | 'interlude';

export const TIMELINE_MODES: TimelineMode[] = ['linear', 'parallel', 'flashback', 'flashforward', 'interlude'];

export const TIMELINE_MODE_LABELS: Record<TimelineMode, string> = {
	linear: 'Liniowy',
	parallel: 'Równoległy',
	flashback: 'Retrospekcja (Flashback)',
	flashforward: 'Wizja przyszłości (Flashforward)',
	interlude: 'Interludium',
};

export interface Scene {
	filePath: string;
	title: string;
	subtitle?: string;
	id?: string;
	sceneClass?: string;
	act?: number | string;
	chapter?: number | string;
	sequence?: number;
	chronologicalOrder?: number | string;
	pov?: string;
	characters?: string[];
	location?: string;
	status?: SceneStatus;
	conflict?: string;
	shift?: string;
	emotion?: string;
	intensity?: number;
	wordcount?: number;
	charcount?: number;
	target_wordcount?: number;
	tags?: string[];
	subplots?: string[];
	beat?: string;
	synopsis?: string;
	summary?: string;
	pendingEdits?: string;
	questions?: string | string[];
	iteration?: number;
	when?: string;
	date?: string;
	storyDate?: string;
	storyTime?: string;
	timeline_mode?: TimelineMode | string;
	timeline_strand?: string;
	arcAnchor?: boolean;
	inactive?: boolean;
	payoff_scenes?: string[];
	setup_scenes?: string[];
	notes?: string;
	body?: string;
}

export const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
	idea:     { label: 'Pomysł',       color: '#9E9E9E', icon: 'lightbulb'    },
	outlined: { label: 'Zarys',        color: '#2196F3', icon: 'list'         },
	draft:    { label: 'Szkic',        color: '#FF9800', icon: 'pencil'       },
	written:  { label: 'Napisane',     color: '#4CAF50', icon: 'file-text'    },
	revised:  { label: 'Poprawki',     color: '#9C27B0', icon: 'refresh-cw'   },
	final:    { label: 'Finał',        color: '#F44336', icon: 'check-circle' },
	// Radial Timeline compatibility:
	todo:     { label: 'Do zrobienia', color: '#607D8B', icon: 'clock'        },
	working:  { label: 'W trakcie',   color: '#FF9800', icon: 'pencil'       },
	complete: { label: 'Ukończone',   color: '#4CAF50', icon: 'check-circle' },
};

export const STATUS_ORDER: SceneStatus[] = [
	'idea', 'todo', 'outlined', 'working', 'draft', 'written', 'revised', 'complete', 'final'
];

export function getStatusCfg(status?: string) {
	const key = (status ?? 'idea').toLowerCase().trim();
	return STATUS_CONFIG[key] ?? { label: status ?? '?', color: '#888', icon: 'circle' };
}

export interface BoardColumn {
	id: string;
	title: string;
	scenes: Scene[];
}

