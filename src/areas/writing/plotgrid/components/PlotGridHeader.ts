import { Menu, setIcon } from 'obsidian';
import type { PlotGridState, PlotGridTabId } from '../state/PlotGridState';
import type { FireflyProject } from '../../../../models/Project';
import { renderValidationBadge } from './ValidationBadge';

export interface PlotGridHeaderCallbacks {
	onTabChange: (tabId: PlotGridTabId) => void;
	onOrientChange: (orient: 'rows' | 'cols') => void;
	onRescan: () => void;
	onFilterColumns: (anchorEl: HTMLElement) => void;
	onNewBeat?: () => void;
	onNewScene?: () => void;
	onNewArc?: () => void;
	onNewSubplot?: () => void;
	onNewMechanic?: () => void;
	onNewSecret?: () => void;
}

const TAB_DEFS: Array<{ id: PlotGridTabId; label: string }> = [
	{ id: 'plotgrid',  label: 'PlotGrid' },
	{ id: 'beats',     label: 'Beats' },
	{ id: 'scenes',    label: 'Scenes' },
	{ id: 'arcs',      label: 'Arcs' },
	{ id: 'subplots',  label: 'Subplots' },
	{ id: 'mechanics', label: 'Mechanics' },
	{ id: 'secrets',   label: 'Secrets' },
];

/**
 * Buduje kontrolki akcji, wskaźniki i menu dla PlotGridu wewnątrz firefly-topbar (prawa strona).
 */
export function renderPlotGridTopbarControls(
	rightCol: HTMLElement,
	state: PlotGridState,
	project: FireflyProject,
	callbacks: PlotGridHeaderCallbacks,
): void {
	if (state.activeTab === 'plotgrid') {
		// Liczniki podsumowujące (kolumny, sekrety, walidacja)
		const badgesRow = rightCol.createDiv('ff-pg-badges-row');
		badgesRow.createSpan({
			cls: 'ff-pg-badge',
			text: `${state.data.cols.length} kolumn`,
		});
		badgesRow.createSpan({
			cls: 'ff-pg-badge',
			text: `${state.data.secrets.length} sekretów`,
		});
		renderValidationBadge(badgesRow, {
			validation: state.data.validation,
		});

		// Separator
		rightCol.createDiv('firefly-topbar-separator');

		// Pojedynczy przycisk z menu kontekstowym (zastępuje 4 osobne przyciski)
		const menuBtn = rightCol.createEl('button', {
			cls: 'ff-pg-pill-btn ff-pg-view-options-btn',
			attr: { type: 'button', 'aria-label': 'Opcje widoku' },
		});
		setIcon(menuBtn.createSpan({ cls: 'ff-pg-btn-icon' }), 'sliders-horizontal');
		menuBtn.createSpan({ text: 'Widok' });

		menuBtn.addEventListener('click', (e: MouseEvent) => {
			const menu = new Menu();

			menu.addItem(item => {
				item.setTitle('Beaty w wierszach')
					.setChecked(state.orient === 'rows')
					.onClick(() => callbacks.onOrientChange('rows'));
			});

			menu.addItem(item => {
				item.setTitle('Beaty w kolumnach')
					.setChecked(state.orient === 'cols')
					.onClick(() => callbacks.onOrientChange('cols'));
			});

			menu.addSeparator();

			menu.addItem(item => {
				item.setTitle('Widoczność kolumn...')
					.setIcon('columns')
					.onClick(() => callbacks.onFilterColumns(menuBtn));
			});

			menu.addItem(item => {
				item.setTitle('Skanuj ponownie')
					.setIcon('refresh-cw')
					.onClick(() => callbacks.onRescan());
			});

			menu.showAtMouseEvent(e);
		});
	} else if (state.activeTab === 'beats') {
		const beatModelName = project.beatModelName ?? 'Hero\'s Journey';
		rightCol.createDiv({
			cls: 'ff-pg-pill-btn is-static',
			text: `Szablon: ${beatModelName}`,
		});
		const newBeatBtn = rightCol.createEl('button', {
			cls: 'ff-pg-action-btn mod-cta',
			text: '+ Nowy beat',
			attr: { type: 'button' },
		});
		newBeatBtn.addEventListener('click', () => callbacks.onNewBeat?.());
	} else if (state.activeTab === 'scenes') {
		const newSceneBtn = rightCol.createEl('button', {
			cls: 'ff-pg-action-btn mod-cta',
			text: '+ Nowa scena',
			attr: { type: 'button' },
		});
		newSceneBtn.addEventListener('click', () => callbacks.onNewScene?.());
	} else if (state.activeTab === 'arcs') {
		const newArcBtn = rightCol.createEl('button', {
			cls: 'ff-pg-action-btn mod-cta',
			text: '+ Nowy Arc',
			attr: { type: 'button' },
		});
		newArcBtn.addEventListener('click', () => callbacks.onNewArc?.());
	} else if (state.activeTab === 'subplots') {
		const newSubplotBtn = rightCol.createEl('button', {
			cls: 'ff-pg-action-btn mod-cta',
			text: '+ Nowy Subplot',
			attr: { type: 'button' },
		});
		newSubplotBtn.addEventListener('click', () => callbacks.onNewSubplot?.());
	} else if (state.activeTab === 'mechanics') {
		const newMechBtn = rightCol.createEl('button', {
			cls: 'ff-pg-action-btn mod-cta',
			text: '+ Nowy Mechanic',
			attr: { type: 'button' },
		});
		newMechBtn.addEventListener('click', () => callbacks.onNewMechanic?.());
	} else if (state.activeTab === 'secrets') {
		const newSecretBtn = rightCol.createEl('button', {
			cls: 'ff-pg-action-btn mod-cta',
			text: '+ Nowy Secret',
			attr: { type: 'button' },
		});
		newSecretBtn.addEventListener('click', () => callbacks.onNewSecret?.());
	}
}

/**
 * Zwięzły nagłówek wstecznie kompatybilny.
 */
export function renderPlotGridHeader(
	container: HTMLElement,
	state: PlotGridState,
	project: FireflyProject,
	callbacks: PlotGridHeaderCallbacks,
): HTMLElement {
	const header = container.createDiv('ff-pg-header ff-pg-header-compact');

	// 1. Lewa strona: Pasek Zakładek
	const nav = header.createEl('nav', { cls: 'ff-pg-tabs-bar', attr: { role: 'tablist' } });
	for (const tab of TAB_DEFS) {
		const isActive = tab.id === state.activeTab;
		const tabBtn = nav.createEl('button', {
			cls: `ff-pg-tab-btn${isActive ? ' is-active' : ''}`,
			attr: {
				type: 'button',
				role: 'tab',
				'aria-selected': String(isActive),
			},
			text: tab.label,
		});
		tabBtn.addEventListener('click', () => {
			if (state.activeTab !== tab.id) {
				callbacks.onTabChange(tab.id);
			}
		});
	}

	// 2. Prawa strona: Akcje, Badges i Menu Opcji
	const rightCol = header.createDiv('ff-pg-header-right-actions');
	renderPlotGridTopbarControls(rightCol, state, project, callbacks);

	return header;
}
