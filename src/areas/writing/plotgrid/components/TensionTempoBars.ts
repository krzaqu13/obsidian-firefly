export interface TensionTempoOptions {
	tension?: number; // 1-10
	pacing?: number;  // 1-10
}

/**
 * Renderuje podwójny pasek wizualny napięcia (czerwony) i tempa (żółty)
 * z liczbami po prawej stronie, zgodnie z makietą PlotGridu.
 */
export function renderTensionTempoBars(container: HTMLElement, options: TensionTempoOptions): HTMLElement {
	const wrap = container.createDiv('ff-pg-tension-tempo-wrap');

	const tension = options.tension ?? 0;
	const pacing = options.pacing ?? 0;

	// Wiersz Napięcie (Tension - czerwony)
	const tensionRow = wrap.createDiv('ff-pg-bar-row ff-pg-tension-row');
	const tensionBarTrack = tensionRow.createDiv('ff-pg-bar-track');
	const tensionFill = tensionBarTrack.createDiv('ff-pg-bar-fill ff-pg-fill-tension');
	tensionFill.style.width = `${Math.min(100, Math.max(0, tension * 10))}%`;
	tensionRow.createSpan({
		cls: 'ff-pg-bar-val',
		text: tension > 0 ? String(tension) : '—',
	});

	// Wiersz Tempo (Pacing - żółty/bursztynowy)
	const pacingRow = wrap.createDiv('ff-pg-bar-row ff-pg-pacing-row');
	const pacingBarTrack = pacingRow.createDiv('ff-pg-bar-track');
	const pacingFill = pacingBarTrack.createDiv('ff-pg-bar-fill ff-pg-fill-pacing');
	pacingFill.style.width = `${Math.min(100, Math.max(0, pacing * 10))}%`;
	pacingRow.createSpan({
		cls: 'ff-pg-bar-val',
		text: pacing > 0 ? String(pacing) : '—',
	});

	return wrap;
}
