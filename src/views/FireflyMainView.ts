import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import { WritingBoard } from '../areas/writing/WritingBoard';
import type { BoardGroupBy, BoardMode } from '../areas/writing/WritingBoard';
import type FireflyPlugin from '../main';
import {
	FIREFLY_MAIN_VIEW_TYPE,
	FIREFLY_EVENT_TAB_CHANGED,
} from '../constants';
import type { AreaId } from '../constants';
import { FireflyLayout } from '../layout/FireflyLayout';
import { TABS_BY_AREA, getActiveTab, type TabDef } from '../areas/AreaRouter';
import { WritingArea } from '../areas/writing/WritingArea';
import { PlotGridArea } from '../areas/plotgrid/PlotGridArea';
import { PlotlinesView } from '../areas/connections/PlotlinesView';
import { StoryGraphView } from '../areas/writing/StoryGraphView';

export class FireflyMainView extends ItemView {
	private plugin: FireflyPlugin;
	public areaId: AreaId = 'writing';

	private layout: FireflyLayout | null = null;
	private topbarEl: HTMLElement | null = null;
	private mainEl: HTMLElement | null = null;
	private activeBoard: WritingBoard | null = null;
	private writingArea: WritingArea | null = null;
	private plotGridArea: PlotGridArea | null = null;
	private plotlinesArea: PlotlinesView | null = null;
	private storyGraphArea: StoryGraphView | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: FireflyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return FIREFLY_MAIN_VIEW_TYPE;
	}

	getDisplayText(): string {
		const config = this.plugin.areaManager?.getAreaConfig(this.areaId);
		return config ? config.label : 'Firefly';
	}

	getIcon(): string {
		const config = this.plugin.areaManager?.getAreaConfig(this.areaId);
		return config?.icon ?? 'feather';
	}

	getState(): any {
		return { areaId: this.areaId };
	}

	async setState(state: any, result: any): Promise<void> {
		if (state?.areaId) {
			this.areaId = state.areaId;
			if (this.mainEl) {
				this.renderMain(this.areaId);
				this.renderTopbar(this.areaId);
			}
		}
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		this.containerEl.addClass('firefly-leaf-content');
		const viewHeader = this.containerEl.querySelector('.view-header') as HTMLElement | null;
		if (viewHeader) viewHeader.style.display = 'none';

		const container = (this.containerEl.children[1] || this.containerEl) as HTMLElement;
		container.empty();
		container.addClass('firefly-main-view');

		const rootEl = container.createDiv('firefly-root');
		this.layout = new FireflyLayout(this.plugin, rootEl);
		this.topbarEl = this.layout.topbarEl;
		this.mainEl = this.layout.mainEl;
		this.writingArea = new WritingArea(this.plugin, () => {
			this.renderTopbar(this.areaId);
		});
		this.plotGridArea = new PlotGridArea(this.plugin, () => {
			this.renderTopbar(this.areaId);
		});

		if (!this.areaId) {
			this.areaId = this.plugin.areaManager.getCurrentAreaId();
		}

		this.renderMain(this.areaId);
		this.renderTopbar(this.areaId);

		this.registerEvent(
			this.app.workspace.on(
				FIREFLY_EVENT_TAB_CHANGED as any,
				(({ areaId }: { areaId: AreaId; tabId: string }) => {
					if (areaId !== this.areaId) return;
					this.renderMain(this.areaId);
					this.renderTopbar(this.areaId);
				}) as any,
			),
		);

		this.registerEvent(
			this.app.workspace.on('firefly:project-changed' as any, () => {
				this.plotGridArea?.reload();
				this.renderMain(this.areaId);
				this.renderTopbar(this.areaId);
			}),
		);

		await this.plugin.openFireflySidebar();
	}

	async onClose(): Promise<void> {
		this.writingArea?.destroy();
		this.storyGraphArea?.destroy();
		this.plotGridArea?.destroy();
		this.layout = null;
		this.topbarEl = null;
		this.mainEl = null;
		this.activeBoard = null;
		this.writingArea = null;
		this.plotlinesArea = null;
		this.storyGraphArea = null;
		this.plotGridArea = null;
	}

	// ── Topbar z nawigacją wewnątrz karty area ────────────────────

	private getActiveTab(areaId: AreaId): TabDef | undefined {
		return getActiveTab(areaId, this.plugin.areaManager.getActiveTabForArea(areaId));
	}

	private renderTopbar(areaId: AreaId): void {
		if (!this.topbarEl) return;
		this.topbarEl.empty();
		const activeTab = this.getActiveTab(areaId);
		const isBoard       = areaId === 'writing' && activeTab?.id === 'board';
		const isTimeline    = areaId === 'writing' && activeTab?.id === 'timeline';
		const isManuscript  = areaId === 'writing' && activeTab?.id === 'manuscript';
		const isStoryGraph  = areaId === 'connections' && activeTab?.id === 'story-graph';
		const isPlotlines   = areaId === 'connections' && activeTab?.id === 'plotlines';
		const isPlotGrid    = areaId === 'plotgrid';

		const leftEl = this.topbarEl.createDiv('firefly-topbar-left');

		// Nawigacja wewnątrz poszczególnych kart area
		const tabs = TABS_BY_AREA[areaId] ?? [];
		if (tabs.length > 1) {
			const navEl = leftEl.createDiv('firefly-topbar-nav');
			for (const tab of tabs) {
				const isActive = tab.id === activeTab?.id;
				const btn = navEl.createDiv({
					cls: `firefly-topbar-tab-btn${isActive ? ' is-active' : ''}`,
					attr: { 'data-tab-id': tab.id },
				});
				if (tab.icon) {
					setIcon(btn.createSpan({ cls: 'firefly-topbar-tab-icon' }), tab.icon);
				}
				btn.createSpan({ cls: 'firefly-topbar-tab-label', text: tab.label });
				btn.addEventListener('click', () => {
					this.plugin.areaManager.setActiveTab(areaId, tab.id);
					this.renderMain(areaId);
					this.renderTopbar(areaId);
				});
			}
		} else if (tabs.length === 1) {
			leftEl.createSpan({ cls: 'firefly-topbar-title', text: tabs[0]?.label ?? '' });
		}

		const rightEl = this.topbarEl.createDiv('firefly-topbar-right');
		if (isBoard)      this.buildBoardControls(rightEl);
		if (isTimeline)   this.writingArea?.buildTimelineControls(rightEl);
		if (isManuscript) this.writingArea?.buildManuscriptControls(rightEl);
		if (isStoryGraph) this.storyGraphArea?.buildTopbarControls(rightEl);
		if (isPlotlines)  this.plotlinesArea?.buildTopbarControls(rightEl);
		if (isPlotGrid)   this.plotGridArea?.buildTopbarControls(rightEl);
	}

	private buildBoardControls(rightEl: HTMLElement): void {
		const groupWrap = rightEl.createDiv('firefly-topbar-group');
		groupWrap.createSpan({ cls: 'firefly-topbar-group-label', text: 'Grupuj:' });
		const groupSelect = groupWrap.createEl('select', { cls: 'firefly-topbar-select' });
		for (const [value, label] of [['act','Akt'],['chapter','Rozdział'],['status','Status']] as const) {
			const opt = groupSelect.createEl('option', { text: label, value });
			if (value === (this.activeBoard?.groupBy ?? 'act')) opt.selected = true;
		}
		groupSelect.addEventListener('change', () => {
			if (!this.activeBoard) return;
			this.activeBoard.groupBy = groupSelect.value as BoardGroupBy;
			this.activeBoard.rerender();
		});

		rightEl.createDiv('firefly-topbar-separator');

		const modeWrap = rightEl.createDiv('firefly-topbar-mode-toggle');
		for (const [value, label, icon] of [['kanban','Kanban','columns-2'],['corkboard','Korkboard','layout-grid']] as const) {
			const isActive = (this.activeBoard?.boardMode ?? 'kanban') === value;
			const btn = modeWrap.createEl('button', {
				cls:  `firefly-topbar-mode-btn${isActive ? ' is-active' : ''}`,
				attr: { 'aria-label': label },
			});
			setIcon(btn.createSpan(), icon);
			btn.createSpan({ text: label });
			btn.addEventListener('click', () => {
				if (!this.activeBoard) return;
				this.activeBoard.boardMode = value as BoardMode;
				modeWrap.querySelectorAll('.firefly-topbar-mode-btn').forEach(b => b.classList.remove('is-active'));
				btn.classList.add('is-active');
				this.activeBoard.rerender();
			});
		}

		rightEl.createDiv('firefly-topbar-separator');

		const newBtn = rightEl.createEl('button', { cls: 'firefly-topbar-btn-primary' });
		setIcon(newBtn.createSpan(), 'plus');
		newBtn.createSpan({ text: 'Nowa scena' });
		newBtn.addEventListener('click', () => { /* TODO */ });
	}

	// ── Main ──────────────────────────────────────────────────────

	private renderMain(areaId: AreaId): void {
		if (!this.mainEl) return;
		if (this.storyGraphArea) {
			this.storyGraphArea.destroy();
			this.storyGraphArea = null;
		}
		this.plotlinesArea = null;
		this.activeBoard = null;
		this.mainEl.empty();
		this.mainEl.className = 'firefly-main';

		const activeTab = this.getActiveTab(areaId);
		if (!activeTab) {
			this.renderPlaceholder(this.mainEl, 'inbox', 'Brak zakładek', '');
			return;
		}

		if (areaId === 'writing') {
			this.writingArea?.renderMain(this.mainEl, activeTab.id);
			return;
		}

		if (areaId === 'plotgrid') {
			this.plotGridArea?.renderMain(this.mainEl, activeTab.id);
			return;
		}

		if (areaId === 'connections' && activeTab.id === 'story-graph') {
			this.storyGraphArea = new StoryGraphView(this.plugin, this.mainEl, () => {
				this.renderTopbar(areaId);
			});
			this.storyGraphArea.render();
			return;
		}

		if (areaId === 'connections' && activeTab.id === 'plotlines') {
			this.plotlinesArea = new PlotlinesView(this.plugin, this.mainEl, () => {
				this.renderTopbar(areaId);
			});
			this.plotlinesArea.render();
			return;
		}

		this.renderPlaceholder(
			this.mainEl, activeTab.icon, activeTab.label,
			`Zakładka "${activeTab.label}" do zaimplementowania.`,
		);
	}

	private renderPlaceholder(el: HTMLElement, icon: string, title: string, subtitle: string): void {
		const ph = el.createDiv('firefly-placeholder');
		setIcon(ph.createDiv({ cls: 'firefly-placeholder-icon' }), icon);
		ph.createEl('h2', { cls: 'firefly-placeholder-title', text: title });
		ph.createEl('p',  { cls: 'firefly-placeholder-subtitle', text: subtitle });
	}
}
