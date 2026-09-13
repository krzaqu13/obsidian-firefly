import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type SceneCardsPlugin from '../../main';
import {
    FIREFLY_MAIN_VIEW_TYPE,
    FIREFLY_EVENT_AREA_CHANGED,
    AREA_ORDER,
} from '../constants';
import type { AreaId } from '../constants';
import { WritingChapterList } from './areas/WritingChapterList';

const TABS_BY_AREA: Record<AreaId, Array<{ id: string; label: string; icon: string }>> = {
    home: [
        { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
    ],
    writing: [
        { id: 'chapter-list', label: 'Rozdziały', icon: 'list' },
        { id: 'timeline', label: 'Oś czasu', icon: 'clock' },
        { id: 'manuscript', label: 'Manuskrypt', icon: 'book-open' },
        { id: 'stats', label: 'Statystyki', icon: 'bar-chart-2' },
    ],
    worldbuilding: [
        { id: 'characters', label: 'Postacie', icon: 'users' },
        { id: 'locations', label: 'Miejsca', icon: 'map-pin' },
        { id: 'codex', label: 'Kodeks', icon: 'book-open' },
    ],
    databases: [
        { id: 'db-list', label: 'Bazy danych', icon: 'database' },
    ],
    connections: [
        { id: 'graph', label: 'Graf', icon: 'share-2' },
    ],
    dashboard: [
        { id: 'overview', label: 'Przegląd', icon: 'activity' },
    ],
};

export class FireflyMainView extends ItemView {
    private plugin: SceneCardsPlugin;
    private sidebarEl: HTMLElement | null = null;
    private tabBarEl: HTMLElement | null = null;
    private contentEl: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: SceneCardsPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return FIREFLY_MAIN_VIEW_TYPE; }
    getDisplayText(): string { return 'Firefly'; }
    getIcon(): string { return 'feather'; }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('firefly-main-view');

        const rootEl = container.createDiv('firefly-root');
        this.sidebarEl = rootEl.createDiv('firefly-area-sidebar');
        const rightPanel = rootEl.createDiv('firefly-right-panel');
        this.tabBarEl = rightPanel.createDiv('firefly-tab-bar');
        this.contentEl = rightPanel.createDiv('firefly-content');

        this.renderAreaSidebar();

        const currentAreaId = this.plugin.areaManager.getCurrentAreaId();
        this.renderTabBar(currentAreaId);
        this.renderContent(currentAreaId);

        this.registerEvent(
            this.app.workspace.on(FIREFLY_EVENT_AREA_CHANGED as any, (areaId: AreaId) => {
                this.onAreaChanged(areaId);
            }),
        );

        await this.plugin.openFireflyFileBrowser();
    }

    async onClose(): Promise<void> {
        this.sidebarEl = null;
        this.tabBarEl = null;
        this.contentEl = null;
    }

    private renderAreaSidebar(): void {
        if (!this.sidebarEl) return;
        this.sidebarEl.empty();

        const currentAreaId = this.plugin.areaManager.getCurrentAreaId();

        for (const areaId of AREA_ORDER) {
            const config = this.plugin.areaManager.getAreaConfig(areaId);
            const isActive = areaId === currentAreaId;
            const btn = this.sidebarEl.createDiv({
                cls: `firefly-area-btn${isActive ? ' is-active' : ''}`,
            });

            const iconEl = btn.createSpan({ cls: 'firefly-area-icon' });
            setIcon(iconEl, config.icon);

            btn.setAttribute('aria-label', config.label);
            btn.setAttribute('data-tooltip-position', 'right');

            btn.addEventListener('click', () => {
                this.plugin.areaManager.setCurrentArea(areaId);
            });
        }
    }

    private renderTabBar(areaId: AreaId): void {
        if (!this.tabBarEl) return;
        this.tabBarEl.empty();

        const tabs = TABS_BY_AREA[areaId] ?? [];
        const activeTabId = this.plugin.areaManager.getActiveTabForArea(areaId);

        for (const tab of tabs) {
            const isActive = tab.id === activeTabId || (!activeTabId && tab === tabs[0]);

            const btn = this.tabBarEl.createEl('button', {
                cls: `firefly-tab-btn${isActive ? ' is-active' : ''}`,
            });

            const iconEl = btn.createSpan({ cls: 'firefly-tab-icon' });
            setIcon(iconEl, tab.icon);
            btn.createSpan({ cls: 'firefly-tab-label', text: tab.label });

            btn.addEventListener('click', () => {
                this.plugin.areaManager.setActiveTab(areaId, tab.id);
                this.renderTabBar(areaId);
                this.renderContent(areaId);
            });
        }
    }

    private renderContent(areaId: AreaId): void {
        if (!this.contentEl) return;
        this.contentEl.empty();

        const tabs = TABS_BY_AREA[areaId] ?? [];
        const activeTabId = this.plugin.areaManager.getActiveTabForArea(areaId);
        const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];

        if (!activeTab) {
            this.contentEl.createDiv({
                cls: 'firefly-empty-state',
                text: 'Ten obszar nie ma jeszcze żadnych zakładek.',
            });
            return;
        }

        if (activeTab.id === 'chapter-list') {
            const chapterList = new WritingChapterList(this.plugin);
            chapterList.render(this.contentEl);
            return;
        }

        const placeholder = this.contentEl.createDiv('firefly-content-placeholder');
        const iconEl = placeholder.createDiv({ cls: 'firefly-placeholder-icon' });
        setIcon(iconEl, activeTab.icon);
        placeholder.createEl('h2', { text: activeTab.label });
        placeholder.createEl('p', {
            text: `Zakładka "${activeTab.label}" — do zaimplementowania.`,
            cls: 'firefly-placeholder-text',
        });
    }

    private onAreaChanged(areaId: AreaId): void {
        if (this.sidebarEl) {
            const buttons = this.sidebarEl.querySelectorAll('.firefly-area-btn');
            buttons.forEach((btn, i) => {
                const btnAreaId = AREA_ORDER[i];
                btn.classList.toggle('is-active', btnAreaId === areaId);
            });
        }

        this.renderTabBar(areaId);
        this.renderContent(areaId);
    }
}
