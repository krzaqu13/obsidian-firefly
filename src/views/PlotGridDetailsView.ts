import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type FireflyPlugin from '../main';
import { FIREFLY_PLOTGRID_DETAILS_VIEW_TYPE } from '../constants';
import type { PlotGridState } from '../areas/writing/plotgrid/state/PlotGridState';
import { renderPlotGridDrawer, type PlotGridDrawerCallbacks } from '../areas/writing/plotgrid/drawer/PlotGridDrawer';

/**
 * Prawy sidebar Obsidiana wyświetlający szczegóły zaznaczenia w PlotGrid (komórka, kolumna, beat, scena, sekret).
 */
export class PlotGridDetailsView extends ItemView {
	private plugin: FireflyPlugin;
	private bodyEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: FireflyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return FIREFLY_PLOTGRID_DETAILS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Szczegóły PlotGrid';
	}

	getIcon(): string {
		return 'panel-right';
	}

	async onOpen(): Promise<void> {
		this.containerEl.addClass('firefly-plotgrid-details-leaf');
		const viewHeader = this.containerEl.querySelector('.view-header') as HTMLElement | null;
		if (viewHeader) viewHeader.style.display = 'none';

		const content = (this.containerEl.children[1] || this.containerEl) as HTMLElement;
		content.empty();
		content.addClass('ff-pg-details-sidebar');

		this.bodyEl = content;
		this.renderEmpty();
	}

	async onClose(): Promise<void> {
		this.bodyEl = null;
	}

	/**
	 * Aktualizuje zawartość sidebara na podstawie aktualnego stanu PlotGrid.
	 */
	updateContent(state: PlotGridState, callbacks: PlotGridDrawerCallbacks): void {
		if (!this.bodyEl) return;
		this.bodyEl.empty();

		if (!state.selection) {
			this.renderEmpty();
			return;
		}

		renderPlotGridDrawer(this.bodyEl, this.plugin.app, state, callbacks);
	}

	/**
	 * Czyści widok szczegółów i wyświetla pusty stan.
	 */
	clearContent(): void {
		if (!this.bodyEl) return;
		this.bodyEl.empty();
		this.renderEmpty();
	}

	private renderEmpty(): void {
		if (!this.bodyEl) return;
		const empty = this.bodyEl.createDiv('ff-pg-details-empty');
		const iconWrap = empty.createDiv('ff-pg-details-empty-icon');
		setIcon(iconWrap, 'panel-right');
		empty.createEl('h3', { text: 'Szczegóły PlotGrid' });
		empty.createEl('p', { text: 'Kliknij na komórkę, kolumnę, beat, scenę lub sekret w PlotGrid, aby wyświetlić szczegóły w tym panelu.' });
	}
}
