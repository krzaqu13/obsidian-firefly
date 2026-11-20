import type { PlotGridState } from '../state/PlotGridState';
import { renderSecretChip } from '../components/SecretChip';
import { renderValidationBoxList } from '../components/ValidationBadge';
import type { SecretEventKind } from '../../../../models/Secret';

export interface PlotGridSecretsViewCallbacks {
	onSelectSecret: (secretId: string) => void;
	onSelectBeat?: (beatFilePath: string) => void;
}

export function renderPlotGridSecretsView(
	container: HTMLElement,
	state: PlotGridState,
	callbacks: PlotGridSecretsViewCallbacks,
): HTMLElement {
	const scrollWrap = container.createDiv('ff-pg-scroll-wrap');

	// 1. Tabela Macierzy Sekretów
	const table = scrollWrap.createEl('table', { cls: 'ff-pg-secrets-matrix-table' });

	// THEAD: ID, SEKRET, 1, 2, 3 ... N
	const thead = table.createEl('thead');
	const trHead = thead.createEl('tr');
	trHead.createEl('th', { cls: 'ff-pg-th-secret-id', text: 'ID' });
	trHead.createEl('th', { cls: 'ff-pg-th-secret-title', text: 'SEKRET' });

	for (const beat of state.data.beats) {
		const thBeat = trHead.createEl('th', {
			cls: 'ff-pg-th-beat-num',
			text: String(beat.order),
			attr: { title: `${beat.order}. ${beat.name}` },
		});
		thBeat.addEventListener('click', () => {
			callbacks.onSelectBeat?.(beat.filePath);
		});
	}

	// TBODY
	const tbody = table.createEl('tbody');
	for (const secret of state.data.secrets) {
		const isSelected = state.selection?.kind === 'secret' && state.selection.secretId === secret.id;
		const tr = tbody.createEl('tr', {
			cls: `ff-pg-secret-tr${isSelected ? ' is-selected' : ''}`,
		});

		// ID
		tr.createEl('td', { cls: 'ff-pg-td-secret-id', text: secret.id });

		// SEKRET (Tytuł + cel odsłony)
		const tdTitle = tr.createEl('td', { cls: 'ff-pg-td-secret-desc' });
		tdTitle.createDiv({ cls: 'ff-pg-secret-row-title', text: secret.tytul });
		if (secret.revealTarget) {
			const targetBeat = state.data.beats.find(b => b.name.toLowerCase() === secret.revealTarget?.toLowerCase());
			const targetOrderText = targetBeat ? `beat ${targetBeat.order}` : secret.revealTarget;
			tdTitle.createDiv({ cls: 'ff-pg-secret-row-target', text: `cel odsłony: ${targetOrderText}` });
		}

		// Kolumny beatów 1..N
		for (const beat of state.data.beats) {
			const isTargetBeat = secret.revealTarget?.toLowerCase() === beat.name.toLowerCase();

			const kinds: SecretEventKind[] = [];
			if (beat.sekretZasiew.includes(secret.id)) kinds.push('zasiew');
			if (beat.sekretCzesciowo.includes(secret.id)) kinds.push('czesciowo');
			if (beat.sekretPelne.includes(secret.id)) kinds.push('pelne');
			if (beat.sekretPodwazenie.includes(secret.id)) kinds.push('podwazenie');

			const tdCell = tr.createEl('td', {
				cls: `ff-pg-secret-event-cell${isTargetBeat ? ' is-reveal-target-cell' : ''}`,
			});

			if (kinds.length > 0) {
				for (const k of kinds) {
					renderSecretChip(tdCell, {
						kind: k,
						isTargetReveal: isTargetBeat && k === 'pelne',
					});
				}
			}

			tdCell.addEventListener('click', (e) => {
				e.stopPropagation();
				callbacks.onSelectSecret(secret.id);
			});
		}

		tr.addEventListener('click', () => {
			callbacks.onSelectSecret(secret.id);
		});
	}

	// 2. Podpis pod tabelą
	const footnote = scrollWrap.createDiv('ff-pg-table-footnote');
	footnote.setText('Czerwona ramka oznacza beat docelowej odsłony (reveal_target). Numery kolumn to Order beatów.');

	// 3. Sekcja Walidacji
	renderValidationBoxList(scrollWrap, state.data.validation);

	return scrollWrap;
}
