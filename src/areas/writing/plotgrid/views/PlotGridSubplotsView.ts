import type { PlotGridState } from '../state/PlotGridState';
import { cellValue } from '../../../../services/PlotGridReader';
import { renderCellEntries } from '../components/CellEntryRenderer';

export interface PlotGridSubplotsViewCallbacks {
	onSelectSubplot: (subplotId: string) => void;
	onSelectCell: (beatFilePath: string, colId: string, sub: string | null, colType: 'subplot') => void;
}

export function renderPlotGridSubplotsView(
	container: HTMLElement,
	state: PlotGridState,
	callbacks: PlotGridSubplotsViewCallbacks,
): HTMLElement {
	const layout = container.createDiv('ff-pg-two-col-layout');

	// 1. Lewa kolumna: Lista Subplots
	const sidebar = layout.createDiv('ff-pg-sidebar-list');
	sidebar.createDiv({
		cls: 'ff-pg-sidebar-header',
		text: `SUBPLOTS (${state.data.subplots.length})`,
	});

	if (state.data.subplots.length === 0) {
		sidebar.createDiv({ cls: 'ff-pg-sidebar-empty', text: 'Brak zdefiniowanych wątków (Class: Subplot).' });
		return layout;
	}

	const activeSub = state.data.subplots.find(s => s.id === state.selectedSubplotId) ?? state.data.subplots[0];
	if (!state.selectedSubplotId && activeSub) {
		state.selectedSubplotId = activeSub.id;
	}

	for (const sub of state.data.subplots) {
		const isSelected = activeSub?.id === sub.id;
		const card = sidebar.createDiv({
			cls: `ff-pg-sidebar-item${isSelected ? ' is-selected' : ''}`,
		});

		const headRow = card.createDiv('ff-pg-item-head');
		const colorSquare = headRow.createSpan({ cls: 'ff-pg-color-square' });
		colorSquare.style.background = sub.kolor;
		headRow.createSpan({ cls: 'ff-pg-item-title', text: sub.nazwa });

		card.createDiv({
			cls: 'ff-pg-item-subinfo',
			text: `column_order: ${sub.columnOrder}`,
		});

		const leaves = sub.podkolumny.length > 0 ? sub.podkolumny : [null];
		const totalPossible = state.data.beats.length * leaves.length;
		let filledCount = 0;
		for (const b of state.data.beats) {
			for (const leaf of leaves) {
				if (cellValue(b, sub.id, leaf, 'subplot').length > 0) filledCount++;
			}
		}
		card.createDiv({
			cls: 'ff-pg-item-filled-stat',
			text: `${filledCount} z ${totalPossible} komórek wypełnionych`,
		});

		card.addEventListener('click', () => {
			state.selectedSubplotId = sub.id;
			callbacks.onSelectSubplot(sub.id);
		});
	}

	// 2. Prawa kolumna: Szczegóły wybranego Subplotu
	const mainContent = layout.createDiv('ff-pg-main-column');

	if (!activeSub) {
		mainContent.createDiv({ cls: 'ff-pg-empty-panel', text: 'Wybierz wątek z listy po lewej stronie.' });
		return layout;
	}

	// Baner opisu wątku
	if (activeSub.description) {
		const banner = mainContent.createDiv('ff-pg-subplot-banner');
		banner.createDiv({ cls: 'ff-pg-subplot-desc-text', text: activeSub.description });
	}

	// Tabela beatów
	const scrollWrap = mainContent.createDiv('ff-pg-scroll-wrap');
	const table = scrollWrap.createEl('table', { cls: 'ff-pg-arc-table' });

	// THEAD
	const thead = table.createEl('thead');
	const trHead = thead.createEl('tr');
	trHead.createEl('th', { cls: 'ff-pg-th-num', text: '#' });
	trHead.createEl('th', { cls: 'ff-pg-th-beat', text: 'BEAT' });

	const leaves = activeSub.podkolumny.length > 0 ? activeSub.podkolumny : [null];
	for (const leaf of leaves) {
		trHead.createEl('th', {
			cls: 'ff-pg-th-subcol',
			text: (leaf ?? activeSub.nazwa).toUpperCase(),
		});
	}

	// TBODY
	const tbody = table.createEl('tbody');
	for (const beat of state.data.beats) {
		const tr = tbody.createEl('tr', { cls: 'ff-pg-arc-tr' });
		tr.createEl('td', { cls: 'ff-pg-td-num', text: String(beat.order) });
		tr.createEl('td', { cls: 'ff-pg-td-beat', text: beat.name });

		for (const leaf of leaves) {
			const values = cellValue(beat, activeSub.id, leaf, 'subplot');
			const isCellSelected = state.selection?.kind === 'cell'
				&& state.selection.beatFilePath === beat.filePath
				&& state.selection.colId === activeSub.id
				&& state.selection.sub === leaf;

			const td = tr.createEl('td', {
				cls: `ff-pg-arc-cell${isCellSelected ? ' is-selected' : ''}${values.length === 0 ? ' is-empty' : ''}`,
			});

			renderCellEntries(td, values, '+', 4);

			td.addEventListener('click', (e) => {
				e.stopPropagation();
				callbacks.onSelectCell(beat.filePath, activeSub.id, leaf, 'subplot');
			});
		}
	}

	return layout;
}
