import type { ValidationResult } from '../../PlotGridValidator';

export interface ValidationBadgeOptions {
	validation: ValidationResult;
	onClick?: () => void;
}

/**
 * Renderuje odznakę podsumowania walidacji (np. "0 ostrzeżeń", "2 ostrzeżenia").
 */
export function renderValidationBadge(container: HTMLElement, options: ValidationBadgeOptions): HTMLElement {
	const warnCount = options.validation.issues.filter(i => i.severity === 'warn').length;
	const badge = container.createEl('button', {
		cls: `ff-pg-badge ff-pg-badge-validation${warnCount > 0 ? ' has-warnings' : ' is-clean'}`,
		attr: { type: 'button' },
	});

	const text = warnCount === 0
		? '0 ostrzeżeń'
		: warnCount === 1
		? '1 ostrzeżenie'
		: warnCount < 5
		? `${warnCount} ostrzeżenia`
		: `${warnCount} ostrzeżeń`;

	badge.setText(text);

	if (options.onClick) {
		badge.addEventListener('click', (e) => {
			e.stopPropagation();
			options.onClick?.();
		});
	}

	return badge;
}

/**
 * Renderuje sekcję zielonych boksów potwierdzeń reguł walidacji
 * pod macierzą w widoku Secrets (np. "OK Każda odsłona pełna ma wcześniejszy zasiew").
 */
export function renderValidationBoxList(container: HTMLElement, validation: ValidationResult): HTMLElement {
	const wrap = container.createDiv('ff-pg-validations-section');
	wrap.createDiv({ cls: 'ff-pg-section-title', text: 'WALIDACJE' });

	const list = wrap.createDiv('ff-pg-validations-list');

	// Wyświetl ostrzeżenia jeśli istnieją
	for (const issue of validation.issues) {
		const row = list.createDiv('ff-pg-validation-row is-warn');
		row.createSpan({ cls: 'ff-pg-val-pill is-warn', text: 'WARN' });
		const content = row.createDiv('ff-pg-val-content');
		content.createDiv({ cls: 'ff-pg-val-title', text: issue.title });
		if (issue.detail) {
			content.createDiv({ cls: 'ff-pg-val-detail', text: issue.detail });
		}
	}

	// Wyświetl reguły spełnione (OK)
	for (const okItem of validation.ok) {
		const row = list.createDiv('ff-pg-validation-row is-ok');
		row.createSpan({ cls: 'ff-pg-val-pill is-ok', text: 'OK' });
		const content = row.createDiv('ff-pg-val-content');
		content.createDiv({ cls: 'ff-pg-val-title', text: okItem.title });
		if (okItem.detail) {
			content.createDiv({ cls: 'ff-pg-val-detail', text: okItem.detail });
		}
	}

	return wrap;
}
