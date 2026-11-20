import {
	App,
	Modal,
	Notice,
	MarkdownRenderer,
	TFile,
	setIcon,
} from 'obsidian';
import type FireflyPlugin from '../../main';
import {
	Scene,
	SceneStatus,
	TIMELINE_MODES,
	TIMELINE_MODE_LABELS,
	TimelineMode,
	STATUS_ORDER,
	getStatusCfg,
} from '../../models/Scene';

export interface SceneDetailsCallbacks {
	onEdit: (scene: Scene) => void;
	onDelete: (scene: Scene) => void;
	onRefresh: () => void;
	onStatusChange?: (scene: Scene, newStatus: SceneStatus) => void;
	onClose?: () => void;
}

/**
 * Modal potwierdzenia operacji (np. usunięcia sceny).
 */
export class ConfirmModal extends Modal {
	private titleText: string;
	private messageText: string;
	private confirmLabel: string;
	private onConfirm: () => void;

	constructor(
		app: App,
		options: {
			title: string;
			message: string;
			confirmLabel?: string;
			onConfirm: () => void;
		}
	) {
		super(app);
		this.titleText = options.title;
		this.messageText = options.message;
		this.confirmLabel = options.confirmLabel ?? 'Potwierdź';
		this.onConfirm = options.onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('firefly-confirm-modal');

		contentEl.createEl('h2', { text: this.titleText });
		contentEl.createEl('p', { text: this.messageText });

		const btnRow = contentEl.createDiv('firefly-modal-btn-row');
		const cancelBtn = btnRow.createEl('button', { text: 'Anuluj', cls: 'firefly-modal-btn' });
		cancelBtn.addEventListener('click', () => this.close());

		const confirmBtn = btnRow.createEl('button', {
			text: this.confirmLabel,
			cls: 'firefly-modal-btn firefly-modal-btn-warning mod-warning',
		});
		confirmBtn.addEventListener('click', () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Helper: renderowanie interaktywnego pola tag-pill (chipy) z autouzupełnianiem.
 */
export function renderTagPillInput(opts: {
	container: HTMLElement;
	values: string[];
	getSuggestions: () => string[];
	onChange: (values: string[]) => Promise<void> | void;
	placeholder?: string;
	highlightValue?: string;
	highlightLabel?: string;
}): void {
	const { container, getSuggestions, onChange, placeholder, highlightValue, highlightLabel } = opts;
	let currentValues = [...(opts.values || [])];

	container.empty();
	container.addClass('firefly-tag-pill-container');

	const listEl = container.createDiv('firefly-tag-pill-list');

	const renderPills = () => {
		listEl.empty();
		for (const val of currentValues) {
			const isHighlight = highlightValue && val.toLowerCase() === highlightValue.toLowerCase();
			const pill = listEl.createSpan({
				cls: `firefly-tag-pill${isHighlight ? ' is-highlight' : ''}`,
			});
			pill.createSpan({ text: val, cls: 'firefly-tag-pill-text' });
			if (isHighlight && highlightLabel) {
				pill.createSpan({ text: ` ${highlightLabel}`, cls: 'firefly-tag-pill-badge' });
			}
			const removeBtn = pill.createSpan({ text: '×', cls: 'firefly-tag-pill-remove' });
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				currentValues = currentValues.filter((v) => v !== val);
				renderPills();
				void onChange(currentValues);
			});
		}

		// Input do wpisywania i wyszukiwania
		const inputWrapper = listEl.createDiv('firefly-tag-pill-input-wrap');
		const input = inputWrapper.createEl('input', {
			cls: 'firefly-tag-pill-input',
			attr: { type: 'text', placeholder: currentValues.length === 0 ? (placeholder || 'Dodaj…') : '+' },
		});

		const dropdown = inputWrapper.createDiv('firefly-suggest-dropdown');
		dropdown.setCssStyles({ display: 'none' });

		const showDropdown = () => {
			const query = input.value.trim().toLowerCase();
			const all = getSuggestions();
			const filtered = all.filter(
				(item) =>
					!currentValues.some((v) => v.toLowerCase() === item.toLowerCase()) &&
					(!query || item.toLowerCase().includes(query))
			);

			dropdown.empty();
			if (filtered.length === 0) {
				dropdown.setCssStyles({ display: 'none' });
				return;
			}

			filtered.slice(0, 10).forEach((item, idx) => {
				const opt = dropdown.createDiv('firefly-suggest-item');
				opt.setText(item);
				opt.addEventListener('mousedown', (e) => {
					e.preventDefault();
					e.stopPropagation();
					if (!currentValues.includes(item)) {
						currentValues.push(item);
						renderPills();
						void onChange(currentValues);
					}
				});
			});
			dropdown.setCssStyles({ display: 'block' });
		};

		input.addEventListener('input', () => showDropdown());
		input.addEventListener('focus', () => showDropdown());
		input.addEventListener('blur', () => {
			window.setTimeout(() => dropdown.setCssStyles({ display: 'none' }), 150);
		});

		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const val = input.value.trim();
				if (val && !currentValues.some((v) => v.toLowerCase() === val.toLowerCase())) {
					currentValues.push(val);
					renderPills();
					void onChange(currentValues);
				}
				input.value = '';
				dropdown.setCssStyles({ display: 'none' });
			} else if (e.key === 'Backspace' && !input.value && currentValues.length > 0) {
				currentValues.pop();
				renderPills();
				void onChange(currentValues);
			} else if (e.key === 'Escape') {
				dropdown.setCssStyles({ display: 'none' });
			}
		});
	};

	renderPills();
}

/**
 * Helper: renderowanie pojedynczego pola z autouzupełnianiem.
 */
export function renderAutocompleteInput(opts: {
	container: HTMLElement;
	value: string;
	getSuggestions: () => string[];
	onChange: (value: string) => Promise<void> | void;
	placeholder?: string;
	icon?: string;
}): void {
	const { container, value, getSuggestions, onChange, placeholder, icon } = opts;
	container.empty();
	container.addClass('firefly-autocomplete-container');

	const wrap = container.createDiv('firefly-autocomplete-input-wrap');
	if (icon) {
		const iconEl = wrap.createSpan({ cls: 'firefly-autocomplete-icon' });
		setIcon(iconEl, icon);
	}

	const input = wrap.createEl('input', {
		cls: 'firefly-autocomplete-input',
		attr: { type: 'text', placeholder: placeholder || 'Wyszukaj…' },
	});
	input.value = value || '';

	const dropdown = wrap.createDiv('firefly-suggest-dropdown');
	dropdown.setCssStyles({ display: 'none' });

	const showDropdown = () => {
		const query = input.value.trim().toLowerCase();
		const all = getSuggestions();
		const filtered = all.filter((item) => !query || item.toLowerCase().includes(query));

		dropdown.empty();
		if (filtered.length === 0) {
			dropdown.setCssStyles({ display: 'none' });
			return;
		}

		filtered.slice(0, 10).forEach((item) => {
			const opt = dropdown.createDiv('firefly-suggest-item');
			opt.setText(item);
			opt.addEventListener('mousedown', (e) => {
				e.preventDefault();
				e.stopPropagation();
				input.value = item;
				dropdown.setCssStyles({ display: 'none' });
				void onChange(item);
			});
		});
		dropdown.setCssStyles({ display: 'block' });
	};

	input.addEventListener('input', () => showDropdown());
	input.addEventListener('focus', () => showDropdown());
	input.addEventListener('blur', () => {
		window.setTimeout(() => dropdown.setCssStyles({ display: 'none' }), 150);
		void onChange(input.value.trim());
	});
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			dropdown.setCssStyles({ display: 'none' });
			input.blur();
		} else if (e.key === 'Escape') {
			dropdown.setCssStyles({ display: 'none' });
		}
	});
}

/**
 * SceneDetails — panel boczny ze szczegółami i pełną edycją sceny.
 * Zawiera wszystkie funkcje i pola z InspectorComponent w obsidian-storyline-1.10.78.
 */
export class SceneDetails {
	private plugin: FireflyPlugin;
	private container: HTMLElement;
	private currentScene: Scene | null = null;
	private callbacks: SceneDetailsCallbacks;

	constructor(
		container: HTMLElement,
		plugin: FireflyPlugin,
		callbacks: SceneDetailsCallbacks
	) {
		this.container = container;
		this.plugin = plugin;
		this.callbacks = callbacks;
	}

	show(scene: Scene): void {
		// Jeśli użytkownik aktualnie pisze w polu formularza, nie niszczymy DOM
		if (
			this.currentScene?.filePath === scene.filePath &&
			this.container.querySelector('input:focus, textarea:focus, select:focus')
		) {
			this.currentScene = scene;
			return;
		}

		this.currentScene = scene;
		this.render();
		this.container.setCssStyles({ display: 'flex' });
	}

	isVisible(): boolean {
		return this.container.style.display !== 'none' && this.currentScene !== null;
	}

	getCurrentScene(): Scene | null {
		return this.currentScene;
	}

	hide(): void {
		this.currentScene = null;
		this.container.setCssStyles({ display: 'none' });
		this.callbacks.onClose?.();
	}

	private formatIntensity(val: number): string {
		if (val > 0) return `+${val}`;
		if (val < 0) return `${val}`;
		return '0';
	}

	private render(): void {
		const scene = this.currentScene;
		if (!scene) return;

		this.container.empty();
		this.container.addClass('firefly-inspector-panel');

		const inspector = this.container.createDiv('firefly-inspector');

		// ── 1. Header ───────────────────────────────────────────────
		const header = inspector.createDiv('firefly-inspector-header');
		header.createEl('h3', { text: 'Szczegóły sceny', cls: 'firefly-inspector-title' });

		const closeBtn = header.createEl('button', {
			cls: 'firefly-inspector-close clickable-icon',
			attr: { 'aria-label': 'Zamknij panel szczegółów' },
		});
		setIcon(closeBtn, 'x');
		closeBtn.addEventListener('click', () => this.hide());

		// ── 2. Tytuł & Podtytuł ─────────────────────────────────────
		const titleSection = inspector.createDiv('firefly-inspector-title-section');

		const titleInput = titleSection.createEl('input', {
			cls: 'firefly-inspector-title-input',
			attr: { type: 'text', placeholder: 'Tytuł sceny…' },
		});
		titleInput.value = scene.title || '';
		titleInput.addEventListener('change', async () => {
			const val = titleInput.value.trim();
			if (val && val !== scene.title) {
				scene.title = val;
				await this.plugin.sceneReader.updateScene(scene.filePath, { title: val });
				this.callbacks.onRefresh();
			}
		});

		const subtitleInput = titleSection.createEl('input', {
			cls: 'firefly-inspector-subtitle-input',
			attr: { type: 'text', placeholder: 'Podtytuł (opcjonalny)…' },
		});
		subtitleInput.value = scene.subtitle || '';
		subtitleInput.addEventListener('change', async () => {
			const val = subtitleInput.value.trim() || undefined;
			scene.subtitle = val;
			await this.plugin.sceneReader.updateScene(scene.filePath, { subtitle: val });
		});

		// ── 3. Akt / Rozdział / Sekwencja ────────────────────────────
		const acRow = inspector.createDiv('firefly-inspector-section firefly-inspector-grid-3');

		// Akt
		const actGroup = acRow.createDiv('firefly-inspector-field');
		actGroup.createSpan({ cls: 'firefly-inspector-label', text: 'Akt' });
		const actInput = actGroup.createEl('input', {
			cls: 'firefly-inspector-input',
			attr: { type: 'text', placeholder: 'np. 1' },
		});
		actInput.value = scene.act !== undefined ? String(scene.act) : '';
		actInput.addEventListener('change', async () => {
			const val = actInput.value.trim();
			const parsed = !isNaN(Number(val)) && val !== '' ? Number(val) : val || undefined;
			scene.act = parsed;
			await this.plugin.sceneReader.updateScene(scene.filePath, { act: parsed });
			this.callbacks.onRefresh();
		});

		// Prologue / Epilogue buttons
		const actQuick = actGroup.createDiv('firefly-inspector-act-quick');
		const proBtn = actQuick.createEl('button', {
			cls: `firefly-inspector-quick-btn${String(scene.act).toLowerCase() === 'prologue' || String(scene.act).toLowerCase() === 'prolog' ? ' is-active' : ''}`,
			text: 'Prolog',
		});
		proBtn.addEventListener('click', async () => {
			const isPro = String(scene.act).toLowerCase() === 'prolog';
			const newVal = isPro ? undefined : 'Prolog';
			actInput.value = newVal || '';
			scene.act = newVal;
			await this.plugin.sceneReader.updateScene(scene.filePath, { act: newVal });
			this.callbacks.onRefresh();
			this.show(scene);
		});

		const epiBtn = actQuick.createEl('button', {
			cls: `firefly-inspector-quick-btn${String(scene.act).toLowerCase() === 'epilogue' || String(scene.act).toLowerCase() === 'epilog' ? ' is-active' : ''}`,
			text: 'Epilog',
		});
		epiBtn.addEventListener('click', async () => {
			const isEpi = String(scene.act).toLowerCase() === 'epilog';
			const newVal = isEpi ? undefined : 'Epilog';
			actInput.value = newVal || '';
			scene.act = newVal;
			await this.plugin.sceneReader.updateScene(scene.filePath, { act: newVal });
			this.callbacks.onRefresh();
			this.show(scene);
		});

		// Rozdział
		const chGroup = acRow.createDiv('firefly-inspector-field');
		chGroup.createSpan({ cls: 'firefly-inspector-label', text: 'Rozdział' });
		const chInput = chGroup.createEl('input', {
			cls: 'firefly-inspector-input',
			attr: { type: 'text', placeholder: 'np. 1' },
		});
		chInput.value = scene.chapter !== undefined ? String(scene.chapter) : '';
		chInput.addEventListener('change', async () => {
			const val = chInput.value.trim();
			const parsed = !isNaN(Number(val)) && val !== '' ? Number(val) : val || undefined;
			scene.chapter = parsed;
			await this.plugin.sceneReader.updateScene(scene.filePath, { chapter: parsed });
			this.callbacks.onRefresh();
		});

		// Sekwencja
		const seqGroup = acRow.createDiv('firefly-inspector-field');
		seqGroup.createSpan({ cls: 'firefly-inspector-label', text: 'Sekwencja' });
		const seqInput = seqGroup.createEl('input', {
			cls: 'firefly-inspector-input',
			attr: { type: 'number', placeholder: '#' },
		});
		seqInput.value = scene.sequence !== undefined ? String(scene.sequence) : '';
		seqInput.addEventListener('change', async () => {
			const val = seqInput.value.trim() ? Number(seqInput.value) : undefined;
			scene.sequence = val;
			await this.plugin.sceneReader.updateScene(scene.filePath, { sequence: val });
			this.callbacks.onRefresh();
		});

		// ── 4. Chronological Order ──────────────────────────────────
		const chronoSection = inspector.createDiv('firefly-inspector-section');
		chronoSection.createSpan({ cls: 'firefly-inspector-label', text: 'Kolejność chronologiczna: ' });
		const chronoInput = chronoSection.createEl('input', {
			cls: 'firefly-inspector-input',
			attr: { type: 'text', placeholder: 'Taka sama jak sekwencja jeśli puste' },
		});
		chronoInput.value = scene.chronologicalOrder !== undefined ? String(scene.chronologicalOrder) : '';
		chronoInput.addEventListener('change', async () => {
			const val = chronoInput.value.trim();
			const parsed = !isNaN(Number(val)) && val !== '' ? Number(val) : val || undefined;
			scene.chronologicalOrder = parsed;
			await this.plugin.sceneReader.updateScene(scene.filePath, { chronologicalOrder: parsed });
		});

		// ── 5. Status dropdown ──────────────────────────────────────
		const statusSection = inspector.createDiv('firefly-inspector-section firefly-inspector-status-row');
		statusSection.createSpan({ cls: 'firefly-inspector-label', text: 'Status: ' });

		const statusDropdown = statusSection.createDiv('firefly-inspector-status-dropdown');
		const currentStatus = scene.status || 'idea';
		const currentCfg = getStatusCfg(currentStatus);

		const statusButton = statusDropdown.createEl('button', {
			cls: 'firefly-inspector-status-button',
		});
		const btnIcon = statusButton.createSpan({ cls: 'firefly-inspector-status-icon' });
		setIcon(btnIcon, currentCfg.icon);
		btnIcon.style.color = currentCfg.color;

		const btnText = statusButton.createSpan({ text: currentCfg.label, cls: 'firefly-inspector-status-text' });
		const btnChevron = statusButton.createSpan({ cls: 'firefly-inspector-status-chevron' });
		setIcon(btnChevron, 'chevron-down');

		const statusMenu = statusDropdown.createDiv('firefly-inspector-status-menu');
		statusMenu.setCssStyles({ display: 'none' });

		STATUS_ORDER.forEach((s) => {
			const cfg = getStatusCfg(s);
			const item = statusMenu.createDiv({
				cls: `firefly-inspector-status-item${s === currentStatus ? ' is-active' : ''}`,
			});
			const itemIcon = item.createSpan({ cls: 'firefly-inspector-status-icon' });
			setIcon(itemIcon, cfg.icon);
			itemIcon.style.color = cfg.color;
			item.createSpan({ text: cfg.label });

			item.addEventListener('click', async (e) => {
				e.stopPropagation();
				statusMenu.setCssStyles({ display: 'none' });
				scene.status = s;
				await this.plugin.sceneReader.updateScene(scene.filePath, { status: s });
				this.callbacks.onStatusChange?.(scene, s);
				this.callbacks.onRefresh();
				this.show(scene);
			});
		});

		statusButton.addEventListener('click', (e) => {
			e.stopPropagation();
			const isVis = statusMenu.style.display !== 'none';
			statusMenu.setCssStyles({ display: isVis ? 'none' : 'block' });
		});

		const closeStatusMenu = (e: MouseEvent) => {
			if (!statusDropdown.contains(e.target as Node)) {
				statusMenu.setCssStyles({ display: 'none' });
				activeDocument.removeEventListener('click', closeStatusMenu);
			}
		};
		statusButton.addEventListener('click', () => {
			window.setTimeout(() => activeDocument.addEventListener('click', closeStatusMenu), 0);
		});

		// ── 6. Nieaktywna scena (Checkbox) ──────────────────────────
		const inactiveSection = inspector.createDiv('firefly-inspector-section firefly-inspector-inactive');
		const inactiveLabel = inactiveSection.createEl('label', { cls: 'firefly-inspector-checkbox-row' });
		const inactiveCheckbox = inactiveLabel.createEl('input', { type: 'checkbox' });
		inactiveCheckbox.checked = !!scene.inactive;
		inactiveLabel.createSpan({ text: 'Nieaktywna scena' });
		inactiveSection.createDiv({
			cls: 'firefly-inspector-help-text',
			text: 'Nieaktywne sceny pozostają w projekcie, ale są ukrywane w manuskrypcie i eksporcie.',
		});
		inactiveCheckbox.addEventListener('change', async () => {
			scene.inactive = inactiveCheckbox.checked;
			await this.plugin.sceneReader.updateScene(scene.filePath, { inactive: scene.inactive });
			this.callbacks.onRefresh();
		});

		// ── 7. POV (Autocomplete) ───────────────────────────────────
		const povSection = inspector.createDiv('firefly-inspector-section');
		povSection.createSpan({ cls: 'firefly-inspector-label', text: 'POV (Punkt widzenia):' });
		const povContainer = povSection.createDiv('firefly-inspector-field-wrap');
		renderAutocompleteInput({
			container: povContainer,
			value: scene.pov || '',
			getSuggestions: () => this.plugin.sceneReader.getAllCharacters(this.plugin),
			onChange: async (val) => {
				scene.pov = val || undefined;
				await this.plugin.sceneReader.updateScene(scene.filePath, { pov: scene.pov });
				this.callbacks.onRefresh();
			},
			placeholder: 'Wybierz postać POV…',
			icon: 'user',
		});

		// ── 8. Postacie (Tag-pill / chip list) ──────────────────────
		const charSection = inspector.createDiv('firefly-inspector-section');
		charSection.createSpan({ cls: 'firefly-inspector-label', text: 'Postacie w scenie:' });
		const charPillContainer = charSection.createDiv('firefly-inspector-field-wrap');
		renderTagPillInput({
			container: charPillContainer,
			values: scene.characters || [],
			getSuggestions: () => this.plugin.sceneReader.getAllCharacters(this.plugin),
			onChange: async (values) => {
				scene.characters = values;
				await this.plugin.sceneReader.updateScene(scene.filePath, { characters: values });
				this.callbacks.onRefresh();
			},
			placeholder: 'Dodaj postać…',
			highlightValue: scene.pov,
			highlightLabel: '(POV)',
		});

		// ── 9. Lokacja (Autocomplete) ───────────────────────────────
		const locSection = inspector.createDiv('firefly-inspector-section');
		locSection.createSpan({ cls: 'firefly-inspector-label', text: 'Lokacja / Miejsce:' });
		const locContainer = locSection.createDiv('firefly-inspector-field-wrap');
		renderAutocompleteInput({
			container: locContainer,
			value: scene.location || '',
			getSuggestions: () => this.plugin.sceneReader.getAllLocations(this.plugin),
			onChange: async (val) => {
				scene.location = val || undefined;
				await this.plugin.sceneReader.updateScene(scene.filePath, { location: scene.location });
				this.callbacks.onRefresh();
			},
			placeholder: 'Wyszukaj lokację…',
			icon: 'map-pin',
		});

		// ── 10. Timeline Mode / Strand ──────────────────────────────
		const tmRow = inspector.createDiv('firefly-inspector-section firefly-inspector-grid-2');

		const tmGroup = tmRow.createDiv('firefly-inspector-field');
		tmGroup.createSpan({ cls: 'firefly-inspector-label', text: 'Tryb osi czasu' });
		const tmSelect = tmGroup.createEl('select', { cls: 'firefly-inspector-select' });
		for (const m of TIMELINE_MODES) {
			const opt = tmSelect.createEl('option', { text: TIMELINE_MODE_LABELS[m], value: m });
			if ((scene.timeline_mode || 'linear') === m) opt.selected = true;
		}
		tmSelect.addEventListener('change', async () => {
			const val = tmSelect.value as TimelineMode;
			scene.timeline_mode = val;
			await this.plugin.sceneReader.updateScene(scene.filePath, { timeline_mode: val });
		});

		const strandGroup = tmRow.createDiv('firefly-inspector-field');
		strandGroup.createSpan({ cls: 'firefly-inspector-label', text: 'Pasmo (Strand)' });
		const strandInput = strandGroup.createEl('input', {
			cls: 'firefly-inspector-input',
			attr: { type: 'text', placeholder: 'np. "1943", "wątek główny"' },
		});
		strandInput.value = scene.timeline_strand || '';
		strandInput.addEventListener('change', async () => {
			const val = strandInput.value.trim() || undefined;
			scene.timeline_strand = val;
			await this.plugin.sceneReader.updateScene(scene.filePath, { timeline_strand: val });
		});

		// ── 11. Punkt łuku (Arc Point toggle) ───────────────────────
		const arcRow = inspector.createDiv('firefly-inspector-section firefly-inspector-arc-row');
		const arcCheckbox = arcRow.createEl('input', {
			attr: { type: 'checkbox', id: 'firefly-arc-toggle' },
		});
		arcCheckbox.checked = !!scene.arcAnchor;
		const arcLabel = arcRow.createEl('label', {
			attr: { for: 'firefly-arc-toggle' },
			text: 'Kluczowy punkt łuku narracyjnego (Arc point)',
			cls: 'firefly-inspector-checkbox-row',
		});
		arcCheckbox.addEventListener('change', async () => {
			scene.arcAnchor = arcCheckbox.checked || undefined;
			await this.plugin.sceneReader.updateScene(scene.filePath, { arcAnchor: scene.arcAnchor });
		});

		// ── 12. Data fabularna & Godzina ────────────────────────────
		const dtRow = inspector.createDiv('firefly-inspector-section firefly-inspector-grid-2');

		const dateGroup = dtRow.createDiv('firefly-inspector-field');
		dateGroup.createSpan({ cls: 'firefly-inspector-label', text: 'Data fabularna' });
		const dateInput = dateGroup.createEl('input', {
			cls: 'firefly-inspector-input',
			attr: { type: 'text', placeholder: 'np. 2026-02-17, Dzień 3' },
		});
		dateInput.value = scene.storyDate || scene.when || '';
		dateInput.addEventListener('change', async () => {
			const val = dateInput.value.trim() || undefined;
			scene.storyDate = val;
			scene.when = val;
			await this.plugin.sceneReader.updateScene(scene.filePath, { storyDate: val, when: val });
			this.callbacks.onRefresh();
		});

		const timeGroup = dtRow.createDiv('firefly-inspector-field');
		timeGroup.createSpan({ cls: 'firefly-inspector-label', text: 'Pora / Godzina' });
		const timeInput = timeGroup.createEl('input', {
			cls: 'firefly-inspector-input',
			attr: { type: 'text', placeholder: 'np. Poranek, 14:00' },
		});
		timeInput.value = scene.storyTime || '';
		timeInput.addEventListener('change', async () => {
			const val = timeInput.value.trim() || undefined;
			scene.storyTime = val;
			await this.plugin.sceneReader.updateScene(scene.filePath, { storyTime: val });
		});

		// ── 13. Liczba słów + Cel ───────────────────────────────────
		const wcRow = inspector.createDiv('firefly-inspector-section firefly-inspector-grid-2');

		const wcGroup = wcRow.createDiv('firefly-inspector-field');
		wcGroup.createSpan({ cls: 'firefly-inspector-label', text: 'Słowa' });
		const wcDisplay = wcGroup.createDiv('firefly-inspector-badge-display');
		wcDisplay.textContent = `${scene.wordcount || 0} słów`;

		const targetGroup = wcRow.createDiv('firefly-inspector-field');
		targetGroup.createSpan({ cls: 'firefly-inspector-label', text: 'Cel (słów)' });
		const targetInput = targetGroup.createEl('input', {
			cls: 'firefly-inspector-input',
			attr: { type: 'number', placeholder: 'np. 1500' },
		});
		targetInput.value = scene.target_wordcount ? String(scene.target_wordcount) : '';
		targetInput.addEventListener('change', async () => {
			const val = targetInput.value.trim() ? Number(targetInput.value) : undefined;
			scene.target_wordcount = val;
			await this.plugin.sceneReader.updateScene(scene.filePath, { target_wordcount: val });
		});

		// ── 14. Wątki / Tagi ────────────────────────────────────────
		const tagSection = inspector.createDiv('firefly-inspector-section');
		tagSection.createSpan({ cls: 'firefly-inspector-label', text: 'Wątki / Tagi (Plotlines):' });
		const tagPillContainer = tagSection.createDiv('firefly-inspector-field-wrap');
		renderTagPillInput({
			container: tagPillContainer,
			values: scene.tags || [],
			getSuggestions: () => this.plugin.sceneReader.getAllTags(this.plugin),
			onChange: async (values) => {
				scene.tags = values;
				await this.plugin.sceneReader.updateScene(scene.filePath, { tags: values });
				this.callbacks.onRefresh();
			},
			placeholder: 'Dodaj wątek / tag…',
		});

		// ── 15. Synopsis / Streszczenie ─────────────────────────────
		const synSection = inspector.createDiv('firefly-inspector-section');
		synSection.createSpan({ cls: 'firefly-inspector-label', text: 'Streszczenie (Synopsis):' });
		const synInput = synSection.createEl('textarea', {
			cls: 'firefly-inspector-textarea',
			attr: { placeholder: 'Krótkie podsumowanie sceny (1-2 zdania)…', rows: '4' },
		});
		synInput.value = scene.synopsis || '';
		synInput.addEventListener('change', async () => {
			const val = synInput.value.trim() || undefined;
			scene.synopsis = val;
			await this.plugin.sceneReader.updateScene(scene.filePath, { synopsis: val });
			this.callbacks.onRefresh();
		});

		// ── 16. Treść sceny (Scene draft / markdown body) ───────────
		const bodySection = inspector.createDiv('firefly-inspector-section');
		bodySection.createSpan({ cls: 'firefly-inspector-label', text: 'Szkic / Treść sceny:' });
		const bodyInput = bodySection.createEl('textarea', {
			cls: 'firefly-inspector-textarea firefly-inspector-body-textarea',
			attr: { placeholder: 'Napisz szkic lub treść sceny…', rows: '8' },
		});
		void this.plugin.sceneReader.readSceneBody(scene.filePath).then((bodyText) => {
			bodyInput.value = bodyText || scene.body || '';
		});
		bodyInput.addEventListener('change', async () => {
			const val = bodyInput.value;
			scene.body = val;
			await this.plugin.sceneReader.writeSceneBody(scene.filePath, val);
		});

		// ── 17. Konflikt (Conflict) ─────────────────────────────────
		const conflictSection = inspector.createDiv('firefly-inspector-section');
		conflictSection.createSpan({ cls: 'firefly-inspector-label', text: 'Główny konflikt:' });
		const conflictInput = conflictSection.createEl('textarea', {
			cls: 'firefly-inspector-textarea',
			attr: { placeholder: 'Jaki konflikt zachodzi w tej scenie?', rows: '3' },
		});
		conflictInput.value = scene.conflict || '';
		conflictInput.addEventListener('change', async () => {
			const val = conflictInput.value.trim() || undefined;
			scene.conflict = val;
			await this.plugin.sceneReader.updateScene(scene.filePath, { conflict: val });
		});

		// ── 18. Emocje & Intensywność ───────────────────────────────
		const emotionSection = inspector.createDiv('firefly-inspector-section');
		emotionSection.createSpan({ cls: 'firefly-inspector-label', text: 'Emocja czytelnika: ' });
		const emotionInput = emotionSection.createEl('input', {
			cls: 'firefly-inspector-input',
			attr: { type: 'text', placeholder: 'np. Napięcie, nadzieja, groza' },
		});
		emotionInput.value = scene.emotion || '';
		emotionInput.addEventListener('change', async () => {
			const val = emotionInput.value.trim() || undefined;
			scene.emotion = val;
			await this.plugin.sceneReader.updateScene(scene.filePath, { emotion: val });
		});

		// Suwak intensywności
		const intensityRow = emotionSection.createDiv('firefly-inspector-intensity-row');
		intensityRow.createSpan({ cls: 'firefly-inspector-label', text: 'Intensywność:' });

		const intensitySlider = intensityRow.createEl('input', {
			cls: 'firefly-inspector-intensity-slider',
			attr: {
				type: 'range',
				min: '-10',
				max: '10',
				step: '1',
				value: String(scene.intensity ?? 0),
			},
		});

		const intensityValLabel = intensityRow.createSpan({
			cls: 'firefly-inspector-intensity-val',
			text: this.formatIntensity(scene.intensity ?? 0),
		});

		const updateIntensityColor = (val: number) => {
			intensityValLabel.textContent = this.formatIntensity(val);
			intensityValLabel.className =
				'firefly-inspector-intensity-val ' +
				(val > 0 ? 'is-positive' : val < 0 ? 'is-negative' : 'is-neutral');
		};
		updateIntensityColor(scene.intensity ?? 0);

		intensitySlider.addEventListener('input', () => {
			const val = Number(intensitySlider.value);
			updateIntensityColor(val);
		});
		intensitySlider.addEventListener('change', async () => {
			const val = Number(intensitySlider.value);
			scene.intensity = val;
			await this.plugin.sceneReader.updateScene(scene.filePath, { intensity: val });
		});

		// ── 19. Setup / Payoff tracking ─────────────────────────────
		this.renderSetupPayoff(inspector, scene);

		// ── 20. Notatki / Komentarze (Live Markdown Preview) ────────
		this.renderNotesSection(inspector, scene);

		// ── 21. Action buttons ──────────────────────────────────────
		const actions = inspector.createDiv('firefly-inspector-actions');

		const editBtn = actions.createEl('button', {
			cls: 'firefly-btn-primary mod-cta',
			text: 'Otwórz scenę',
		});
		setIcon(editBtn.createSpan({ cls: 'firefly-btn-icon' }), 'external-link');
		editBtn.addEventListener('click', () => this.callbacks.onEdit(scene));

		const deleteBtn = actions.createEl('button', {
			cls: 'firefly-btn-warning mod-warning',
			text: 'Usuń scenę',
		});
		setIcon(deleteBtn.createSpan({ cls: 'firefly-btn-icon' }), 'trash-2');
		deleteBtn.addEventListener('click', () => {
			new ConfirmModal(this.plugin.app, {
				title: 'Usuń scenę',
				message: `Czy na pewno chcesz usunąć scenę "${scene.title || 'Bez tytułu'}"? Plik zostanie przeniesiony do kosza.`,
				confirmLabel: 'Usuń',
				onConfirm: () => {
					this.callbacks.onDelete(scene);
					this.hide();
				},
			}).open();
		});
	}

	/**
	 * Setup / Payoff dwukierunkowe powiązania scen
	 */
	private renderSetupPayoff(parent: HTMLElement, scene: Scene): void {
		const section = parent.createDiv('firefly-inspector-section firefly-inspector-setup-payoff');
		section.createSpan({ cls: 'firefly-inspector-label', text: 'Powiązania wątkowe (Setup / Payoff):' });

		const allScenes = this.plugin.sceneReader.getAllScenes(this.plugin);
		const otherSceneTitles = allScenes
			.filter((s) => s.filePath !== scene.filePath)
			.map((s) => s.title)
			.filter(Boolean);

		// "Sets up" (Buduje / Przygotowuje sceny)
		const payoffRow = section.createDiv('firefly-inspector-sp-row');
		const payoffIcon = payoffRow.createSpan();
		setIcon(payoffIcon, 'arrow-right');
		payoffRow.createSpan({ text: ' Buduje sceny (Payoff):', cls: 'firefly-inspector-sp-label' });

		const payoffContainer = section.createDiv('firefly-inspector-field-wrap');
		renderTagPillInput({
			container: payoffContainer,
			values: scene.payoff_scenes || [],
			getSuggestions: () => otherSceneTitles,
			onChange: async (values) => {
				const oldValues = scene.payoff_scenes || [];
				scene.payoff_scenes = values;
				await this.plugin.sceneReader.updateScene(scene.filePath, { payoff_scenes: values });

				// Dodaj link zwrotny w scenach docelowych
				for (const targetTitle of values) {
					if (!oldValues.includes(targetTitle)) {
						const target = allScenes.find((s) => s.title === targetTitle);
						if (target) {
							const rev = target.setup_scenes ? [...target.setup_scenes] : [];
							if (!rev.includes(scene.title)) {
								rev.push(scene.title);
								target.setup_scenes = rev;
								await this.plugin.sceneReader.updateScene(target.filePath, { setup_scenes: rev });
							}
						}
					}
				}
				// Usuń link zwrotny
				for (const targetTitle of oldValues) {
					if (!values.includes(targetTitle)) {
						const target = allScenes.find((s) => s.title === targetTitle);
						if (target && target.setup_scenes?.includes(scene.title)) {
							const rev = target.setup_scenes.filter((t) => t !== scene.title);
							target.setup_scenes = rev;
							await this.plugin.sceneReader.updateScene(target.filePath, { setup_scenes: rev });
						}
					}
				}
			},
			placeholder: 'Wyszukaj scenę payoff…',
		});

		// "Set up by" (Przygotowana przez sceny)
		const setupRow = section.createDiv('firefly-inspector-sp-row');
		const setupIcon = setupRow.createSpan();
		setIcon(setupIcon, 'arrow-left');
		setupRow.createSpan({ text: ' Przygotowana przez (Setup):', cls: 'firefly-inspector-sp-label' });

		const setupContainer = section.createDiv('firefly-inspector-field-wrap');
		renderTagPillInput({
			container: setupContainer,
			values: scene.setup_scenes || [],
			getSuggestions: () => otherSceneTitles,
			onChange: async (values) => {
				const oldValues = scene.setup_scenes || [];
				scene.setup_scenes = values;
				await this.plugin.sceneReader.updateScene(scene.filePath, { setup_scenes: values });

				// Dodaj link zwrotny
				for (const sourceTitle of values) {
					if (!oldValues.includes(sourceTitle)) {
						const source = allScenes.find((s) => s.title === sourceTitle);
						if (source) {
							const rev = source.payoff_scenes ? [...source.payoff_scenes] : [];
							if (!rev.includes(scene.title)) {
								rev.push(scene.title);
								source.payoff_scenes = rev;
								await this.plugin.sceneReader.updateScene(source.filePath, { payoff_scenes: rev });
							}
						}
					}
				}
				// Usuń link zwrotny
				for (const sourceTitle of oldValues) {
					if (!values.includes(sourceTitle)) {
						const source = allScenes.find((s) => s.title === sourceTitle);
						if (source && source.payoff_scenes?.includes(scene.title)) {
							const rev = source.payoff_scenes.filter((t) => t !== scene.title);
							source.payoff_scenes = rev;
							await this.plugin.sceneReader.updateScene(source.filePath, { payoff_scenes: rev });
						}
					}
				}
			},
			placeholder: 'Wyszukaj scenę setup…',
		});
	}

	/**
	 * Notatki / Komentarze redaktorskie z Live Markdown Preview
	 */
	private renderNotesSection(parent: HTMLElement, scene: Scene): void {
		const section = parent.createDiv('firefly-inspector-section firefly-inspector-notes');
		const header = section.createDiv('firefly-inspector-notes-header');
		const icon = header.createSpan();
		setIcon(icon, 'message-square');
		header.createSpan({ cls: 'firefly-inspector-label', text: ' Notatki i komentarze:' });

		const container = section.createDiv('firefly-inspector-notes-container');
		this.renderNotesLive(container, scene);
	}

	private renderNotesLive(container: HTMLElement, scene: Scene): void {
		container.empty();
		const notesText = (scene.notes || '').trim();

		if (!notesText) {
			const placeholder = container.createDiv('firefly-inspector-notes-empty');
			placeholder.createSpan({ text: 'Kliknij, aby dodać notatki markdown…' });
			placeholder.addEventListener('click', () => {
				this.renderNotesEditor(container, scene, '');
			});
			return;
		}

		// Preview
		const previewEl = container.createDiv('firefly-inspector-notes-preview');
		void MarkdownRenderer.render(
			this.plugin.app,
			notesText,
			previewEl,
			scene.filePath,
			this.plugin
		);

		previewEl.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (target.tagName === 'A' || target.tagName === 'INPUT') return;
			this.renderNotesEditor(container, scene, scene.notes || '');
		});

		// Checkboxy interaktywne
		previewEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
			const checkbox = cb as HTMLInputElement;
			checkbox.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				const checked = checkbox.checked;
				const notes = scene.notes || '';
				const lines = notes.split('\n');
				let lineIdx = 0;
				let foundIdx = -1;
				for (const line of lines) {
					if (/^(\s*-\s*)\[([ xX])\]/.test(line)) {
						if (previewEl.querySelectorAll('input[type="checkbox"]')[lineIdx] === checkbox) {
							foundIdx = lines.indexOf(line);
							break;
						}
						lineIdx++;
					}
				}
				if (foundIdx >= 0) {
					lines[foundIdx] = lines[foundIdx]!.replace(/- \[[ xX]\]/, checked ? '- [x]' : '- [ ]');
					const newNotes = lines.join('\n');
					scene.notes = newNotes;
					await this.plugin.sceneReader.updateScene(scene.filePath, { notes: newNotes });
					this.renderNotesLive(container, scene);
				}
			});
		});
	}

	private renderNotesEditor(container: HTMLElement, scene: Scene, currentText: string): void {
		container.empty();
		const wrap = container.createDiv('firefly-inspector-notes-editor-wrap');
		const textarea = wrap.createEl('textarea', {
			cls: 'firefly-inspector-textarea firefly-inspector-notes-textarea',
			attr: { placeholder: 'Wpisz notatki w markdownie (np. - [ ] zadanie, **ważne**)…', rows: '6' },
		});
		textarea.value = currentText;

		window.requestAnimationFrame(() => textarea.focus());

		textarea.addEventListener('blur', async () => {
			const val = textarea.value.trim();
			scene.notes = val || undefined;
			await this.plugin.sceneReader.updateScene(scene.filePath, { notes: scene.notes });
			this.renderNotesLive(container, scene);
		});

		textarea.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				textarea.blur();
			}
		});
	}
}
