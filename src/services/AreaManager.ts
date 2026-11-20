import type FireflyPlugin from '../main';
import type { AreaConfig, NavState } from '../models/Area';
import type { AreaId } from '../constants';
import { AREA_ORDER, FIREFLY_EVENT_AREA_CHANGED, FIREFLY_EVENT_TAB_CHANGED } from '../constants';

const NAV_STATE_KEY = 'firefly-nav-state';

const DEFAULT_AREA_CONFIGS: AreaConfig[] = [
	{ id: 'home',          label: 'Strona główna', icon: 'home',             rootFolder: '', allowedFileTypes: [], allowedTags: [] },
	{ id: 'writing',       label: 'Pisanie',       icon: 'pen-line',         rootFolder: '', allowedFileTypes: [], allowedTags: [] },
	{ id: 'worldbuilding', label: 'Świat',          icon: 'globe-2',          rootFolder: '', allowedFileTypes: [], allowedTags: [] },
	{ id: 'plotgrid',      label: 'PlotGrid',      icon: 'grid-3x3',         rootFolder: '', allowedFileTypes: [], allowedTags: [] },
	{ id: 'connections',   label: 'Połączenia',    icon: 'share-2',          rootFolder: '', allowedFileTypes: [], allowedTags: [] },
	{ id: 'dashboard',     label: 'Dashboard',     icon: 'layout-dashboard', rootFolder: '', allowedFileTypes: [], allowedTags: [] },
];

export class AreaManager {
	private plugin: FireflyPlugin;
	private navState: NavState;

	constructor(plugin: FireflyPlugin) {
		this.plugin = plugin;
		this.navState = this.loadNavState();
	}

	getCurrentAreaId(): AreaId {
		return this.navState.currentAreaId;
	}

	getCurrentAreaConfig(): AreaConfig {
		return this.getAreaConfig(this.navState.currentAreaId);
	}

	getAreaConfig(id: AreaId): AreaConfig {
		const targetId = (id as string) === 'databases' ? 'plotgrid' : id;
		const saved = (this.plugin.settings as any).areaConfigs?.find(
			(c: AreaConfig) => c.id === targetId,
		);
		return saved ?? DEFAULT_AREA_CONFIGS.find(c => c.id === targetId) ?? DEFAULT_AREA_CONFIGS[0]!;
	}

	getActiveTabForArea(areaId: AreaId): string {
		const targetId = (areaId as string) === 'databases' ? 'plotgrid' : areaId;
		return this.navState.activeTabPerArea[targetId] ?? '';
	}

	setCurrentArea(id: AreaId): void {
		const targetId = (id as string) === 'databases' ? 'plotgrid' : id;
		if (this.navState.currentAreaId === targetId) return;
		this.navState.currentAreaId = targetId;
		this.persistNavState();
		this.plugin.app.workspace.trigger(FIREFLY_EVENT_AREA_CHANGED as any, targetId);
	}

	setActiveTab(areaId: AreaId, tabId: string): void {
		const targetId = (areaId as string) === 'databases' ? 'plotgrid' : areaId;
		this.navState.activeTabPerArea[targetId] = tabId;
		this.persistNavState();
		this.plugin.app.workspace.trigger(FIREFLY_EVENT_TAB_CHANGED as any, { areaId: targetId, tabId });
	}

	private loadNavState(): NavState {
		try {
			const raw = window.localStorage.getItem(NAV_STATE_KEY);
			if (raw) {
				const state = JSON.parse(raw) as NavState;
				if ((state.currentAreaId as string) === 'databases') {
					state.currentAreaId = 'plotgrid';
				}
				return state;
			}
		} catch { /* ignore */ }
		return { currentAreaId: 'home', activeTabPerArea: {} };
	}

	private persistNavState(): void {
		try {
			window.localStorage.setItem(NAV_STATE_KEY, JSON.stringify(this.navState));
		} catch { /* ignore */ }
	}
}
