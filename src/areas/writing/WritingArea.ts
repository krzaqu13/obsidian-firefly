import { setIcon } from 'obsidian';
import type FireflyPlugin from '../../main';
import { WritingBoard } from './WritingBoard';
import { TimelineView } from './TimelineView';
import { ManuscriptView } from './ManuscriptView';
import { StoryGraphView } from './StoryGraphView';

export class WritingArea {
	private plugin: FireflyPlugin;
	private onStateChange?: () => void;
	activeTimeline: TimelineView | null = null;
	activeManuscript: ManuscriptView | null = null;
	activeStoryGraph: StoryGraphView | null = null;

	constructor(plugin: FireflyPlugin, onStateChange?: () => void) {
		this.plugin = plugin;
		this.onStateChange = onStateChange;
	}

	destroy(): void {
		if (this.activeManuscript) {
			this.activeManuscript.destroy();
			this.activeManuscript = null;
		}
		if (this.activeStoryGraph) {
			this.activeStoryGraph.destroy();
			this.activeStoryGraph = null;
		}
	}

	renderMain(container: HTMLElement, tabId: string): void {
		if (this.activeManuscript) {
			this.activeManuscript.destroy();
			this.activeManuscript = null;
		}
		if (this.activeStoryGraph) {
			this.activeStoryGraph.destroy();
			this.activeStoryGraph = null;
		}
		container.empty();
		this.activeTimeline = null;

		if (tabId === 'story-graph') {
			this.activeStoryGraph = new StoryGraphView(this.plugin, container, () => {
				this.onStateChange?.();
			});
			this.activeStoryGraph.render();
			return;
		}

		if (tabId === 'board') {
			const board = new WritingBoard(this.plugin, container);
			board.render();
			return;
		}

		if (tabId === 'timeline') {
			this.activeTimeline = new TimelineView(this.plugin, container);
			this.activeTimeline.render();
			return;
		}

		if (tabId === 'manuscript') {
			this.activeManuscript = new ManuscriptView(this.plugin, container, () => {
				this.onStateChange?.();
			});
			this.activeManuscript.render();
			return;
		}

		this.renderPlaceholder(
			container,
			this.getTabIcon(tabId),
			this.getTabLabel(tabId),
			`Zakładka "${this.getTabLabel(tabId)}" do zaimplementowania.`,
		);
	}

	buildManuscriptControls(rightEl: HTMLElement): void {
		this.activeManuscript?.buildTopbarControls(rightEl);
	}

	/**
	 * Buduje kontrolki osi czasu w przekazanym kontenerze topbara.
	 * Wywoływane przez FireflyMainView.renderTopbar() gdy aktywna zakładka to 'timeline'.
	 */
	buildTimelineControls(rightEl: HTMLElement): void {
		const tl = this.activeTimeline;
		if (!tl) return;

		// Swimlane toggle
		const swimBtn = rightEl.createEl('button', {
			cls: `firefly-topbar-mode-btn${tl.swimlaneMode ? ' is-active' : ''}`,
			attr: { 'aria-label': tl.swimlaneMode ? 'Widok liniowy' : 'Widok swimlane' },
		});
		setIcon(swimBtn.createSpan(), 'columns-2');
		swimBtn.createSpan({ text: 'Swimlane' });
		swimBtn.addEventListener('click', () => {
			tl.swimlaneMode = !tl.swimlaneMode;
			swimBtn.classList.toggle('is-active', tl.swimlaneMode);
			tl.rerender();
		});

		// Swimlane group-by (widoczny tylko gdy swimlane włączony)
		if (tl.swimlaneMode) {
			rightEl.createDiv('firefly-topbar-separator');
			const groupWrap = rightEl.createDiv('firefly-topbar-group');
			groupWrap.createSpan({ cls: 'firefly-topbar-group-label', text: 'Pasy wg:' });
			const groupSelect = groupWrap.createEl('select', { cls: 'firefly-topbar-select' });
			groupSelect.addEventListener('keydown', (e: KeyboardEvent) => e.stopPropagation());
			for (const [value, label] of [
				['pov', 'POV'],
				['character', 'Postaci'],
				['location', 'Lokacji'],
				['tag', 'Tagu'],
			] as const) {
				const opt = groupSelect.createEl('option', { text: label, value });
				if (value === tl.swimlaneGroupBy) opt.selected = true;
			}
			groupSelect.addEventListener('change', () => {
				tl.swimlaneGroupBy = groupSelect.value as typeof tl.swimlaneGroupBy;
				tl.rerender();
			});
		}

		rightEl.createDiv('firefly-topbar-separator');

		// Kolejność
		const orderWrap = rightEl.createDiv('firefly-topbar-group');
		orderWrap.createSpan({ cls: 'firefly-topbar-group-label', text: 'Kolejność:' });
		const orderSelect = orderWrap.createEl('select', { cls: 'firefly-topbar-select' });
		orderSelect.addEventListener('keydown', (e: KeyboardEvent) => e.stopPropagation());
		for (const [value, label] of [
			['reading', 'Czytania'],
			['chronological', 'Chronologiczna'],
		] as const) {
			const opt = orderSelect.createEl('option', { text: label, value });
			if (value === tl.timelineOrder) opt.selected = true;
		}
		orderSelect.addEventListener('change', () => {
			tl.timelineOrder = orderSelect.value as typeof tl.timelineOrder;
			tl.rerender();
		});

		rightEl.createDiv('firefly-topbar-separator');

		// Zoom out
		const zoomOut = rightEl.createEl('button', {
			cls: 'firefly-topbar-icon-btn',
			attr: { 'aria-label': 'Pomniejsz' },
		});
		setIcon(zoomOut, 'minus');
		zoomOut.addEventListener('click', () => {
			tl.zoomLevel = Math.max(0.5, tl.zoomLevel - 0.25);
			zoomLabel.textContent = `${Math.round(tl.zoomLevel * 100)}%`;
			tl.rerender();
		});

		const zoomLabel = rightEl.createSpan({
			cls: 'firefly-topbar-zoom-label',
			text: `${Math.round(tl.zoomLevel * 100)}%`,
		});

		const zoomIn = rightEl.createEl('button', {
			cls: 'firefly-topbar-icon-btn',
			attr: { 'aria-label': 'Powiększ' },
		});
		setIcon(zoomIn, 'plus');
		zoomIn.addEventListener('click', () => {
			tl.zoomLevel = Math.min(3, tl.zoomLevel + 0.25);
			zoomLabel.textContent = `${Math.round(tl.zoomLevel * 100)}%`;
			tl.rerender();
		});

		rightEl.createDiv('firefly-topbar-separator');

		// Refresh
		const refreshBtn = rightEl.createEl('button', {
			cls: 'firefly-topbar-icon-btn',
			attr: { 'aria-label': 'Odśwież' },
		});
		setIcon(refreshBtn, 'refresh-cw');
		refreshBtn.addEventListener('click', () => tl.refresh());
	}

	private getTabLabel(tabId: string): string {
		const labels: Record<string, string> = {
			'story-graph': 'Story Graph',
			'chapter-list': 'Rozdziały',
			'board': 'Board',
			'timeline': 'Oś czasu',
			'manuscript': 'Manuskrypt',
		};
		return labels[tabId] ?? 'Pisanie';
	}

	private getTabIcon(tabId: string): string {
		const icons: Record<string, string> = {
			'story-graph': 'activity',
			'chapter-list': 'list',
			'board': 'columns-2',
			'timeline': 'clock',
			'manuscript': 'book-open',
		};
		return icons[tabId] ?? 'pen-line';
	}

	private renderPlaceholder(el: HTMLElement, icon: string, title: string, subtitle: string): void {
		const ph = el.createDiv('firefly-placeholder');
		setIcon(ph.createDiv({ cls: 'firefly-placeholder-icon' }), icon);
		ph.createEl('h2', { cls: 'firefly-placeholder-title', text: title });
		ph.createEl('p', { cls: 'firefly-placeholder-subtitle', text: subtitle });
	}
}
