import type { Arc } from '../../../../models/Arc';

export interface ArcFoundationField {
	key: keyof Arc;
	label: string;
	fallback: string;
}

const FOUNDATION_FIELDS: ArcFoundationField[] = [
	{ key: 'ghost', label: 'ghost', fallback: 'brak' },
	{ key: 'lie', label: 'lie', fallback: 'brak' },
	{ key: 'truth', label: 'truth', fallback: 'jeszcze niezdefiniowane' },
	{ key: 'want', label: 'want', fallback: 'brak' },
	{ key: 'need', label: 'need', fallback: 'brak' },
	{ key: 'flaws', label: 'flaws', fallback: 'brak' },
	{ key: 'handicaps', label: 'handicaps', fallback: 'brak' },
	{ key: 'limitations', label: 'limitations', fallback: 'brak' },
];

/**
 * Renderuje siatkę 8 kart fundamentu postaci (ghost, lie, truth, want, need, flaws, handicaps, limitations)
 * na samej górze widoku Arcs, zgodnie z makietą.
 */
export function renderArcFoundationCards(container: HTMLElement, arc: Arc): HTMLElement {
	const grid = container.createDiv('ff-pg-arc-foundation-grid');

	for (const field of FOUNDATION_FIELDS) {
		const rawVal = arc[field.key];
		const textVal = typeof rawVal === 'string' && rawVal.trim() ? rawVal.trim() : field.fallback;
		const isFallback = textVal === field.fallback;

		const card = grid.createDiv('ff-pg-arc-foundation-card');
		card.createDiv({ cls: 'ff-pg-arc-card-label', text: field.label });
		card.createDiv({
			cls: `ff-pg-arc-card-value${isFallback ? ' is-empty' : ''}`,
			text: textVal,
		});
	}

	return grid;
}
