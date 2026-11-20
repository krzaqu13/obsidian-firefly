import { ALL_LIBRARY_ITEMS } from '../../models/StoryBeatsPresets';
import type { SavedBeatModel } from '../../settings';

export function renderBeatsPreview(
	container: HTMLElement,
	presetId: string,
	savedCustomModels: SavedBeatModel[] = [],
): void {
	container.empty();
	container.addClass('firefly-beats-preview-wrapper');

	let beats = ALL_LIBRARY_ITEMS.find(item => item.id === presetId)?.beats;
	let modelName = ALL_LIBRARY_ITEMS.find(item => item.id === presetId)?.name;

	if (!beats && presetId.startsWith('custom_model_')) {
		const custom = savedCustomModels.find(m => m.id === presetId);
		if (custom) {
			beats = custom.beats;
			modelName = `${custom.name} (Własny)`;
		}
	}

	if (!beats || !beats.length) {
		container.createEl('div', {
			cls: 'firefly-empty-state',
			text: 'Brak zdefiniowanych beatów w tym profilu.',
		});
		return;
	}

	const header = container.createDiv('firefly-beats-preview-header');
	header.createEl('span', {
		cls: 'firefly-beats-count-badge',
		text: `${modelName || presetId} (${beats.length} beatów)`,
	});

	const list = container.createDiv('firefly-beats-preview-list');

	beats.forEach((b, idx) => {
		const item = list.createDiv('firefly-beat-preview-item');

		const meta = item.createDiv('firefly-beat-preview-meta');
		meta.createSpan({ cls: 'firefly-beat-order-badge', text: `#${idx + 1}` });
		meta.createSpan({ cls: 'firefly-beat-act-badge', text: `Akt ${b.act}` });

		const content = item.createDiv('firefly-beat-preview-content');
		content.createEl('strong', { text: b.name, cls: 'firefly-beat-name' });
		if (b.purpose) {
			content.createEl('p', { text: b.purpose, cls: 'firefly-beat-purpose' });
		}
	});
}
