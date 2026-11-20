import type { PlotGridState } from '../state/PlotGridState';
import type { Arc } from '../../../../models/Arc';
import { renderArcFoundationCards } from '../components/ArcFoundationCards';
import { cellValue } from '../../../../services/PlotGridReader';
import { renderCellEntries } from '../components/CellEntryRenderer';

export interface PlotGridArcsViewCallbacks {
	onSelectArc: (arcId: string) => void;
	onSelectCell: (beatFilePath: string, colId: string, sub: string | null, colType: 'arc') => void;
}

export function renderPlotGridArcsView(
	container: HTMLElement,
	state: PlotGridState,
	callbacks: PlotGridArcsViewCallbacks,
): HTMLElement {
	const layout = container.createDiv('ff-pg-two-col-layout');

	// 1. Lewa kolumna: Lista Arcs
	const sidebar = layout.createDiv('ff-pg-sidebar-list');
	sidebar.createDiv({
		cls: 'ff-pg-sidebar-header',
		text: `ARCS (${state.data.arcs.length})`,
	});

	if (state.data.arcs.length === 0) {
		sidebar.createDiv({ cls: 'ff-pg-sidebar-empty', text: 'Brak zdefiniowanych łuków (Class: Arc).' });
		return layout;
	}

	// Wybierz domyślny arc jeśli brak
	const activeArc = state.data.arcs.find(a => a.id === state.selectedArcId) ?? state.data.arcs[0];
	if (!state.selectedArcId && activeArc) {
		state.selectedArcId = activeArc.id;
	}

	for (const arc of state.data.arcs) {
		const isSelected = activeArc?.id === arc.id;
		const card = sidebar.createDiv({
			cls: `ff-pg-sidebar-item${isSelected ? ' is-selected' : ''}`,
		});

		const headRow = card.createDiv('ff-pg-item-head');
		const colorSquare = headRow.createSpan({ cls: 'ff-pg-color-square' });
		colorSquare.style.background = arc.kolor;
		headRow.createSpan({ cls: 'ff-pg-item-title', text: arc.nazwa });

		const subInfo = [
			arc.owner ? `owner: ${arc.owner}` : null,
			arc.podkolumny.length > 0 ? `subcolumns: ${arc.podkolumny.length}` : 'bez podkolumn',
		].filter(Boolean).join(' · ');
		card.createDiv({ cls: 'ff-pg-item-subinfo', text: subInfo });

		// Licznik wypełnienia
		const leaves = arc.podkolumny.length > 0 ? arc.podkolumny : [null];
		const totalPossible = state.data.beats.length * leaves.length;
		let filledCount = 0;
		for (const b of state.data.beats) {
			for (const sub of leaves) {
				if (cellValue(b, arc.id, sub, 'arc').length > 0) filledCount++;
			}
		}
		card.createDiv({
			cls: 'ff-pg-item-filled-stat',
			text: `${filledCount} z ${totalPossible} komórek wypełnionych`,
		});

		card.addEventListener('click', () => {
			state.selectedArcId = arc.id;
			callbacks.onSelectArc(arc.id);
		});
	}

	// 2. Prawa kolumna: Szczegóły wybranego Arcu (Fundamenty + Tabela)
	const mainContent = layout.createDiv('ff-pg-main-column');

	if (!activeArc) {
		mainContent.createDiv({ cls: 'ff-pg-empty-panel', text: 'Wybierz łuk z listy po lewej stronie.' });
		return layout;
	}

	// Fundamenty łuku postaci (Top Grid)
	renderArcFoundationCards(mainContent, activeArc);

	// Tabela beatów × podkolumny wybranego Arcu
	const scrollWrap = mainContent.createDiv('ff-pg-scroll-wrap');
	const table = scrollWrap.createEl('table', { cls: 'ff-pg-arc-table' });

	// THEAD
	const thead = table.createEl('thead');
	const trHead = thead.createEl('tr');
	trHead.createEl('th', { cls: 'ff-pg-th-num', text: '#' });
	trHead.createEl('th', { cls: 'ff-pg-th-beat', text: 'BEAT' });

	const leaves = activeArc.podkolumny.length > 0 ? activeArc.podkolumny : [null];
	for (const sub of leaves) {
		trHead.createEl('th', {
			cls: 'ff-pg-th-subcol',
			text: (sub ?? activeArc.nazwa).toUpperCase(),
		});
	}

	// TBODY
	const tbody = table.createEl('tbody');
	for (const beat of state.data.beats) {
		const tr = tbody.createEl('tr', { cls: 'ff-pg-arc-tr' });
		tr.createEl('td', { cls: 'ff-pg-td-num', text: String(beat.order) });
		tr.createEl('td', { cls: 'ff-pg-td-beat', text: beat.name });

		for (const sub of leaves) {
			const values = cellValue(beat, activeArc.id, sub, 'arc');
			const isCellSelected = state.selection?.kind === 'cell'
				&& state.selection.beatFilePath === beat.filePath
				&& state.selection.colId === activeArc.id
				&& state.selection.sub === sub;

			const td = tr.createEl('td', {
				cls: `ff-pg-arc-cell${isCellSelected ? ' is-selected' : ''}${values.length === 0 ? ' is-empty' : ''}`,
			});

			renderCellEntries(td, values, '—', 4);

			td.addEventListener('click', (e) => {
				e.stopPropagation();
				callbacks.onSelectCell(beat.filePath, activeArc.id, sub, 'arc');
			});
		}
	}

	return layout;
}
