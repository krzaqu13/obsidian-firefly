import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type SceneCardsPlugin from '../../main';
import {
    FIREFLY_MAIN_VIEW_TYPE,
    FIREFLY_EVENT_AREA_CHANGED,
    FIREFLY_EVENT_TAB_CHANGED,
    AREA_ORDER,
} from '../constants';
import type { AreaId } from '../constants';

// Adaptery obszarów
import { WritingChapterList }    from './areas/WritingChapterList';
import { WritingBoard }          from './areas/WritingBoard';
import { WritingPlotgrid }       from './areas/WritingPlotgrid';
import { WritingTimeline }       from './areas/WritingTimeline';
import { WritingManuscript }     from './areas/WritingManuscript';
import { WorldbuildingCodex }    from './areas/WorldbuildingCodex';
import { ConnectionsPlotlines }  from './areas/ConnectionsPlotlines';
import { DashboardStats }        from './areas/DashboardStats';

// ─── Definicja zakładek per obszar ───────────────────────────────────────────

interface TabDef {
    id: string;
    label: string;
    icon: string;
}

const TABS_BY_AREA: Record<AreaId, TabDef[]> = {
    home: [
        { id: 'overview', label: 'Przegląd',  icon: 'layout-dashboard' },
    ],
    writing: [
        { id: 'board',      label: 'Board',      icon: 'layout-dashboard' },
        { id: 'plotgrid',   label: 'Plotgrid',   icon: 'grid-3x3'         },
        { id: 'timeline',   label: 'Oś czasu',   icon: 'clock'            },
        { id: 'manuscript', label: 'Manuskrypt',  icon: 'book-open'        },
    ],
    worldbuilding: [
        { id: 'codex', label: 'Kodeks', icon: 'book-marked' },
    ],
    databases: [
        { id: 'db-list', label: 'Bazy danych', icon: 'database' },
    ],
    connections: [
        { id: 'plotlines', label: 'Plotlines', icon: 'git-branch' },
    ],
    dashboard: [
        { id: 'stats', label: 'Statystyki', icon: 'bar-chart-2' },
    ],
};

// ─── Klasa widoku ─────────────────────────────────────────────────────────────

export class FireflyMainView extends ItemView {
    private plugin: SceneCardsPlugin;
    private sidebarEl: HTMLElement | null = null;
    private topbarEl: HTMLElement | null = null;
    private innerSidebarEl: HTMLElement | null = null;
    private mainSectionEl: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: SceneCardsPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return FIREFLY_MAIN_VIEW_TYPE; }
    getDisplayText(): string { return 'Firefly'; }
    getIcon(): string { return 'feather'; }

    async onOpen(): Promise<void> {
        this.containerEl.addClass('firefly-leaf-content');
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('firefly-main-view');

        const rootEl = container.createDiv('firefly-root');

        // Zewnętrzny pasek obszarów (48px, pełna wysokość)
        this.sidebarEl = rootEl.createDiv('firefly-area-sidebar');

        // Wewnętrzny sidebar (zakładki obszaru, pełna wysokość)
        this.innerSidebarEl = rootEl.createDiv('firefly-inner-sidebar');

        // Prawa kolumna: topbar + main section
        const rightContent = rootEl.createDiv('firefly-right-content');
        this.topbarEl = rightContent.createDiv('firefly-topbar');
        this.mainSectionEl = rightContent.createDiv('firefly-main-section');

        this.renderAreaSidebar();
        this.buildTopbar(this.topbarEl);
        this.buildInnerSidebar(this.innerSidebarEl);
        this.buildMainSection(this.mainSectionEl);

        this.registerEvent(
            this.app.workspace.on(FIREFLY_EVENT_AREA_CHANGED as any, (areaId: AreaId) => {
                this.onAreaChanged(areaId);
            }),
        );

        this.registerEvent(
            this.app.workspace.on(FIREFLY_EVENT_TAB_CHANGED as any, ({ areaId, tabId }: { areaId: AreaId; tabId: string }) => {
                if (areaId === this.plugin.areaManager.getCurrentAreaId()) {
                    this.refreshInnerSidebarActiveState(tabId);
                    if (this.mainSectionEl) {
                        this.buildMainSection(this.mainSectionEl);
                    }
                }
            }),
        );

        await this.plugin.openFireflyFileBrowser();
    }

    async onClose(): Promise<void> {
        this.sidebarEl = null;
        this.topbarEl = null;
        this.innerSidebarEl = null;
        this.mainSectionEl = null;
    }

    // ─── Area sidebar ──────────────────────────────────────────────────────────

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

    private onAreaChanged(areaId: AreaId): void {
        // Aktualizuj aktywność przycisków obszarów
        if (this.sidebarEl) {
            const buttons = this.sidebarEl.querySelectorAll('.firefly-area-btn');
            buttons.forEach((btn, i) => {
                btn.classList.toggle('is-active', AREA_ORDER[i] === areaId);
            });
        }

        // Przebuduj inner sidebar i main section dla nowego obszaru
        if (this.innerSidebarEl) {
            this.buildInnerSidebar(this.innerSidebarEl);
        }
        if (this.mainSectionEl) {
            this.buildMainSection(this.mainSectionEl);
        }
    }

    // ─── Topbar ────────────────────────────────────────────────────────────────

    private buildTopbar(el: HTMLElement): void {
        const left = el.createDiv('firefly-topbar-left');

        const viewConfigs = [
            { label: 'List',     icon: 'list',       isActive: true  },
            { label: 'Tree',     icon: 'git-branch',  isActive: false },
            { label: 'Kanban',   icon: 'columns-2',   isActive: false },
            { label: 'Calendar', icon: 'calendar',    isActive: false },
        ];

        for (const cfg of viewConfigs) {
            const btn = left.createEl('button', {
                cls: `firefly-view-btn${cfg.isActive ? ' is-active' : ''}`,
            });
            setIcon(btn.createSpan({ cls: 'firefly-view-btn-icon' }), cfg.icon);
            btn.createSpan({ cls: 'firefly-view-btn-label', text: cfg.label });
        }

        const right = el.createDiv('firefly-topbar-right');
        for (const icon of ['search', 'bell', 'settings']) {
            const btn = right.createEl('button', { cls: 'firefly-topbar-icon-btn' });
            setIcon(btn.createSpan(), icon);
        }
    }

    // ─── Inner sidebar ─────────────────────────────────────────────────────────

    private buildInnerSidebar(el: HTMLElement): void {
        el.empty();

        const areaId   = this.plugin.areaManager.getCurrentAreaId();
        const tabs     = TABS_BY_AREA[areaId] ?? [];
        const activeTabId = this.plugin.areaManager.getActiveTabForArea(areaId) || (tabs[0]?.id ?? '');

        if (tabs.length === 0) {
            el.createDiv({ cls: 'firefly-sidebar-empty', text: 'Brak zakładek' });
            return;
        }

        const section = el.createDiv('firefly-sidebar-section');

        for (const tab of tabs) {
            const isActive = tab.id === activeTabId;
            const div = section.createDiv({
                cls: `firefly-sidebar-item${isActive ? ' is-active' : ''}`,
                attr: { 'data-tab-id': tab.id },
            });
            setIcon(div.createSpan({ cls: 'firefly-sidebar-item-icon' }), tab.icon);
            div.createSpan({ cls: 'firefly-sidebar-item-label', text: tab.label });

            div.addEventListener('click', () => {
                this.plugin.areaManager.setActiveTab(areaId, tab.id);
            });
        }
    }

    /** Odświeża tylko klasę is-active na elementach inner sidebar bez pełnego rebuild */
    private refreshInnerSidebarActiveState(activeTabId: string): void {
        if (!this.innerSidebarEl) return;
        this.innerSidebarEl.querySelectorAll('.firefly-sidebar-item').forEach(el => {
            const tabId = el.getAttribute('data-tab-id') ?? '';
            el.classList.toggle('is-active', tabId === activeTabId);
        });
    }

    // ─── Main section ──────────────────────────────────────────────────────────

    private buildMainSection(el: HTMLElement): void {
        el.className = 'firefly-main-section';
        el.empty();

        const areaId = this.plugin.areaManager.getCurrentAreaId();
        const tabs   = TABS_BY_AREA[areaId] ?? [];
        const activeTabId = this.plugin.areaManager.getActiveTabForArea(areaId) || (tabs[0]?.id ?? '');

        switch (areaId) {
            case 'writing':
                this.renderWritingTab(el, activeTabId);
                break;
            case 'worldbuilding':
                this.renderWorldbuildingTab(el, activeTabId);
                break;
            case 'connections':
                this.renderConnectionsTab(el, activeTabId);
                break;
            case 'dashboard':
                this.renderDashboardTab(el, activeTabId);
                break;
            default:
                this.renderEmptyState(el);
        }
    }

    private renderWritingTab(el: HTMLElement, tabId: string): void {
        switch (tabId) {
            case 'board':
                void new WritingBoard(this.leaf, this.plugin, this.plugin.sceneManager).render(el);
                break;
            case 'plotgrid':
                void new WritingPlotgrid(this.leaf, this.plugin).render(el);
                break;
            case 'timeline':
                void new WritingTimeline(this.leaf, this.plugin, this.plugin.sceneManager).render(el);
                break;
            case 'manuscript':
                void new WritingManuscript(this.leaf, this.plugin, this.plugin.sceneManager).render(el);
                break;
            default:
                new WritingChapterList(this.plugin).render(el);
        }
    }

    private renderWorldbuildingTab(el: HTMLElement, tabId: string): void {
        switch (tabId) {
            case 'codex':
                void new WorldbuildingCodex(this.leaf, this.plugin).render(el);
                break;
            default:
                this.renderEmptyState(el);
        }
    }

    private renderConnectionsTab(el: HTMLElement, tabId: string): void {
        switch (tabId) {
            case 'plotlines':
                void new ConnectionsPlotlines(this.leaf, this.plugin, this.plugin.sceneManager).render(el);
                break;
            default:
                this.renderEmptyState(el);
        }
    }

    private renderDashboardTab(el: HTMLElement, tabId: string): void {
        switch (tabId) {
            case 'stats':
                void new DashboardStats(this.leaf, this.plugin, this.plugin.sceneManager).render(el);
                break;
            default:
                this.renderEmptyState(el);
        }
    }

    private renderEmptyState(el: HTMLElement): void {
        const empty = el.createDiv('firefly-empty-state');
        setIcon(empty.createSpan({ cls: 'firefly-empty-icon' }), 'inbox');
        empty.createEl('p', { cls: 'firefly-empty-title',    text: 'Brak elementów' });
        empty.createEl('p', { cls: 'firefly-empty-subtitle', text: 'Wybierz zakładkę po lewej, aby zacząć.' });
    }
}
