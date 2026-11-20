import type { PlotGridState } from '../state/PlotGridState';
import { cellValue } from '../../../../services/PlotGridReader';
import { renderCellEntries } from '../components/CellEntryRenderer';

export interface PlotGridMechanicsViewCallbacks {
	onSelectMechanic: (mechanicId: string) => void;
	onSelectCell: (beatFilePath: string, colId: string, sub: string | null, colType: 'mechanic') => void;
}

export function renderPlotGridMechanicsView(
	container: HTMLElement,
	state: PlotGridState,
	callbacks: PlotGridMechanicsViewCallbacks,
): HTMLElement {
	const layout = container.createDiv('ff-pg-two-col-layout');

	// 1. Lewa kolumna: Lista Mechanics
	const sidebar = layout.createDiv('ff-pg-sidebar-list');
	sidebar.createDiv({
		cls: 'ff-pg-sidebar-header',
		text: `MECHANICS (${state.data.mechanics.length})`,
	});

	if (state.data.mechanics.length === 0) {
		sidebar.createDiv({ cls: 'ff-pg-sidebar-empty', text: 'Brak zdefiniowanych mechanik (Class: Mechanic).' });
		return layout;
	}

	const activeMech = state.data.mechanics.find(m => m.id === state.selectedMechanicId) ?? state.data.mechanics[0];
	if (!state.selectedMechanicId && activeMech) {
		state.selectedMechanicId = activeMech.id;
	}

	for (const mech of state.data.mechanics) {
		const isSelected = activeMech?.id === mech.id;
		const card = sidebar.createDiv({
			cls: `ff-pg-sidebar-item${isSelected ? ' is-selected' : ''}`,
		});

		const headRow = card.createDiv('ff-pg-item-head');
		const colorSquare = headRow.createSpan({ cls: 'ff-pg-color-square' });
		colorSquare.style.background = mech.kolor;
		headRow.createSpan({ cls: 'ff-pg-item-title', text: mech.nazwa });

		card.createDiv({
			cls: 'ff-pg-item-subinfo',
			text: `id: ${mech.id} · column_order: ${mech.columnOrder}`,
		});

		const leaves = mech.podkolumny && mech.podkolumny.length > 0 ? mech.podkolumny : [null];
		const totalPossible = state.data.beats.length * leaves.length;
		let filledCount = 0;
		for (const b of state.data.beats) {
			for (const leaf of leaves) {
				if (cellValue(b, mech.id, leaf, 'mechanic').length > 0) filledCount++;
			}
		}
		card.createDiv({
			cls: 'ff-pg-item-filled-stat',
			text: `${filledCount} z ${totalPossible} komórek wypełnionych`,
		});

		card.addEventListener('click', () => {
			state.selectedMechanicId = mech.id;
			callbacks.onSelectMechanic(mech.id);
		});
	}

	// 2. Prawa kolumna: Tabela mechaniki
	const mainContent = layout.createDiv('ff-pg-main-column');

	if (!activeMech) {
		mainContent.createDiv({ cls: 'ff-pg-empty-panel', text: 'Wybierz mechanikę z listy po lewej stronie.' });
		return layout;
	}

	const scrollWrap = mainContent.createDiv('ff-pg-scroll-wrap');
	const table = scrollWrap.createEl('table', { cls: 'ff-pg-arc-table' });

	// Ustal liście (podkolumny): jeśli brak, a to dosing/dawkowanie, domyślne to Wolno, Nie wolno, Notatka
	let leaves = activeMech.podkolumny && activeMech.podkolumny.length > 0 ? activeMech.podkolumny : [];
	if (leaves.length === 0 && (activeMech.id === 'dosing' || activeMech.id === 'dawkowanie')) {
		leaves = ['Wolno', 'Nie wolno', 'Notatka'];
	}
	if (leaves.length === 0) {
		leaves = [activeMech.nazwa];
	}

	// THEAD
	const thead = table.createEl('thead');
	const trHead = thead.createEl('tr');
	trHead.createEl('th', { cls: 'ff-pg-th-num', text: '#' });
	trHead.createEl('th', { cls: 'ff-pg-th-beat', text: 'BEAT' });

	for (const leaf of leaves) {
		trHead.createEl('th', {
			cls: 'ff-pg-th-subcol',
			text: leaf.toUpperCase(),
		});
	}

	// TBODY
	const tbody = table.createEl('tbody');
	for (const beat of state.data.beats) {
		const tr = tbody.createEl('tr', { cls: 'ff-pg-arc-tr' });
		tr.createEl('td', { cls: 'ff-pg-td-num', text: String(beat.order) });
		tr.createEl('td', { cls: 'ff-pg-td-beat', text: beat.name });

		for (const leaf of leaves) {
			const sub = leaf === activeMech.nazwa ? null : leaf;
			const values = cellValue(beat, activeMech.id, sub, 'mechanic');
			const isCellSelected = state.selection?.kind === 'cell'
				&& state.selection.beatFilePath === beat.filePath
				&& state.selection.colId === activeMech.id
				&& state.selection.sub === sub;

			const isWolno = leaf.toLowerCase() === 'wolno';
			const isNieWolno = leaf.toLowerCase() === 'nie wolno';

			const td = tr.createEl('td', {
				cls: `ff-pg-arc-cell${isCellSelected ? ' is-selected' : ''}${values.length === 0 ? ' is-empty' : ''}${isWolno ? ' is-wolno' : ''}${isNieWolno ? ' is-nie-wolno' : ''}`,
			});

			renderCellEntries(td, values, '—', 4);

			td.addEventListener('click', (e) => {
				e.stopPropagation();
				callbacks.onSelectCell(beat.filePath, activeMech.id, sub, 'mechanic');
			});
		}
	}

	return layout;
}
