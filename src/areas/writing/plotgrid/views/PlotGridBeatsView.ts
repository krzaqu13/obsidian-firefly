import type { PlotGridState } from '../state/PlotGridState';
import { renderTensionTempoBars } from '../components/TensionTempoBars';
import { renderSecretChip } from '../components/SecretChip';
import { cellValue } from '../../../../services/PlotGridReader';
import type { SecretEventKind } from '../../../../models/Secret';

export interface PlotGridBeatsViewCallbacks {
	onSelectBeat: (beatFilePath: string) => void;
	onSelectSecret: (secretId: string) => void;
}

export function renderPlotGridBeatsView(
	container: HTMLElement,
	state: PlotGridState,
	callbacks: PlotGridBeatsViewCallbacks,
): HTMLElement {
	const scrollWrap = container.createDiv('ff-pg-scroll-wrap');
	const table = scrollWrap.createEl('table', { cls: 'ff-pg-list-table' });

	// THEAD
	const thead = table.createEl('thead');
	const trHead = thead.createEl('tr');
	trHead.createEl('th', { cls: 'ff-pg-th-num', text: '#' });
	trHead.createEl('th', { cls: 'ff-pg-th-beat', text: 'BEAT' });
	trHead.createEl('th', { cls: 'ff-pg-th-akt', text: 'AKT' });
	trHead.createEl('th', { cls: 'ff-pg-th-range', text: 'RANGE' });
	trHead.createEl('th', { cls: 'ff-pg-th-purpose', text: 'PURPOSE' });
	trHead.createEl('th', { cls: 'ff-pg-th-tension', text: 'NAPIĘCIE, TEMPO' });
	trHead.createEl('th', { cls: 'ff-pg-th-cells-count', text: 'KOMÓRKI' });
	trHead.createEl('th', { cls: 'ff-pg-th-secrets', text: 'SEKRETY' });
	trHead.createEl('th', { cls: 'ff-pg-th-status', text: 'STATUS' });

	// TBODY
	const tbody = table.createEl('tbody');
	const totalCols = state.data.cols.length;

	for (const beat of state.data.beats) {
		const isSelected = state.selection?.kind === 'beat' && state.selection.beatFilePath === beat.filePath;
		const tr = tbody.createEl('tr', {
			cls: `ff-pg-list-tr${isSelected ? ' is-selected' : ''}`,
		});

		// #
		tr.createEl('td', { cls: 'ff-pg-td-num', text: String(beat.order) });

		// BEAT
		tr.createEl('td', { cls: 'ff-pg-td-beat', text: beat.name });

		// AKT
		tr.createEl('td', { cls: 'ff-pg-td-akt', text: `Akt ${beat.act}` });

		// RANGE
		tr.createEl('td', { cls: 'ff-pg-td-range', text: beat.range ? `${beat.range}%` : '—' });

		// PURPOSE
		tr.createEl('td', { cls: 'ff-pg-td-purpose', text: beat.purpose || '—' });

		// NAPIĘCIE, TEMPO
		const tdTension = tr.createEl('td', { cls: 'ff-pg-td-tension' });
		renderTensionTempoBars(tdTension, {
			tension: beat.tension,
			pacing: beat.pacing,
		});

		// KOMÓRKI (np. 4/6)
		let filledCount = 0;
		for (const col of state.data.cols) {
			const colType = col.type.toLowerCase() as 'arc' | 'subplot' | 'mechanic';
			const leaves = col.leaves.length > 0 ? col.leaves : [null];
			const isFilled = leaves.some(sub => cellValue(beat, col.source.id, sub, colType).length > 0);
			if (isFilled) filledCount++;
		}
		tr.createEl('td', {
			cls: 'ff-pg-td-cells-count',
			text: `${filledCount}/${totalCols}`,
		});

		// SEKRETY
		const tdSec = tr.createEl('td', { cls: 'ff-pg-td-secrets' });
		const secContainer = tdSec.createDiv('ff-pg-secrets-chips-wrap');
		const allSecKinds: Array<{ id: string; kind: SecretEventKind }> = [
			...beat.sekretZasiew.map(id => ({ id, kind: 'zasiew' as SecretEventKind })),
			...beat.sekretCzesciowo.map(id => ({ id, kind: 'czesciowo' as SecretEventKind })),
			...beat.sekretPelne.map(id => ({ id, kind: 'pelne' as SecretEventKind })),
			...beat.sekretPodwazenie.map(id => ({ id, kind: 'podwazenie' as SecretEventKind })),
		];

		if (allSecKinds.length > 0) {
			for (const sk of allSecKinds) {
				renderSecretChip(secContainer, {
					kind: sk.kind,
					secretId: sk.id,
					interactive: true,
					onClick: () => callbacks.onSelectSecret(sk.id),
				});
			}
		} else {
			secContainer.createSpan({ cls: 'ff-pg-muted-dash', text: 'brak' });
		}

		// STATUS
		const tdStatus = tr.createEl('td', { cls: 'ff-pg-td-status' });
		const statusText = beat.status || (beat.stan === 'zatw' ? 'approved' : beat.stan === 'prop' ? 'proposed' : 'open');
		tdStatus.createSpan({
			cls: `ff-pg-status-pill is-${statusText}`,
			text: statusText,
		});

		// Kliknięcie w wiersz
		tr.addEventListener('click', () => {
			callbacks.onSelectBeat(beat.filePath);
		});
	}

	return scrollWrap;
}
