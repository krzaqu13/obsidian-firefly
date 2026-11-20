import type { SecretEventKind, SecretEventCode } from '../../../../models/Secret';
import { SECRET_EVENT_CODES, SECRET_EVENT_CHIP_LABELS } from '../../../../models/Secret';

export interface SecretChipOptions {
	kind: SecretEventKind;
	secretId?: string;
	interactive?: boolean;
	isTargetReveal?: boolean;
	onClick?: () => void;
}

/**
 * Renderuje pojedynczy chip zdarzenia sekretu:
 * S (zasiew - niebieski), P (częściowo - zarys zielonkawy),
 * R (pełna - pełny zielony), U (podważenie - pomarańcz/glina).
 */
export function renderSecretChip(container: HTMLElement, options: SecretChipOptions): HTMLElement {
	const code: SecretEventCode = SECRET_EVENT_CODES[options.kind] ?? 'S';
	const label = SECRET_EVENT_CHIP_LABELS[options.kind] ?? options.kind;

	const chip = container.createEl('span', {
		cls: `ff-pg-secret-chip ff-pg-chip-${options.kind}${options.isTargetReveal ? ' is-target-reveal' : ''}${options.interactive ? ' is-interactive' : ''}`,
		attr: {
			'data-kind': options.kind,
			'aria-label': options.secretId ? `${label}: ${options.secretId}` : label,
			title: options.secretId ? `${options.secretId} (${label})` : label,
		},
	});

	chip.createSpan({ cls: 'ff-pg-chip-code', text: code });
	if (options.secretId) {
		chip.createSpan({ cls: 'ff-pg-chip-id', text: options.secretId });
	}

	if (options.interactive && options.onClick) {
		chip.addEventListener('click', (e) => {
			e.stopPropagation();
			options.onClick?.();
		});
	}

	return chip;
}

/**
 * Renderuje legendę zdarzeń sekretów:
 * ZDARZENIA SEKRETÓW: [S] zasiew  [P] częściowo  [R] pełna  [U] podważenie
 */
export function renderSecretLegend(container: HTMLElement): HTMLElement {
	const legend = container.createDiv('ff-pg-secret-legend');
	legend.createSpan({ cls: 'ff-pg-legend-title', text: 'ZDARZENIA SEKRETÓW' });

	const items: SecretEventKind[] = ['zasiew', 'czesciowo', 'pelne', 'podwazenie'];
	for (const kind of items) {
		const item = legend.createDiv('ff-pg-legend-item');
		renderSecretChip(item, { kind });
		item.createSpan({ cls: 'ff-pg-legend-label', text: SECRET_EVENT_CHIP_LABELS[kind].toLowerCase() });
	}

	return legend;
}
