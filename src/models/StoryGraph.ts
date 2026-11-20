/**
 * Story Graph — modele domenowe
 *
 * Trzy typy plików rozróżniane przez Class: w frontmatterze:
 *   - StoryBeat  (Class: StoryBeat)
 *   - Scene      (Class: Scene)
 */

// ── Story Beat ────────────────────────────────────────────────────────────────

export interface StoryBeat {
	filePath: string;
	title: string;
	act: number;
	order: number;
	storyTension: number;   // 1–10, oś Y w trybie Tension
	storyPacing: number;    // 1–10, oś Y w trybie Pacing
	range?: string;
	model?: string;         // np. "Save the Cat"
	synopsis?: string;
	status?: string;        // Draft | Active | Done
}

// ── Graph Scene ───────────────────────────────────────────────────────────────

export interface GraphScene {
	filePath: string;
	title: string;
	beatTitle?: string;      // rozwiązany tytuł beata (po wikilinku)
	beat?: StoryBeat;        // powiązany beat (po rozwiązaniu)
	act?: number;
	chapter?: number | string;
	order: number;           // Order w ramach beata — wyznacza X
	pov?: string;
	status?: string;
	subplot?: string[];
	subplotTension?: number; // 1–10
	subplotPacing?: number;  // 1–10
	scenePacing?: number;
	synopsis?: string;
	words?: number;
	/** Pozycja X na wykresie (0–1 zakres globalny) */
	xNorm?: number;
	/** Interpolowana wartość Y na linii fabularnej */
	yInterp?: number;
}

// ── Subplot line ──────────────────────────────────────────────────────────────

export interface SubplotPoint {
	scene: GraphScene;
	xNorm: number;
	yValue: number;
}

export interface SubplotLine {
	name: string;
	color: string;
	dashStyle: string; // SVG stroke-dasharray lub 'none'
	points: SubplotPoint[];
}

// ── Chart data ────────────────────────────────────────────────────────────────

export type GraphYMode = 'tension' | 'pacing';

export interface BeatSegment {
	beat: StoryBeat;
	scenes: GraphScene[];
	xStart: number;
	xEnd: number;
	act: number;
	isOrphaned?: boolean;
}

export interface StoryGraphData {
	beats: StoryBeat[];
	scenes: GraphScene[];
	orphanedScenes: GraphScene[];
	segments: BeatSegment[];
	subplotLines: SubplotLine[];
	acts: number[];
	totalPlotWidth?: number;
}

// ── Paleta subplotów ──────────────────────────────────────────────────────────

export const SUBPLOT_COLORS = [
	'#d4b483', // Champagne Sand
	'#7ea9c8', // Ice Slate Blue
	'#7fa99b', // Muted Celadon / Sage
	'#c88279', // Dusty Terracotta
	'#9d8fc6', // Slate Lavender
	'#639fab', // Cool Steel Aqua
];

export const SUBPLOT_DASH_STYLES = [
	'none',
	'6 3',
	'2 3',
	'4 4',
];
