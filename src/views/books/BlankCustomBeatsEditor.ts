import { setIcon } from 'obsidian';
import type { BeatDefinition } from '../../models/StoryBeats';

export class BlankCustomBeatsEditor {
	private beats: BeatDefinition[];
	private modelName: string;
	private onChange: (beats: BeatDefinition[], modelName: string) => void;
	private onSaveGlobal?: (modelName: string, beats: BeatDefinition[]) => Promise<void>;
	private containerEl: HTMLElement | null = null;
	private draggedIndex: number | null = null;

	constructor(
		beats: BeatDefinition[],
		modelName: string = 'Blank Custom',
		onChange: (beats: BeatDefinition[], modelName: string) => void,
		onSaveGlobal?: (modelName: string, beats: BeatDefinition[]) => Promise<void>,
	) {
		this.beats = beats.length > 0 ? beats : [
			{ name: 'Otwarcie', act: 1, purpose: 'Wprowadzenie bohatera i status quo.' },
			{ name: 'Incydent inicjujący', act: 1, purpose: 'Zdarzenie burzące początkowy porządek.' },
			{ name: 'Punkt zwrotny 1', act: 1, purpose: 'Wejście w nowy świat bez możliwości powrotu.' },
			{ name: 'Punkt centralny (Midpoint)', act: 2, purpose: 'Pozorne zwycięstwo lub porażka; zmiana perspektywy.' },
			{ name: 'Kryzys (Wszystko stracone)', act: 2, purpose: 'Najniższy punkt bohatera przed ostateczną decyzją.' },
			{ name: 'Kulminacja', act: 3, purpose: 'Ostateczne starcie i rozwiązanie konfliktu.' },
		];
		this.modelName = modelName;
		this.onChange = onChange;
		this.onSaveGlobal = onSaveGlobal;
	}

	getBeats(): BeatDefinition[] {
		return this.beats;
	}

	getModelName(): string {
		return this.modelName;
	}

	render(container: HTMLElement): void {
		this.containerEl = container;
		container.empty();
		container.addClass('firefly-custom-beats-editor');

		// 1. Nazwa modelu Beatów
		const nameSection = container.createDiv('firefly-custom-model-name-row');
		const nameLabel = nameSection.createEl('label', { cls: 'firefly-model-name-label' });
		setIcon(nameLabel.createSpan('firefly-icon-span'), 'tag');
		nameLabel.createSpan({ text: 'Nazwa Beat Modelu:' });

		const nameInput = nameSection.createEl('input', {
			type: 'text',
			cls: 'firefly-model-name-input',
			value: this.modelName,
			placeholder: 'Wpisz nazwę Beat Modelu (np. Moja 4-aktowa struktura)...',
		});
		nameInput.oninput = () => {
			this.modelName = nameInput.value.trim() || 'Blank Custom';
			this.onChange(this.beats, this.modelName);
		};

		// 2. Header listy z przyciskami
		const header = container.createDiv('firefly-custom-beats-header');
		const headerLeft = header.createDiv('firefly-custom-beats-title-wrap');
		setIcon(headerLeft.createSpan('firefly-custom-beats-icon'), 'list-ordered');
		headerLeft.createEl('strong', { text: `Zdefiniowane Beaty (${this.beats.length})` });

		const headerActions = header.createDiv('firefly-custom-beats-header-actions');

		if (this.onSaveGlobal) {
			const saveGlobalBtn = headerActions.createEl('button', {
				cls: 'firefly-btn-save-global',
				text: 'Zapisz Beat Model w wtyczce',
				attr: { title: 'Zapisuje ten model do ustawień wtyczki — będzie dostępny we wszystkich książkach' },
			});
			setIcon(saveGlobalBtn.createSpan('firefly-icon-span-btn'), 'bookmark');
			saveGlobalBtn.onclick = async () => {
				saveGlobalBtn.disabled = true;
				try {
					await this.onSaveGlobal!(this.modelName, this.beats);
				} finally {
					saveGlobalBtn.disabled = false;
				}
			};
		}

		const addBtn = headerActions.createEl('button', {
			cls: 'mod-cta firefly-btn-add-beat',
			text: '+ Dodaj beat',
		});
		addBtn.onclick = () => {
			const lastAct = this.beats.length > 0 ? this.beats[this.beats.length - 1]!.act : 1;
			this.beats.push({
				name: `Nowy Beat ${this.beats.length + 1}`,
				act: lastAct,
				purpose: '',
			});
			this.onChange(this.beats, this.modelName);
			this.render(container);
		};

		if (this.beats.length === 0) {
			const empty = container.createDiv('firefly-empty-state');
			empty.createEl('p', { text: 'Brak zdefiniowanych beatów. Kliknij „+ Dodaj beat”, aby stworzyć swój pierwszy rytm.' });
			return;
		}

		// 3. Lista beatów z Drag & Drop
		const list = container.createDiv('firefly-custom-beats-list');

		this.beats.forEach((beat, index) => {
			const itemEl = list.createDiv('firefly-custom-beat-item');
			itemEl.setAttribute('draggable', 'true');

			itemEl.ondragstart = (e) => {
				this.draggedIndex = index;
				itemEl.addClass('is-dragging');
				if (e.dataTransfer) {
					e.dataTransfer.effectAllowed = 'move';
					e.dataTransfer.setData('text/plain', String(index));
				}
			};

			itemEl.ondragend = () => {
				this.draggedIndex = null;
				itemEl.removeClass('is-dragging');
				list.querySelectorAll('.firefly-custom-beat-item').forEach(el => el.removeClass('drag-over'));
			};

			itemEl.ondragover = (e) => {
				e.preventDefault();
				if (this.draggedIndex !== null && this.draggedIndex !== index) {
					itemEl.addClass('drag-over');
				}
			};

			itemEl.ondragleave = () => {
				itemEl.removeClass('drag-over');
			};

			itemEl.ondrop = (e) => {
				e.preventDefault();
				itemEl.removeClass('drag-over');
				if (this.draggedIndex !== null && this.draggedIndex !== index) {
					const movedItem = this.beats.splice(this.draggedIndex, 1)[0]!;
					this.beats.splice(index, 0, movedItem);
					this.draggedIndex = null;
					this.onChange(this.beats, this.modelName);
					this.render(container);
				}
			};

			const leftControls = itemEl.createDiv('firefly-beat-left-controls');
			const dragHandle = leftControls.createSpan('firefly-drag-handle');
			setIcon(dragHandle, 'grip-vertical');
			dragHandle.setAttribute('title', 'Przeciągnij, aby zmienić kolejność');

			leftControls.createSpan({ cls: 'firefly-beat-num-badge', text: `#${index + 1}` });

			const actSelect = leftControls.createEl('select', { cls: 'firefly-beat-act-select' });
			for (let a = 1; a <= 5; a++) {
				const opt = actSelect.createEl('option', { value: String(a), text: `Akt ${a}` });
				if (beat.act === a) opt.selected = true;
			}
			actSelect.onchange = () => {
				beat.act = parseInt(actSelect.value) || 1;
				this.onChange(this.beats, this.modelName);
			};

			const bodyEl = itemEl.createDiv('firefly-beat-item-body');
			const nameInput = bodyEl.createEl('input', {
				type: 'text',
				cls: 'firefly-beat-name-input',
				value: beat.name,
				placeholder: 'Nazwa beatu...',
			});
			nameInput.oninput = () => {
				beat.name = nameInput.value;
			};
			nameInput.onblur = () => {
				this.onChange(this.beats, this.modelName);
			};

			const purposeInput = bodyEl.createEl('input', {
				type: 'text',
				cls: 'firefly-beat-purpose-input',
				value: beat.purpose || '',
				placeholder: 'Cel / funkcja beatu w fabule (opcjonalnie)...',
			});
			purposeInput.oninput = () => {
				beat.purpose = purposeInput.value;
			};
			purposeInput.onblur = () => {
				this.onChange(this.beats, this.modelName);
			};

			const rightActions = itemEl.createDiv('firefly-beat-right-actions');
			const deleteBtn = rightActions.createEl('button', {
				cls: 'mod-warning firefly-icon-btn',
				attr: { title: 'Usuń beat' },
			});
			setIcon(deleteBtn, 'trash-2');
			deleteBtn.onclick = () => {
				this.beats.splice(index, 1);
				this.onChange(this.beats, this.modelName);
				this.render(container);
			};
		});
	}
}
