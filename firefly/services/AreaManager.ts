import type SceneCardsPlugin from '../../main';
import type { AreaConfig, NavState } from '../models/Area';
import type { AreaId } from '../constants';
import {
    AREA_ORDER,
    FIREFLY_EVENT_AREA_CHANGED,
    FIREFLY_EVENT_TAB_CHANGED,
} from '../constants';

const NAV_STATE_KEY = 'firefly-nav-state';

const DEFAULT_AREA_CONFIGS: AreaConfig[] = [
    {
        id: 'home',
        label: 'Strona główna',
        icon: 'home',
        rootFolder: '',
        allowedFileTypes: [],
        allowedTags: [],
    },
    {
        id: 'writing',
        label: 'Pisanie',
        icon: 'pen-line',
        rootFolder: '',
        allowedFileTypes: [],
        allowedTags: [],
    },
    {
        id: 'worldbuilding',
        label: 'Świat',
        icon: 'globe-2',
        rootFolder: '',
        allowedFileTypes: [],
        allowedTags: [],
    },
    {
        id: 'databases',
        label: 'Bazy danych',
        icon: 'database',
        rootFolder: '',
        allowedFileTypes: [],
        allowedTags: [],
    },
    {
        id: 'connections',
        label: 'Połączenia',
        icon: 'share-2',
        rootFolder: '',
        allowedFileTypes: [],
        allowedTags: [],
    },
    {
        id: 'dashboard',
        label: 'Dashboard',
        icon: 'layout-dashboard',
        rootFolder: '',
        allowedFileTypes: [],
        allowedTags: [],
    },
];

export class AreaManager {
    private plugin: SceneCardsPlugin;
    private navState: NavState;

    constructor(plugin: SceneCardsPlugin) {
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
        const saved = (this.plugin.settings as any).areaConfigs?.find(
            (c: AreaConfig) => c.id === id,
        );
        return saved ?? DEFAULT_AREA_CONFIGS.find(c => c.id === id) ?? DEFAULT_AREA_CONFIGS[0];
    }

    getAllAreaConfigs(): AreaConfig[] {
        return AREA_ORDER.map(id => this.getAreaConfig(id));
    }

    getActiveTabForArea(areaId: AreaId): string {
        return this.navState.activeTabPerArea[areaId] ?? '';
    }

    setCurrentArea(id: AreaId): void {
        if (this.navState.currentAreaId === id) return;
        this.navState.currentAreaId = id;
        this.persistNavState();
        this.plugin.app.workspace.trigger(FIREFLY_EVENT_AREA_CHANGED as any, id);
    }

    setActiveTab(areaId: AreaId, tabId: string): void {
        this.navState.activeTabPerArea[areaId] = tabId;
        this.persistNavState();
        this.plugin.app.workspace.trigger(
            FIREFLY_EVENT_TAB_CHANGED as any,
            { areaId, tabId },
        );
    }

    private loadNavState(): NavState {
        try {
            const raw = window.localStorage.getItem(NAV_STATE_KEY);
            if (raw) return JSON.parse(raw) as NavState;
        } catch {
            // localStorage unavailable or corrupted
        }
        return {
            currentAreaId: 'home',
            activeTabPerArea: {},
        };
    }

    private persistNavState(): void {
        try {
            window.localStorage.setItem(
                NAV_STATE_KEY,
                JSON.stringify(this.navState),
            );
        } catch {
            // localStorage can be unavailable in some contexts
        }
    }
}
