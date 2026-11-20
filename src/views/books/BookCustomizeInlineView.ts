import { App, Notice, setIcon, Setting, TFile } from 'obsidian';
import type FireflyPlugin from '../../main';
import type { FireflyProject } from '../../models/Project';
import type { BeatDefinition } from '../../models/StoryBeats';
import { ALL_LIBRARY_ITEMS, BLANK_CUSTOM_BEATS } from '../../models/StoryBeatsPresets';
import { renderBeatsPreview } from './BeatsPreviewHelper';
import { BlankCustomBeatsEditor } from './BlankCustomBeatsEditor';
import { BeatSystemConfirmModal } from './BeatSystemConfirmModal';

export class BookCustomizeInlineView {
	private app: App;
	private plugin: FireflyPlugin;
	private project: FireflyProject;
	private onUpdated: () => void;

	private activeClass: string = 'Arc';
	private selectedBeatPresetId: string = 'save_the_cat';
	private beatModelName: string = 'Blank Custom';
	private containerEl: HTMLElement | null = null;
	private expandedFiles: Set<string> = new Set();
	private customBeats: BeatDefinition[] = [];

	constructor(app: App, plugin: FireflyPlugin, project: FireflyProject, onUpdated: () => void) {
		this.app = app;
		this.plugin = plugin;
		this.project = project;
		this.onUpdated = onUpdated;
		if (project.structureProfileId) {
			this.selectedBeatPresetId = project.structureProfileId;
		}
		if (project.beatModelName) {
			this.beatModelName = project.beatModelName;
		}
		this.customBeats = project.customBeats && project.customBeats.length > 0
			? JSON.parse(JSON.stringify(project.customBeats))
			: JSON.parse(JSON.stringify(BLANK_CUSTOM_BEATS));

		this.loadExistingBeatsFromDisk();
	}

	setProject(project: FireflyProject): void {
		this.project = project;
		if (project.structureProfileId) {
			this.selectedBeatPresetId = project.structureProfileId;
		}
		if (project.beatModelName) {
			this.beatModelName = project.beatModelName;
		}
		if (project.customBeats && project.customBeats.length > 0) {
			this.customBeats = JSON.parse(JSON.stringify(project.customBeats));
		}
		this.loadExistingBeatsFromDisk();
	}

	/**
	 * Jeśli w folderze Beats/ są już pliki beatów, automatycznie wczytuje ich zawartość
	 * oraz wykrywa nazwę 'Beat Model', przypisując je do edytora.
	 */
	private loadExistingBeatsFromDisk(): void {
		if (!this.project.rootFolder) return;
		const diskData = this.plugin.bookService.readBeatsFromFolder(this.project.rootFolder);

		if (diskData.beats.length > 0) {
			this.customBeats = diskData.beats;
			if (diskData.beatModelName) {
				this.beatModelName = diskData.beatModelName;
				this.project.beatModelName = diskData.beatModelName;

				// Jeśli model zawiera 'blank' lub nie pasuje do wbudowanych presetów, przełącz na Blank
				const isBuiltIn = ALL_LIBRARY_ITEMS.some(
					i => i.id !== 'blank' && (i.name.toLowerCase() === diskData.beatModelName?.toLowerCase() || i.id === diskData.beatModelName?.toLowerCase())
				);
				if (!isBuiltIn) {
					this.selectedBeatPresetId = 'blank';
					this.project.structureProfileId = 'blank';
				}
			}
			this.plugin.projectManager.updateProject(this.project.id, {
				customBeats: this.customBeats,
				beatModelName: this.beatModelName,
				structureProfileId: this.selectedBeatPresetId,
			});
		}
	}

	render(container: HTMLElement): void {
		this.containerEl = container;
		container.empty();
		container.addClass('firefly-book-customize-inline');

		// Header sekcji dostosowywania
		const inlineHeader = container.createDiv('firefly-inline-customize-header');
		const headerLeft = inlineHeader.createDiv('firefly-inline-header-left');
		setIcon(headerLeft.createSpan('firefly-inline-header-icon'), 'sliders');
		headerLeft.createEl('h3', { text: `Dostosowywanie: ${this.project.title}` });

		if (this.beatModelName) {
			inlineHeader.createSpan({
				cls: 'firefly-active-badge',
				text: `Model Beatów: ${this.beatModelName}`,
			});
		}

		// SEKCJA A: System Beatów
		const beatSection = container.createDiv('firefly-customize-section');
		beatSection.createEl('h4', { text: 'A. System Beatów' });
		beatSection.createEl('p', {
			cls: 'firefly-section-desc',
			text: 'Zarządzaj modelem struktury rytmu fabularnego. Wybór „Blank custom” pozwala nazwać model, zarządzać beatami i zapisać go globalnie do wtyczki.',
		});

		const beatPresetWrap = beatSection.createDiv('firefly-beat-preset-wrap');
		const beatsDisplayContainer = beatSection.createDiv('firefly-beats-display-container');

		const renderBeatsArea = () => {
			beatsDisplayContainer.empty();
			if (this.selectedBeatPresetId === 'blank') {
				const customEditor = new BlankCustomBeatsEditor(
					this.customBeats,
					this.beatModelName,
					(updatedBeats, updatedName) => {
						this.customBeats = updatedBeats;
						this.beatModelName = updatedName;
						this.plugin.projectManager.updateProject(this.project.id, {
							customBeats: updatedBeats,
							beatModelName: updatedName,
						});
					},
					async (modelName, beats) => {
						await this.plugin.bookService.saveGlobalBeatModel(modelName, beats);
						new Notice(`Zapisano model beatów „${modelName}” w ustawieniach wtyczki! Jest teraz dostępny dla wszystkich książek.`);
						if (this.containerEl) this.render(this.containerEl);
					},
				);
				customEditor.render(beatsDisplayContainer);
			} else {
				renderBeatsPreview(
					beatsDisplayContainer,
					this.selectedBeatPresetId,
					this.plugin.settings.customBeatModels || [],
				);
			}
		};

		const availablePresets = this.plugin.bookService.getAvailableBeatPresets();

		new Setting(beatPresetWrap)
			.setName('Wybór schematu struktury Beatów')
			.setDesc('Wybierz gotowy profil, własny model lub stwórz nowy (Blank custom).')
			.addDropdown(drop => {
				for (const item of availablePresets) {
					drop.addOption(item.id, item.name);
				}
				drop.setValue(this.selectedBeatPresetId);
				drop.onChange(val => {
					this.selectedBeatPresetId = val;
					if (val === 'blank') {
						if (!this.beatModelName || this.beatModelName === 'Blank Custom') {
							this.beatModelName = `${this.project.title} - Własny Model`;
						}
					} else {
						const selectedItem = availablePresets.find(i => i.id === val);
						if (selectedItem) {
							this.beatModelName = selectedItem.name.replace(' (Własny)', '');
						}
					}
					renderBeatsArea();
				});
			})
			.addButton(btn => {
				btn.setButtonText('Zastosuj system Beatów do książki')
					.setWarning()
					.setTooltip('Tworzy pliki beatów w folderze Beats/ tej książki i aktualizuje referencje')
					.onClick(() => {
						if (!this.project.rootFolder) {
							new Notice('Książka nie ma przypisanego folderu!');
							return;
						}
						const selectedPreset = availablePresets.find(i => i.id === this.selectedBeatPresetId);
						const presetName = this.selectedBeatPresetId === 'blank'
							? this.beatModelName
							: (selectedPreset?.name || this.selectedBeatPresetId);

						new BeatSystemConfirmModal(this.app, presetName, async () => {
							try {
								const res = await this.plugin.bookService.replaceBeatSystem(
									this.project.rootFolder || '',
									this.selectedBeatPresetId,
									this.selectedBeatPresetId === 'blank' ? this.customBeats : undefined,
									presetName,
								);
								this.plugin.projectManager.updateProject(this.project.id, {
									structureProfileId: this.selectedBeatPresetId,
									beatModelName: presetName,
									customBeats: this.selectedBeatPresetId === 'blank' ? this.customBeats : undefined,
								});
								new Notice(
									`Zaktualizowano system beatów: usunięto ${res.deleted} starych plików, wyczyszczono ${res.referencesCleared} referencji, utworzono ${res.created} nowych beatów.`,
								);
								if (this.containerEl) this.render(this.containerEl);
							} catch (e: any) {
								new Notice(`Błąd podczas zmiany beatów: ${e.message || e}`);
							}
						}).open();
					});
			});

		// Wyświetlenie obszaru beatów (edytor lub podgląd)
		renderBeatsArea();

		// SEKCJA B: Edycja poszczególnych Class w plikach
		const classSection = container.createDiv('firefly-customize-section');
		classSection.createEl('h4', { text: 'B. Edycja poszczególnych Class w plikach' });
		classSection.createEl('p', {
			cls: 'firefly-section-desc',
			text: 'Przeglądaj elementy fabularne (zwinięte karty), edytuj ich frontmatter oraz zmieniaj nazwy atrybutów bez utraty wartości.',
		});

		const classTabs = classSection.createDiv('firefly-class-tabs');
		const classes = ['Arc', 'Subplot', 'Beat', 'Mechanic', 'Secret', 'Scene'];

		for (const clsName of classes) {
			const tabBtn = classTabs.createEl('button', {
				cls: `firefly-class-tab-btn ${this.activeClass === clsName ? 'is-active' : ''}`,
				text: clsName,
			});
			tabBtn.onclick = () => {
				this.activeClass = clsName;
				if (this.containerEl) this.render(this.containerEl);
			};
		}

		this.renderClassEditor(classSection);
	}

	private renderClassEditor(container: HTMLElement): void {
		const rootFolder = this.project.rootFolder || '';
		const files = this.plugin.bookService.getClassFiles(rootFolder, this.activeClass);
		const existingAttributes = this.plugin.bookService.getAllAttributesForClass(rootFolder, this.activeClass);

		const editorWrap = container.createDiv('firefly-class-editor-wrap');

		const attrRenameBox = editorWrap.createDiv('firefly-attr-rename-box');
		const renameHeader = attrRenameBox.createDiv('firefly-attr-rename-header');
		setIcon(renameHeader.createSpan('firefly-icon-span'), 'edit-3');
		renameHeader.createEl('strong', { text: `Zmień nazwę atrybutu dla wszystkich plików Class: ${this.activeClass}` });

		const renameControls = attrRenameBox.createDiv('firefly-attr-rename-controls');

		let selectedAttr = existingAttributes[0] || '';
		let newAttrName = '';

		if (existingAttributes.length > 0) {
			const selectAttr = renameControls.createEl('select', { cls: 'dropdown' });
			for (const attr of existingAttributes) {
				const opt = selectAttr.createEl('option', { value: attr, text: attr });
				if (attr === selectedAttr) opt.selected = true;
			}
			selectAttr.onchange = () => {
				selectedAttr = selectAttr.value;
			};

			renameControls.createSpan({ text: ' → ' });

			const newAttrInput = renameControls.createEl('input', {
				type: 'text',
				placeholder: 'Nowa nazwa atrybutu (np. postać)',
				cls: 'firefly-attr-new-input',
			});
			newAttrInput.oninput = () => {
				newAttrName = newAttrInput.value;
			};

			const renameBtn = renameControls.createEl('button', {
				text: 'Zmień nazwę atrybutu',
				cls: 'mod-cta',
			});

			renameBtn.onclick = async () => {
				const from = selectedAttr.trim();
				const to = newAttrName.trim();
				if (!from || !to) {
					new Notice('Wybierz atrybut i wpisz nową nazwę!');
					return;
				}
				if (from.toLowerCase() === to.toLowerCase()) {
					new Notice('Nowa nazwa musi różnić się od obecnej!');
					return;
				}

				renameBtn.disabled = true;
				renameBtn.setText('Przepisywanie...');

				try {
					const result = await this.plugin.bookService.renameAttribute(
						rootFolder,
						this.activeClass,
						from,
						to,
					);
					if (result.success) {
						new Notice(`Pomyślnie zmieniono atrybut "${from}" na "${to}" w ${result.filesModified} plikach!`);
						if (this.containerEl) this.render(this.containerEl);
					} else {
						new Notice('Nie udało się zmienić nazwy atrybutu.');
					}
				} catch (e: any) {
					new Notice(`Błąd podczas zmiany atrybutu: ${e.message || e}`);
				} finally {
					renameBtn.disabled = false;
					renameBtn.setText('Zmień nazwę atrybutu');
				}
			};
		} else {
			attrRenameBox.createEl('p', {
				cls: 'firefly-muted-text',
				text: `Brak plików lub atrybutów dla Class: ${this.activeClass}. Utwórz pierwszy plik poniżej.`,
			});
		}

		const addBar = editorWrap.createDiv('firefly-class-add-bar');
		const addInput = addBar.createEl('input', {
			type: 'text',
			placeholder: `Nazwa nowego ${this.activeClass}...`,
			cls: 'firefly-new-item-input',
		});
		const addBtn = addBar.createEl('button', {
			text: `+ Dodaj ${this.activeClass}`,
			cls: 'mod-cta',
		});

		addBtn.onclick = async () => {
			const name = addInput.value.trim();
			if (!name) {
				new Notice(`Podaj nazwę dla nowego ${this.activeClass}!`);
				return;
			}
			addBtn.disabled = true;
			try {
				const initialFm: Record<string, any> = {
					Nazwa: name,
				};
				if (this.activeClass === 'Arc') {
					initialFm['Owner'] = '';
					initialFm['Kolor'] = '#6366f1';
					initialFm['Stan'] = 'zatw';
				} else if (this.activeClass === 'Subplot') {
					initialFm['Kolor'] = '#ec4899';
					initialFm['Stan'] = 'prop';
				} else if (this.activeClass === 'Mechanic') {
					initialFm['Kolor'] = '#f59e0b';
				} else if (this.activeClass === 'Secret') {
					initialFm['Tytul'] = name;
					initialFm['Prawda'] = '';
					initialFm['KtoWie'] = [];
				} else if (this.activeClass === 'Beat') {
					initialFm['Act'] = 1;
					initialFm['Order'] = files.length + 1;
					initialFm['Stan'] = 'otwarte';
				}

				await this.plugin.bookService.createClassFile(rootFolder, this.activeClass, name, initialFm);
				new Notice(`Utworzono plik dla ${name}!`);
				if (this.containerEl) this.render(this.containerEl);
			} catch (e: any) {
				new Notice(`Błąd tworzenia pliku: ${e.message || e}`);
			} finally {
				addBtn.disabled = false;
			}
		};

		const listContainer = editorWrap.createDiv('firefly-class-files-list');
		listContainer.createEl('h5', {
			text: `Pliki Class: ${this.activeClass} (${files.length}) — kliknij plik, aby rozwinąć edycję atrybutów`,
		});

		if (files.length === 0) {
			listContainer.createEl('div', {
				cls: 'firefly-empty-state',
				text: `Brak plików oznaczonych Class: ${this.activeClass} w tej książce.`,
			});
			return;
		}

		for (const file of files) {
			this.renderFileCard(listContainer, file);
		}
	}

	private renderFileCard(container: HTMLElement, file: TFile): void {
		const isExpanded = this.expandedFiles.has(file.path);
		const card = container.createDiv(`firefly-class-file-card ${isExpanded ? 'is-expanded' : 'is-collapsed'}`);

		const cache = this.app.metadataCache.getFileCache(file);
		const fm = { ...(cache?.frontmatter || {}) };
		delete fm['position'];

		const attrKeys = Object.keys(fm).filter(k => k.toLowerCase() !== 'class');

		const cardHeader = card.createDiv('firefly-file-card-header');

		const leftWrap = cardHeader.createDiv('firefly-file-header-left');
		const chevronBtn = leftWrap.createSpan('firefly-chevron-icon');
		setIcon(chevronBtn, isExpanded ? 'chevron-down' : 'chevron-right');

		const fileInfo = leftWrap.createDiv('firefly-file-info');
		fileInfo.createEl('span', {
			cls: 'firefly-file-title-link',
			text: file.basename,
		});

		fileInfo.createSpan({
			cls: 'firefly-file-attr-count',
			text: `${attrKeys.length} atrybutów`,
		});

		leftWrap.onclick = () => {
			if (this.expandedFiles.has(file.path)) {
				this.expandedFiles.delete(file.path);
				card.removeClass('is-expanded');
				card.addClass('is-collapsed');
				setIcon(chevronBtn, 'chevron-right');
				fmBody.style.display = 'none';
			} else {
				this.expandedFiles.add(file.path);
				card.removeClass('is-collapsed');
				card.addClass('is-expanded');
				setIcon(chevronBtn, 'chevron-down');
				fmBody.style.display = 'block';
			}
		};

		const headerActions = cardHeader.createDiv('firefly-file-header-actions');

		const openBtn = headerActions.createEl('button', {
			text: 'Otwórz',
			cls: 'mod-muted',
		});
		openBtn.onclick = (e) => {
			e.stopPropagation();
			this.app.workspace.openLinkText(file.path, '', false);
		};

		const deleteBtn = headerActions.createEl('button', {
			cls: 'mod-warning firefly-icon-btn',
			attr: { title: 'Usuń plik' },
		});
		setIcon(deleteBtn, 'trash-2');
		deleteBtn.onclick = async (e) => {
			e.stopPropagation();
			if (confirm(`Czy na pewno usunąć plik "${file.basename}"?`)) {
				await this.app.vault.trash(file, true);
				this.expandedFiles.delete(file.path);
				new Notice(`Plik ${file.basename} został usunięty.`);
				if (this.containerEl) this.render(this.containerEl);
			}
		};

		const fmBody = card.createDiv('firefly-file-card-body');
		if (!isExpanded) {
			fmBody.style.display = 'none';
		}

		const fmGrid = fmBody.createDiv('firefly-fm-grid');

		if (attrKeys.length === 0) {
			fmGrid.createEl('span', {
				cls: 'firefly-muted-text',
				text: 'Brak dodatkowych atrybutów w tym pliku.',
			});
		} else {
			for (const key of attrKeys) {
				const val = fm[key];
				const row = fmGrid.createDiv('firefly-fm-row');
				row.createSpan({ cls: 'firefly-fm-key', text: `${key}:` });

				const input = row.createEl('input', {
					type: 'text',
					cls: 'firefly-fm-input',
					value: Array.isArray(val) ? val.join(', ') : (val !== null && val !== undefined ? String(val) : ''),
				});

				input.onblur = async () => {
					const newVal = input.value.trim();
					let parsedVal: any = newVal;
					if (Array.isArray(val)) {
						parsedVal = newVal ? newVal.split(',').map(s => s.trim()) : [];
					} else if (typeof val === 'number') {
						const num = parseFloat(newVal);
						parsedVal = isNaN(num) ? newVal : num;
					}

					if (parsedVal !== val) {
						await this.plugin.bookService.updateFrontmatter(file, { [key]: parsedVal });
						new Notice(`Zaktualizowano ${key} w ${file.basename}`);
					}
				};
			}
		}
	}
}
