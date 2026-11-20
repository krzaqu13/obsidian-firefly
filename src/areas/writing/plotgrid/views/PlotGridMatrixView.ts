import type { PlotGridState } from '../state/PlotGridState';
import { cellValue } from '../../../../services/PlotGridReader';
import { renderTensionTempoBars } from '../components/TensionTempoBars';
import { renderSecretChip } from '../components/SecretChip';
import { renderCellEntries } from '../components/CellEntryRenderer';
import type { SecretEventKind } from '../../../../models/Secret';

export interface PlotGridMatrixViewCallbacks {
	onSelectCell: (beatFilePath: string, colId: string, sub: string | null, colType: 'arc' | 'subplot' | 'mechanic') => void;
	onSelectColumn: (colId: string, colType: 'arc' | 'subplot' | 'mechanic') => void;
	onSelectSecret: (secretId: string) => void;
	onSelectBeat?: (beatFilePath: string) => void;
}

export function renderPlotGridMatrixView(
	container: HTMLElement,
	state: PlotGridState,
	callbacks: PlotGridMatrixViewCallbacks,
): HTMLElement {
	const scrollWrap = container.createDiv('ff-pg-scroll-wrap');
	const table = scrollWrap.createEl('table', { cls: 'ff-pg-matrix-table' });

	// Filtruj ukryte kolumny
	const visibleCols = state.data.cols.filter(c => !state.hiddenCols.has(c.source.id));
	const showSecrets = !state.hiddenSecrets && state.data.secrets.length > 0;

	// -------------------------------------------------------------------------
	// THEAD: Dwa wiersze nagłówków pasmowych
	// -------------------------------------------------------------------------
	const thead = table.createEl('thead');

	// Wiersz 1: Pasma grupowe
	const trGroup = thead.createEl('tr', { cls: 'ff-pg-tr-group' });

	// Pojedyncza komórka Beat (zawiera nazwę, order oraz napięcie/tempo)
	const thStickyBeat = trGroup.createEl('th', { cls: 'ff-pg-th-sticky-beat', text: 'Beat' });
	thStickyBeat.rowSpan = 2;

	// Pasma kolumn fabularnych
	for (const col of visibleCols) {
		const leaves = col.leaves.length > 0 ? col.leaves : [null];
		const thGroup = trGroup.createEl('th', {
			cls: `ff-pg-th-group ff-pg-group-${col.type.toLowerCase()}`,
			attr: { colspan: String(leaves.length) },
		});

		const groupInner = thGroup.createDiv('ff-pg-group-inner');
		const dot = groupInner.createSpan({ cls: 'ff-pg-col-dot' });
		dot.style.background = col.color;
		groupInner.createSpan({ text: `${col.type.toUpperCase()}: ${col.source.nazwa}` });

		thGroup.addEventListener('click', () => {
			callbacks.onSelectColumn(col.source.id, col.type.toLowerCase() as any);
		});
	}

	// Pasmo Tajemnic
	if (showSecrets) {
		trGroup.createEl('th', {
			cls: 'ff-pg-th-group ff-pg-group-secrets',
			attr: { colspan: String(state.data.secrets.length) },
			text: 'SECRETS',
		});
	}

	// Wiersz 2: Podkolumny / Liście
	const trSub = thead.createEl('tr', { cls: 'ff-pg-tr-sub' });

	for (const col of visibleCols) {
		const colType = col.type.toLowerCase() as 'arc' | 'subplot' | 'mechanic';
		const leaves = col.leaves.length > 0 ? col.leaves : [null];
		for (const sub of leaves) {
			const thLeaf = trSub.createEl('th', {
				cls: 'ff-pg-th-leaf',
				text: sub ?? col.source.nazwa,
			});
			thLeaf.addEventListener('click', () => {
				callbacks.onSelectColumn(col.source.id, colType);
			});
		}
	}

	// Kolumny pojedynczych sekretów
	if (showSecrets) {
		for (const secret of state.data.secrets) {
			const thSec = trSub.createEl('th', {
				cls: 'ff-pg-th-secret-leaf',
				text: secret.id,
				attr: { title: `${secret.id}: ${secret.tytul}` },
			});
			thSec.addEventListener('click', () => {
				callbacks.onSelectSecret(secret.id);
			});
		}
	}

	// -------------------------------------------------------------------------
	// TBODY: Beaty pogrupowane po aktach
	// -------------------------------------------------------------------------
	const tbody = table.createEl('tbody');
	let currentAct: number | null = null;
	const totalColsCount = 1 + visibleCols.reduce((acc, c) => acc + (c.leaves.length || 1), 0) + (showSecrets ? state.data.secrets.length : 0);

	for (const beat of state.data.beats) {
		// Separator Aktu
		if (beat.act !== currentAct) {
			currentAct = beat.act;
			const trAct = tbody.createEl('tr', { cls: 'ff-pg-tr-act-sep' });
			trAct.createEl('td', {
				cls: 'ff-pg-td-act-sep',
				attr: { colspan: String(totalColsCount) },
				text: `AKT ${currentAct}`,
			});
		}

		// Wiersz Beatu
		const trBeat = tbody.createEl('tr', { cls: 'ff-pg-tr-beat' });

		// Kolumna Beatu: Numer, Tytuł, Range oraz Napięcie/Tempo pod spodem
		const tdBeatInfo = trBeat.createEl('td', { cls: 'ff-pg-td-beat-info' });

		const titleRow = tdBeatInfo.createDiv('ff-pg-beat-title-row');
		titleRow.createSpan({ cls: 'ff-pg-beat-order-badge', text: String(beat.order) });
		titleRow.createSpan({ cls: 'ff-pg-beat-name', text: beat.name });

		if (beat.range) {
			tdBeatInfo.createDiv({ cls: 'ff-pg-beat-range', text: `Range ${beat.range}%` });
		}

		// Napięcie i tempo pod nazwą beatu w jego komórce
		const tensionWrap = tdBeatInfo.createDiv('ff-pg-beat-tension-wrap');
		renderTensionTempoBars(tensionWrap, {
			tension: beat.tension,
			pacing: beat.pacing,
		});

		tdBeatInfo.addEventListener('click', () => {
			callbacks.onSelectBeat?.(beat.filePath);
		});

		// Kolumny fabularne
		for (const col of visibleCols) {
			const colType = col.type.toLowerCase() as 'arc' | 'subplot' | 'mechanic';
			const leaves = col.leaves.length > 0 ? col.leaves : [null];

			for (const sub of leaves) {
				const values = cellValue(beat, col.source.id, sub, colType);
				const isSelected = state.selection?.kind === 'cell'
					&& state.selection.beatFilePath === beat.filePath
					&& state.selection.colId === col.source.id
					&& state.selection.sub === sub;

				const tdCell = trBeat.createEl('td', {
					cls: `ff-pg-matrix-cell${isSelected ? ' is-selected' : ''}${values.length === 0 ? ' is-empty' : ''}`,
				});

				renderCellEntries(tdCell, values, '+', 4);

				tdCell.addEventListener('click', (e) => {
					e.stopPropagation();
					callbacks.onSelectCell(beat.filePath, col.source.id, sub, colType);
				});
			}
		}

		// Kolumny sekretów
		if (showSecrets) {
			for (const secret of state.data.secrets) {
				const isTargetReveal = secret.revealTarget?.toLowerCase() === beat.name.toLowerCase();
				const kinds: SecretEventKind[] = [];
				if (beat.sekretZasiew.includes(secret.id)) kinds.push('zasiew');
				if (beat.sekretCzesciowo.includes(secret.id)) kinds.push('czesciowo');
				if (beat.sekretPelne.includes(secret.id)) kinds.push('pelne');
				if (beat.sekretPodwazenie.includes(secret.id)) kinds.push('podwazenie');

				const tdSec = trBeat.createEl('td', {
					cls: `ff-pg-secret-cell${isTargetReveal ? ' is-target-reveal-cell' : ''}`,
				});

				if (kinds.length > 0) {
					for (const k of kinds) {
						renderSecretChip(tdSec, {
							kind: k,
							isTargetReveal: isTargetReveal && k === 'pelne',
							interactive: true,
							onClick: () => callbacks.onSelectSecret(secret.id),
						});
					}
				}

				tdSec.addEventListener('click', () => {
					callbacks.onSelectSecret(secret.id);
				});
			}
		}
	}

	return scrollWrap;
}
