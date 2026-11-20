import type { PlotGridState } from '../state/PlotGridState';

export interface PlotGridScenesViewCallbacks {
	onSelectScene: (sceneFilePath: string) => void;
}

export function renderPlotGridScenesView(
	container: HTMLElement,
	state: PlotGridState,
	callbacks: PlotGridScenesViewCallbacks,
): HTMLElement {
	const scrollWrap = container.createDiv('ff-pg-scroll-wrap');
	const table = scrollWrap.createEl('table', { cls: 'ff-pg-list-table' });

	// THEAD
	const thead = table.createEl('thead');
	const trHead = thead.createEl('tr');
	trHead.createEl('th', { cls: 'ff-pg-th-num', text: '#' });
	trHead.createEl('th', { cls: 'ff-pg-th-scene', text: 'SCENE' });
	trHead.createEl('th', { cls: 'ff-pg-th-beat', text: 'BEAT' });
	trHead.createEl('th', { cls: 'ff-pg-th-akt', text: 'AKT' });
	trHead.createEl('th', { cls: 'ff-pg-th-subplot', text: 'SUBPLOT' });
	trHead.createEl('th', { cls: 'ff-pg-th-pov', text: 'POV' });
	trHead.createEl('th', { cls: 'ff-pg-th-status', text: 'STATUS' });

	// TBODY
	const tbody = table.createEl('tbody');

	let index = 1;
	for (const scene of state.data.scenes) {
		const isSelected = state.selection?.kind === 'scene' && state.selection.sceneFilePath === scene.filePath;
		const tr = tbody.createEl('tr', {
			cls: `ff-pg-list-tr${isSelected ? ' is-selected' : ''}`,
		});

		// #
		tr.createEl('td', { cls: 'ff-pg-td-num', text: String(scene.sequence ?? index++) });

		// SCENE
		tr.createEl('td', { cls: 'ff-pg-td-scene', text: scene.title });

		// BEAT
		tr.createEl('td', { cls: 'ff-pg-td-beat', text: scene.beat || '—' });

		// AKT
		tr.createEl('td', { cls: 'ff-pg-td-akt', text: scene.act ? `Akt ${scene.act}` : 'Akt 1' });

		// SUBPLOT
		const subText = scene.subplots?.join(', ') || '—';
		const tdSub = tr.createEl('td', { cls: 'ff-pg-td-subplot' });
		if (scene.subplots && scene.subplots.length > 0) {
			for (const sp of scene.subplots) {
				tdSub.createSpan({ cls: 'ff-pg-subplot-tag', text: sp });
			}
		} else {
			tdSub.setText('—');
		}

		// POV
		tr.createEl('td', { cls: 'ff-pg-td-pov', text: scene.pov || '—' });

		// STATUS
		const tdStatus = tr.createEl('td', { cls: 'ff-pg-td-status' });
		const statusText = scene.status || 'approved';
		tdStatus.createSpan({
			cls: `ff-pg-status-pill is-${statusText}`,
			text: statusText,
		});

		// Kliknięcie w wiersz
		tr.addEventListener('click', () => {
			callbacks.onSelectScene(scene.filePath);
		});
	}

	return scrollWrap;
}
