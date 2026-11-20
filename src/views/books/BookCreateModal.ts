import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import type FireflyPlugin from '../../main';
import type { BeatDefinition } from '../../models/StoryBeats';
import { ALL_LIBRARY_ITEMS, BLANK_CUSTOM_BEATS } from '../../models/StoryBeatsPresets';
import { FolderSuggest } from './FolderSuggest';
import type { FolderInspectionReport } from '../../services/BookService';
import { renderBeatsPreview } from './BeatsPreviewHelper';
import { BlankCustomBeatsEditor } from './BlankCustomBeatsEditor';

export class BookCreateModal extends Modal {
	private plugin: FireflyPlugin;
	private onCreated: () => void;

	private mode: 'create' | 'import' = 'create';

	// Create mode state
	private title: string = '';
	private parentFolder: string = '';
	private includeBeats: boolean = true;
	private beatPresetId: string = 'save_the_cat';
	private blankCustomModelName: string = 'Mój model Beatów';
	private blankCustomBeats: BeatDefinition[] = JSON.parse(JSON.stringify(BLANK_CUSTOM_BEATS));
	private includeArcs: boolean = true;
	private includeSubplots: boolean = true;
	private includeMechanics: boolean = true;
	private includeSecrets: boolean = true;
	private includeScenes: boolean = true;

	// Import mode state
	private importFolderPath: string = '';
	private importTitle: string = '';
	private inspectionReport: FolderInspectionReport | null = null;
	private createMissingFolders: boolean = true;
	private assignMissingClass: boolean = true;
	private fillMissingAttributes: boolean = true;
	private attributeMappings: Record<string, Record<string, string>> = {};
	private resultsContainerEl: HTMLElement | null = null;
	private detectedBeatModel?: string;

	constructor(app: App, plugin: FireflyPlugin, onCreated: () => void) {
		super(app);
		this.plugin = plugin;
		this.onCreated = onCreated;
	}

	onOpen(): void {
		this.render();
	}

	render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('firefly-book-create-modal');

		const headerWrap = contentEl.createDiv('firefly-modal-top-bar');
		headerWrap.createEl('h2', {
			text: this.mode === 'create' ? 'Utwórz nową książkę' : 'Zaimportuj istniejący folder',
		});

		const modeToggleGroup = headerWrap.createDiv('firefly-mode-toggle-group');
		const createModeBtn = modeToggleGroup.createEl('button', {
			text: 'Nowa od zera',
			cls: `firefly-mode-btn ${this.mode === 'create' ? 'is-active' : ''}`,
		});
		createModeBtn.onclick = () => {
			this.mode = 'create';
			this.render();
		};

		const importModeBtn = modeToggleGroup.createEl('button', {
			text: 'Zaimportuj folder',
			cls: `firefly-mode-btn ${this.mode === 'import' ? 'is-active' : ''}`,
		});
		importModeBtn.onclick = () => {
			this.mode = 'import';
			this.render();
		};

		if (this.mode === 'create') {
			this.renderCreateMode(contentEl);
		} else {
			this.renderImportMode(contentEl);
		}
	}

	// ── TRYB: TWORZENIE OD ZERA ───────────────────────────────────────────────────

	private renderCreateMode(container: HTMLElement): void {
		container.createEl('p', {
			cls: 'firefly-modal-desc',
			text: 'Podaj tytuł książki. Wtyczka utworzy dedykowaną strukturę folderów oraz wybrane szablony startowe.',
		});

		// 1. Tytuł książki
		new Setting(container)
			.setName('Tytuł książki')
			.setDesc('Główna nazwa projektu i folderu książki.')
			.addText(text => {
				text.setPlaceholder('np. Ostatnia Przełęcz')
					.setValue(this.title)
					.onChange(val => {
						this.title = val;
						if (!this.blankCustomModelName || this.blankCustomModelName === 'Mój model Beatów') {
							this.blankCustomModelName = val.trim() ? `${val.trim()} - Model` : 'Mój model Beatów';
						}
					});
				text.inputEl.focus();
			});

		// 2. Folder nadrzędny
		new Setting(container)
			.setName('Folder nadrzędny (opcjonalny)')
			.setDesc('Pozostaw puste, aby utworzyć książkę bezpośrednio w katalogu głównym Vaulta.')
			.addText(text => {
				text.setPlaceholder('Główny katalog vaulta')
					.setValue(this.parentFolder)
					.onChange(val => {
						this.parentFolder = val;
					});
				new FolderSuggest(this.app, text.inputEl, folder => {
					this.parentFolder = folder.path;
				});
			});

		// 3. Informacja o strukturze
		const structureBox = container.createDiv('firefly-structure-preview-box');
		structureBox.createEl('h4', { text: 'Automatycznie tworzone foldery:' });
		const badgesWrap = structureBox.createDiv('firefly-folder-badges');
		const defaultFolders = ['Arcs/', 'Beats/', 'Scenes/', 'Subplots/', 'Mechanics/', 'Secrets/'];
		for (const folderName of defaultFolders) {
			const badge = badgesWrap.createSpan('firefly-folder-badge');
			badge.setText(folderName);
		}

		// 4. Szablony bazowe i komponenty
		container.createEl('h3', { text: 'Szablony bazowe i komponenty', cls: 'firefly-section-subtitle' });

		// System Beatów
		const beatsSectionWrap = container.createDiv('firefly-beats-toggle-wrap');
		new Setting(beatsSectionWrap)
			.setName('System Beatów')
			.setDesc('Zainicjuj strukturę plików beatów w folderze Beats/')
			.addToggle(toggle => {
				toggle.setValue(this.includeBeats).onChange(val => {
					this.includeBeats = val;
					presetDropdownEl.style.display = val ? 'block' : 'none';
				});
			});

		const presetDropdownEl = beatsSectionWrap.createDiv('firefly-sub-setting-row');
		const previewContainer = presetDropdownEl.createDiv('firefly-beats-preview-container');

		const availablePresets = this.plugin.bookService.getAvailableBeatPresets();

		const renderSelectedBeatView = () => {
			previewContainer.empty();
			if (this.beatPresetId === 'blank') {
				const customEditor = new BlankCustomBeatsEditor(
					this.blankCustomBeats,
					this.blankCustomModelName,
					(updated, updatedName) => {
						this.blankCustomBeats = updated;
						this.blankCustomModelName = updatedName;
					},
					async (modelName, beats) => {
						await this.plugin.bookService.saveGlobalBeatModel(modelName, beats);
						new Notice(`Zapisano model beatów „${modelName}” w ustawieniach wtyczki! Jest teraz dostępny dla wszystkich książek.`);
						this.render();
					},
				);
				customEditor.render(previewContainer);
			} else {
				renderBeatsPreview(
					previewContainer,
					this.beatPresetId,
					this.plugin.settings.customBeatModels || [],
				);
			}
		};

		new Setting(presetDropdownEl)
			.setName('Schemat struktury Beatów')
			.setDesc('Wybierz gotowy profil, własny model lub stwórz nowy (Blank custom).')
			.addDropdown(drop => {
				for (const item of availablePresets) {
					drop.addOption(item.id, item.name);
				}
				drop.setValue(this.beatPresetId);
				drop.onChange(val => {
					this.beatPresetId = val;
					renderSelectedBeatView();
				});
			});

		renderSelectedBeatView();

		if (!this.includeBeats) {
			presetDropdownEl.style.display = 'none';
		}

		// Arcs
		new Setting(container)
			.setName('Przykładowy wątek postaci (Class: Arc)')
			.setDesc('Tworzy plik startowy w Arcs/ z konfiguracją protagonisty')
			.addToggle(toggle => toggle.setValue(this.includeArcs).onChange(v => (this.includeArcs = v)));

		// Subplots
		new Setting(container)
			.setName('Przykładowy wątek poboczny (Class: Subplot)')
			.setDesc('Tworzy plik startowy w Subplots/ z konfiguracją wątku')
			.addToggle(toggle => toggle.setValue(this.includeSubplots).onChange(v => (this.includeSubplots = v)));

		// Mechanics
		new Setting(container)
			.setName('Przykładowa mechanika (Class: Mechanic)')
			.setDesc('Tworzy plik kolumny technicznej w Mechanics/')
			.addToggle(toggle => toggle.setValue(this.includeMechanics).onChange(v => (this.includeMechanics = v)));

		// Secrets
		new Setting(container)
			.setName('Przykładowy sekret fabularny (Class: Secret)')
			.setDesc('Tworzy plik tajemnicy w Secrets/')
			.addToggle(toggle => toggle.setValue(this.includeSecrets).onChange(v => (this.includeSecrets = v)));

		// Scenes
		new Setting(container)
			.setName('Przykładowa scena startowa (Class: Scene)')
			.setDesc('Tworzy plik startowej sceny w Scenes/')
			.addToggle(toggle => toggle.setValue(this.includeScenes).onChange(v => (this.includeScenes = v)));

		// Przyciski akcji
		const actionsContainer = container.createDiv('firefly-modal-actions');
		const cancelBtn = actionsContainer.createEl('button', { text: 'Anuluj' });
		cancelBtn.onclick = () => this.close();

		const createBtn = actionsContainer.createEl('button', {
			cls: 'mod-cta',
			text: 'Utwórz książkę',
		});

		createBtn.onclick = async () => {
			if (!this.title.trim()) {
				new Notice('Podaj tytuł książki!');
				return;
			}

			createBtn.disabled = true;
			createBtn.setText('Tworzenie...');

			try {
				const selectedPreset = availablePresets.find(i => i.id === this.beatPresetId);
				const finalModelName = this.beatPresetId === 'blank'
					? this.blankCustomModelName
					: (selectedPreset?.name || this.beatPresetId);

				await this.plugin.bookService.createBook({
					title: this.title,
					parentFolder: this.parentFolder,
					includeBeats: this.includeBeats,
					beatPresetId: this.beatPresetId,
					beatModelName: finalModelName,
					customBeats: this.beatPresetId === 'blank' ? this.blankCustomBeats : undefined,
					includeArcs: this.includeArcs,
					includeSubplots: this.includeSubplots,
					includeMechanics: this.includeMechanics,
					includeSecrets: this.includeSecrets,
					includeScenes: this.includeScenes,
				});

				new Notice(`Książka "${this.title}" została pomyślnie utworzona!`);
				this.onCreated();
				this.close();
			} catch (err: any) {
				new Notice(`Błąd podczas tworzenia książki: ${err.message || err}`);
				createBtn.disabled = false;
				createBtn.setText('Utwórz książkę');
			}
		};
	}

	// ── TRYB: IMPORT ISTNIEJĄCEGO FOLDERU ─────────────────────────────────────────

	private renderImportMode(container: HTMLElement): void {
		container.createEl('p', {
			cls: 'firefly-modal-desc',
			text: 'Wskaż istniejący folder ze swoimi materiałami. Firefly przeanalizuje jego zawartość, wskaże brakujące elementy i pozwoli przypisać Twoje własne atrybuty zamiast domyślnych.',
		});

		new Setting(container)
			.setName('Folder książki w Vaulcie')
			.setDesc('Wybierz folder zawierający Twoje pliki lub podfoldery.')
			.addText(text => {
				text.setPlaceholder('np. Moja Książka')
					.setValue(this.importFolderPath)
					.onChange(val => {
						this.importFolderPath = val;
					});

				text.inputEl.onkeydown = (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						this.triggerInspection();
					}
				};

				new FolderSuggest(this.app, text.inputEl, folder => {
					this.importFolderPath = folder.path;
					this.triggerInspection();
				});
			})
			.addButton(btn => {
				btn.setButtonText('Analizuj folder')
					.setCta()
					.onClick(() => this.triggerInspection());
			});

		this.resultsContainerEl = container.createDiv('firefly-inspection-results-wrap');

		if (this.inspectionReport && this.inspectionReport.exists) {
			this.renderInspectionResults(this.resultsContainerEl);
		} else if (this.importFolderPath.trim()) {
			this.renderNotFoundWarning(this.resultsContainerEl);
		}
	}

	private triggerInspection(): void {
		if (!this.importFolderPath.trim()) {
			new Notice('Wybierz ścieżkę do folderu!');
			return;
		}

		this.inspectionReport = this.plugin.bookService.inspectFolder(this.importFolderPath);
		if (!this.importTitle) {
			const clean = this.importFolderPath.replace(/\\/g, '/').trim();
			this.importTitle = clean.split('/').pop() || 'Zaimportowana książka';
		}

		if (this.inspectionReport.detectedBeatModel) {
			this.detectedBeatModel = this.inspectionReport.detectedBeatModel;
			this.blankCustomModelName = this.inspectionReport.detectedBeatModel;
		}
		if (this.inspectionReport.detectedBeatDefinitions) {
			this.blankCustomBeats = this.inspectionReport.detectedBeatDefinitions;
		}

		if (this.resultsContainerEl) {
			this.resultsContainerEl.empty();
			if (this.inspectionReport.exists) {
				this.renderInspectionResults(this.resultsContainerEl);
			} else {
				this.renderNotFoundWarning(this.resultsContainerEl);
			}
		}
	}

	private renderNotFoundWarning(container: HTMLElement): void {
		container.empty();
		const warningBox = container.createDiv('firefly-import-warning-box');
		setIcon(warningBox.createSpan('firefly-warn-icon'), 'alert-triangle');
		warningBox.createSpan({ text: `Folder "${this.importFolderPath}" nie został odnaleziony w Vaulcie.` });
	}

	private renderInspectionResults(container: HTMLElement): void {
		container.empty();
		const report = this.inspectionReport!;

		// Tytuł książki
		new Setting(container)
			.setName('Tytuł książki w Firefly')
			.setDesc('Nazwa wyświetlana w wtyczce.')
			.addText(text => {
				text.setValue(this.importTitle).onChange(v => (this.importTitle = v));
			});

		// Wykryty Beat Model
		if (report.detectedBeatModel) {
			const beatModelNotice = container.createDiv('firefly-detected-beat-model-box');
			setIcon(beatModelNotice.createSpan('firefly-detected-icon'), 'bookmark');
			const textWrap = beatModelNotice.createDiv();
			textWrap.createEl('strong', { text: `Wykryto atrybut Beat Model: „${report.detectedBeatModel}”` });
			textWrap.createEl('p', {
				text: `Wykryto ${report.detectedBeatDefinitions?.length || 0} zdefiniowanych beatów w plikach. Zostaną one automatycznie przypisane do ustawień tej książki.`,
			});
		}

		// 1. Raport struktury folderów
		const folderSection = container.createDiv('firefly-import-section');
		folderSection.createEl('h4', { text: '1. Struktura folderów i stan' });

		const folderGrid = folderSection.createDiv('firefly-folder-inspection-grid');
		for (const fs of report.folderStatuses) {
			const item = folderGrid.createDiv(`firefly-folder-status-item ${fs.exists ? 'is-found' : 'is-missing'}`);
			const iconSpan = item.createSpan('firefly-status-icon');
			setIcon(iconSpan, fs.exists ? 'check' : 'alert-circle');

			const labelWrap = item.createDiv('firefly-status-label-wrap');
			labelWrap.createEl('strong', { text: `${fs.folderName}/` });
			labelWrap.createSpan({
				cls: 'firefly-status-detail',
				text: fs.exists ? `${fs.fileCount} plików` : 'brak folderu',
			});
		}

		new Setting(folderSection)
			.setName('Utwórz brakujące foldery podczas importu')
			.setDesc('Zapewnia strukturę Arcs, Beats, Scenes, Subplots, Mechanics, Secrets.')
			.addToggle(toggle => toggle.setValue(this.createMissingFolders).onChange(v => (this.createMissingFolders = v)));

		new Setting(folderSection)
			.setName('Uzupełnij brakujące Class w plikach podfolderów')
			.setDesc('Jeśli plik w folderze np. Arcs/ nie ma nagłówka Class: Arc, wtyczka doda go automatycznie.')
			.addToggle(toggle => toggle.setValue(this.assignMissingClass).onChange(v => (this.assignMissingClass = v)));

		// 2. Analiza klas i mapowanie atrybutów
		const attrSection = container.createDiv('firefly-import-section');
		attrSection.createEl('h4', { text: '2. Dostosowanie i mapowanie atrybutów' });
		attrSection.createEl('p', {
			cls: 'firefly-section-desc',
			text: 'Dla każdej klasy możesz przypisać swój własny atrybut z plików zamiast domyślnego. Wtyczka przepisze wartości bez ich utraty.',
		});

		for (const [clsName, analysis] of Object.entries(report.classesAnalysis)) {
			if (analysis.detectedFiles === 0 && !analysis.folderExists) continue;

			const classBox = attrSection.createDiv('firefly-class-mapping-box');
			const boxHeader = classBox.createDiv('firefly-class-mapping-header');
			boxHeader.createEl('strong', { text: `Class: ${clsName}` });
			boxHeader.createSpan({
				cls: 'firefly-badge-count',
				text: `${analysis.detectedFiles} plików`,
			});

			if (!this.attributeMappings[clsName]) {
				this.attributeMappings[clsName] = {};
			}

			const userAttrs = analysis.existingAttributes;
			const mappingTable = classBox.createDiv('firefly-mapping-table');

			for (const expectedAttr of analysis.expectedAttributes) {
				const row = mappingTable.createDiv('firefly-mapping-row');

				const leftSide = row.createDiv('firefly-mapping-left');
				leftSide.createEl('span', { cls: 'firefly-expected-attr-name', text: expectedAttr });

				const hasAttrDirectly = userAttrs.some(ua => ua.toLowerCase() === expectedAttr.toLowerCase());
				if (!hasAttrDirectly) {
					leftSide.createSpan({ cls: 'firefly-missing-attr-badge', text: 'brakuje' });
				} else {
					leftSide.createSpan({ cls: 'firefly-found-attr-badge', text: 'znaleziono' });
				}

				row.createSpan({ cls: 'firefly-mapping-arrow', text: '←' });

				const rightSide = row.createDiv('firefly-mapping-right');
				const select = rightSide.createEl('select', { cls: 'dropdown' });

				const defaultOpt = select.createEl('option', {
					value: expectedAttr,
					text: `Użyj domyślnego: ${expectedAttr}`,
				});
				if (!this.attributeMappings[clsName]![expectedAttr]) {
					defaultOpt.selected = true;
				}

				for (const ua of userAttrs) {
					if (ua.toLowerCase() === expectedAttr.toLowerCase()) continue;
					const opt = select.createEl('option', {
						value: ua,
						text: `Przypisz z moich plików: ${ua}`,
					});
					if (this.attributeMappings[clsName]![expectedAttr] === ua) {
						opt.selected = true;
					}
				}

				select.onchange = () => {
					this.attributeMappings[clsName]![expectedAttr] = select.value;
				};
			}
		}

		new Setting(attrSection)
			.setName('Zainicjuj brakujące atrybuty wartościami domyślnymi')
			.setDesc('Dodaje puste/początkowe wartości dla kluczy, których całkowicie brakuje w plikach.')
			.addToggle(toggle => toggle.setValue(this.fillMissingAttributes).onChange(v => (this.fillMissingAttributes = v)));

		// Przyciski akcji
		const actionsContainer = container.createDiv('firefly-modal-actions');
		const cancelBtn = actionsContainer.createEl('button', { text: 'Anuluj' });
		cancelBtn.onclick = () => this.close();

		const importBtn = actionsContainer.createEl('button', {
			cls: 'mod-cta',
			text: 'Zaimportuj i dostosuj książkę',
		});

		importBtn.onclick = async () => {
			importBtn.disabled = true;
			importBtn.setText('Importowanie i dostosowywanie...');

			try {
				await this.plugin.bookService.importBook({
					title: this.importTitle,
					folderPath: this.importFolderPath,
					createMissingFolders: this.createMissingFolders,
					assignMissingClass: this.assignMissingClass,
					attributeMappings: this.attributeMappings,
					fillMissingAttributes: this.fillMissingAttributes,
					detectedBeatModel: this.detectedBeatModel,
					customBeats: this.blankCustomBeats,
				});

				new Notice(`Książka "${this.importTitle}" została pomyślnie zaimportowana i dostosowana!`);
				this.onCreated();
				this.close();
			} catch (err: any) {
				new Notice(`Błąd podczas importu: ${err.message || err}`);
				importBtn.disabled = false;
				importBtn.setText('Zaimportuj i dostosuj książkę');
			}
		};
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
