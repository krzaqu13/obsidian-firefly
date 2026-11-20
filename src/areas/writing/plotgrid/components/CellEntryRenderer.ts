import { setIcon } from 'obsidian';

/**
 * Renderuje wpisy wewnątrz komórki tabeli PlotGrid z obsługą ucinania tekstu
 * powyżej 4-5 linii oraz indykatorem z ikonką sugerującą więcej treści.
 */
export function renderCellEntries(
	container: HTMLElement,
	values: string[],
	placeholder: string = '+',
	maxLines: number = 4,
): void {
	if (!values || values.length === 0) {
		container.createSpan({ cls: 'ff-pg-cell-placeholder', text: placeholder });
		return;
	}

	const wrap = container.createDiv('ff-pg-cell-entries-wrap');
	let totalLines = 0;
	let hasOverflow = false;
	let renderedCount = 0;

	for (let i = 0; i < values.length; i++) {
		const val = values[i] ?? '';
		// Szacunkowa liczba linii (w komórce ~200px mieści się ok. 30-34 znaków na linię)
		const linesFromLength = Math.max(1, Math.ceil(val.length / 32));
		const newlines = (val.match(/\n/g) || []).length;
		const estimatedLines = linesFromLength + newlines;

		if (totalLines + estimatedLines > maxLines && renderedCount > 0) {
			hasOverflow = true;
			break;
		}

		const entryEl = wrap.createDiv('ff-pg-cell-entry');
		entryEl.textContent = val;

		// Jeśli pojedynczy wpis sam w sobie przekracza limit linii, ucinamy go przez CSS line-clamp
		if (estimatedLines > maxLines) {
			entryEl.addClass('is-clamped');
			hasOverflow = true;
			renderedCount++;
			totalLines += maxLines;
			break;
		}

		totalLines += estimatedLines;
		renderedCount++;
	}

	if (!hasOverflow && renderedCount < values.length) {
		hasOverflow = true;
	}

	if (hasOverflow) {
		const remaining = values.length - renderedCount;
		const indicator = container.createDiv('ff-pg-cell-more-indicator');
		const iconEl = indicator.createSpan('ff-pg-cell-more-icon');
		setIcon(iconEl, 'chevrons-down');
		indicator.createSpan({
			cls: 'ff-pg-cell-more-text',
			text: remaining > 0 ? `+${remaining} więcej` : 'więcej…',
		});
		indicator.setAttribute('title', 'Kliknij komórkę, aby zobaczyć pełną treść w prawym panelu');
	}
}
