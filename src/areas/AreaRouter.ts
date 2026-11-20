import type { AreaId } from '../constants';

export interface TabDef {
	id: string;
	label: string;
	icon: string;
}

export const TABS_BY_AREA: Record<AreaId, TabDef[]> = {
	home: [{ id: 'overview', label: 'Przegląd', icon: 'layout-dashboard' }],
	writing: [
		{ id: 'board', label: 'Board', icon: 'columns-2' },
		{ id: 'timeline', label: 'Oś czasu', icon: 'clock' },
		{ id: 'manuscript', label: 'Manuskrypt', icon: 'book-open' },
	],
	worldbuilding: [
		{ id: 'codex', label: 'Kodeks', icon: 'book-marked' },
		{ id: 'characters', label: 'Postacie', icon: 'users' },
		{ id: 'locations', label: 'Miejsca', icon: 'map-pin' },
	],
	plotgrid: [
		{ id: 'plotgrid', label: 'PlotGrid', icon: 'grid-3x3' },
		{ id: 'beats', label: 'Beats', icon: 'milestone' },
		{ id: 'scenes', label: 'Scenes', icon: 'clapperboard' },
		{ id: 'arcs', label: 'Arcs', icon: 'trending-up' },
		{ id: 'subplots', label: 'Subplots', icon: 'git-branch' },
		{ id: 'mechanics', label: 'Mechanics', icon: 'sliders-horizontal' },
		{ id: 'secrets', label: 'Secrets', icon: 'key' },
	],
	connections: [
		{ id: 'story-graph', label: 'Story Graph', icon: 'activity' },
		{ id: 'plotlines', label: 'Plotlines', icon: 'git-branch' },
		{ id: 'graph', label: 'Graph', icon: 'share-2' },
	],
	dashboard: [{ id: 'stats', label: 'Statystyki', icon: 'bar-chart-2' }],
};

export function getActiveTab(areaId: AreaId, activeTabId?: string): TabDef | undefined {
	const targetAreaId = (areaId as string) === 'databases' ? 'plotgrid' : areaId;
	const tabs = TABS_BY_AREA[targetAreaId] ?? [];
	return tabs.find(t => t.id === activeTabId) ?? tabs[0];
}
