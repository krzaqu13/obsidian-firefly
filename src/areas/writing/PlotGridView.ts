import { App, Notice, setIcon, TFile } from 'obsidian';
import type FireflyPlugin from '../../main';
import { PlotGridState, type GridCol, type PlotGridTabId } from './plotgrid/state/PlotGridState';
import { PlotGridReader, cellValue } from '../../services/PlotGridReader';
import { SceneReader } from '../../services/SceneReader';
import { validatePlotGrid } from './PlotGridValidator';
import { renderPlotGridTopbarControls } from './plotgrid/components/PlotGridHeader';
import type { PlotGridDrawerCallbacks } from './plotgrid/drawer/PlotGridDrawer';
import { renderPlotGridMatrixView } from './plotgrid/views/PlotGridMatrixView';
import { renderPlotGridBeatsView } from './plotgrid/views/PlotGridBeatsView';
import { renderPlotGridScenesView } from './plotgrid/views/PlotGridScenesView';
import { renderPlotGridArcsView } from './plotgrid/views/PlotGridArcsView';
import { renderPlotGridSubplotsView } from './plotgrid/views/PlotGridSubplotsView';
import { renderPlotGridMechanicsView } from './plotgrid/views/PlotGridMechanicsView';
import { renderPlotGridSecretsView } from './plotgrid/views/PlotGridSecretsView';
import type { Arc } from '../../models/Arc';
import type { Subplot } from '../../models/Subplot';
import type { Mechanic } from '../../models/Mechanic';

/**
 * Główny kontroler PlotGridu w obszarze Writing.
 * Łączy model aktywnej książki z 7 modułowymi zakładkami widoku i prawym drawerem.
 */
export class PlotGridView {
	private plugin: FireflyPlugin;
	private container: HTMLElement;
	private state: PlotGridState = new PlotGridState();
	private keyHandler?: (e: KeyboardEvent) => void;
	private onStateChange?: () => void;
	public isLoaded = false;

	constructor(plugin: FireflyPlugin, container: HTMLElement, onStateChange?: () => void) {
		this.plugin = plugin;
		this.container = container;
		this.onStateChange = onStateChange;
	}

	setContainer(container: HTMLElement): void {
		this.container = container;
	}

	destroy(): void {
		if (this.keyHandler) {
			window.removeEventListener('keydown', this.keyHandler);
			this.keyHandler = undefined;
		}
		this.plugin.getPlotGridDetailsView()?.clearContent();
	}

	// =========================================================================
	// Publiczny punkt wejścia
	// =========================================================================

	render(targetTab?: PlotGridTabId): void {
		if (targetTab) {
			this.state.activeTab = targetTab;
		}
		this.container.empty();
		this.container.addClass('ff-plotgrid-root');

		const project = this.plugin.projectManager.getActiveProject();
		if (!project?.rootFolder) {
			this.renderSetupNotice('Wybierz aktywną książkę w ustawieniach, aby zobaczyć PlotGrid.');
			return;
		}

		this.setupKeyboardShortcuts();
		if (!this.isLoaded) {
			this.loadData();
		} else {
			this.renderShell();
		}
	}

	async reload(): Promise<void> {
		this.isLoaded = false;
		await this.loadData();
	}

	// =========================================================================
	// Ładowanie i synchronizacja danych
	// =========================================================================

	private async loadData(): Promise<void> {
		const project = this.plugin.projectManager.getActiveProject();
		if (!project?.rootFolder) return;

		const root = project.rootFolder.replace(/\\/g, '/').replace(/\/$/, '');
		const reader = new PlotGridReader(this.plugin.app, root);
		const sceneReader = new SceneReader(this.plugin.app);

		// Wczytaj wszystkie dane
		this.state.data.beats = reader.readBeats();
		this.state.data.arcs = await reader.readArcs();
		this.state.data.subplots = reader.readSubplots();
		this.state.data.mechanics = reader.readMechanics();
		this.state.data.secrets = reader.readSecrets();
		this.state.data.scenes = sceneReader.getAllScenes(this.plugin);

		if (this.state.data.beats.length === 0) {
			this.renderSetupNotice(
				`Nie znaleziono plików beatów (Class: Beat) w książce "${project.title}" (${root}). ` +
				'Upewnij się, że pliki w folderze Beats posiadają we frontmatterze pole "Class: Beat".',
			);
			return;
		}

		reader.enrichSubcolumnsFromBeats([...this.state.data.arcs, ...this.state.data.subplots], this.state.data.beats);

		const existingIds = new Set([
			...this.state.data.arcs.map(a => a.id.toLowerCase()),
			...this.state.data.subplots.map(s => s.id.toLowerCase()),
			...this.state.data.mechanics.map(m => m.id.toLowerCase()),
		]);
		const synthMechs = reader.synthesizeMissingColumns(this.state.data.beats, existingIds);
		this.state.data.mechanics = [...this.state.data.mechanics, ...synthMechs];

		this.isLoaded = true;
		this.state.data.cols = this.buildCols();
		this.runValidation();
		this.state.autoSelectFirst();
		this.renderShell();
		this.onStateChange?.();
	}

	private buildCols(): GridCol[] {
		const cols: GridCol[] = [];

		for (const arc of this.state.data.arcs) {
			cols.push({
				type: 'Arc',
				source: arc,
				leaves: arc.podkolumny.length > 0 ? arc.podkolumny : [null],
				color: arc.kolor,
			});
		}
		for (const sub of this.state.data.subplots) {
			cols.push({
				type: 'Subplot',
				source: sub,
				leaves: sub.podkolumny.length > 0 ? sub.podkolumny : [null],
				color: sub.kolor,
			});
		}
		for (const mech of this.state.data.mechanics) {
			const leaves = mech.podkolumny && mech.podkolumny.length > 0 ? mech.podkolumny : [null];
			cols.push({
				type: 'Mechanic',
				source: mech,
				leaves,
				color: mech.kolor,
			});
		}

		return cols.sort((a, b) => a.source.columnOrder - b.source.columnOrder);
	}

	private runValidation(): void {
		this.state.data.validation = validatePlotGrid(
			this.state.data.beats,
			this.state.data.arcs,
			this.state.data.subplots,
			this.state.data.mechanics,
			this.state.data.secrets,
			this.state.data.scenes,
		);
	}

	// =========================================================================
	// Renderowanie powłoki (Shell)
	// =========================================================================

	private renderShell(): void {
		this.container.empty();
		this.container.addClass('ff-plotgrid-root');

		const project = this.plugin.projectManager.getActiveProject();
		if (!project) return;

		// Obszar roboczy: Widok Główny + Prawy Drawer
		const workspace = this.container.createDiv('ff-pg-workspace');
		const viewContainer = workspace.createDiv('ff-pg-active-view-container');

		switch (this.state.activeTab) {
			case 'plotgrid':
				renderPlotGridMatrixView(viewContainer, this.state, {
					onSelectCell: (beatFilePath, colId, sub, colType) => {
						this.state.selectCell(beatFilePath, colId, sub, colType);
						this.renderShell();
					},
					onSelectColumn: (colId, colType) => {
						this.state.selectColumn(colId, colType);
						this.renderShell();
					},
					onSelectSecret: (secretId) => {
						this.state.selectSecret(secretId);
						this.renderShell();
					},
					onSelectBeat: (beatFilePath) => {
						this.state.selectBeat(beatFilePath);
						this.renderShell();
					},
				});
				break;

			case 'beats':
				renderPlotGridBeatsView(viewContainer, this.state, {
					onSelectBeat: (beatFilePath) => {
						this.state.selectBeat(beatFilePath);
						this.renderShell();
					},
					onSelectSecret: (secretId) => {
						this.state.selectSecret(secretId);
						this.renderShell();
					},
				});
				break;

			case 'scenes':
				renderPlotGridScenesView(viewContainer, this.state, {
					onSelectScene: (sceneFilePath) => {
						this.state.selectScene(sceneFilePath);
						this.renderShell();
					},
				});
				break;

			case 'arcs':
				renderPlotGridArcsView(viewContainer, this.state, {
					onSelectArc: (arcId) => {
						this.state.selectedArcId = arcId;
						this.state.selectColumn(arcId, 'arc');
						this.renderShell();
					},
					onSelectCell: (beatFilePath, colId, sub, colType) => {
						this.state.selectCell(beatFilePath, colId, sub, colType);
						this.renderShell();
					},
				});
				break;

			case 'subplots':
				renderPlotGridSubplotsView(viewContainer, this.state, {
					onSelectSubplot: (subplotId) => {
						this.state.selectedSubplotId = subplotId;
						this.state.selectColumn(subplotId, 'subplot');
						this.renderShell();
					},
					onSelectCell: (beatFilePath, colId, sub, colType) => {
						this.state.selectCell(beatFilePath, colId, sub, colType);
						this.renderShell();
					},
				});
				break;

			case 'mechanics':
				renderPlotGridMechanicsView(viewContainer, this.state, {
					onSelectMechanic: (mechanicId) => {
						this.state.selectedMechanicId = mechanicId;
						this.state.selectColumn(mechanicId, 'mechanic');
						this.renderShell();
					},
					onSelectCell: (beatFilePath, colId, sub, colType) => {
						this.state.selectCell(beatFilePath, colId, sub, colType);
						this.renderShell();
					},
				});
				break;

			case 'secrets':
				renderPlotGridSecretsView(viewContainer, this.state, {
					onSelectSecret: (secretId) => {
						this.state.selectSecret(secretId);
						this.renderShell();
					},
					onSelectBeat: (beatFilePath) => {
						this.state.selectBeat(beatFilePath);
						this.renderShell();
					},
				});
				break;
		}

		// 3. Prawy Sidebar — aktualizacja szczegółów
		this.updateDetailsSidebar();
	}

	// =========================================================================
	// Prawy sidebar ze szczegółami PlotGrid
	// =========================================================================

	private async updateDetailsSidebar(): Promise<void> {
		if (!this.state.selection) {
			const view = this.plugin.getPlotGridDetailsView();
			view?.clearContent();
			return;
		}

		const detailsView = await this.plugin.openPlotGridDetails();
		if (!detailsView) return;

		detailsView.updateContent(this.state, this.getDrawerCallbacks());
	}

	private getDrawerCallbacks(): PlotGridDrawerCallbacks {
		return {
			onClose: () => {
				this.state.closeDrawer();
				this.state.selection = null;
				this.plugin.getPlotGridDetailsView()?.clearContent();
				this.renderShell();
			},
			onModeChange: (mode) => {
				if (mode === 'column' && this.state.selection?.kind === 'cell') {
					this.state.selection = {
						kind: 'column',
						colId: this.state.selection.colId,
						colType: this.state.selection.colType,
					};
				} else if (mode === 'cell' && this.state.selection?.kind === 'column') {
					const colId = this.state.selection.colId;
					const colType = this.state.selection.colType;
					const col = this.state.data.cols.find(c => c.source.id.toLowerCase() === colId.toLowerCase());
					const leaves = col?.leaves.length ? col.leaves : [null];
					const sub = leaves[0] ?? null;

					let targetBeat = (this.state.lastSelectedCell && this.state.lastSelectedCell.colId.toLowerCase() === colId.toLowerCase())
						? this.state.data.beats.find(b => b.filePath === this.state.lastSelectedCell!.beatFilePath)
						: null;

					if (!targetBeat && col) {
						targetBeat = this.state.data.beats.find(b => cellValue(b, col.source.id, sub, colType).length > 0);
					}
					if (!targetBeat) {
						targetBeat = this.state.data.beats[0];
					}

					if (targetBeat && col) {
						this.state.selection = {
							kind: 'cell',
							beatFilePath: targetBeat.filePath,
							colId: col.source.id,
							sub,
							colType,
						};
						this.state.lastSelectedCell = { ...this.state.selection };
					}
				}
				this.state.drawerMode = mode;
				this.renderShell();
			},
			onOpenFile: (filePath) => {
				this.plugin.app.workspace.openLinkText(filePath, '', true);
			},
			onShowInPlotGrid: (colId, beatFilePath) => {
				this.state.activeTab = 'plotgrid';
				this.plugin.areaManager.setActiveTab('plotgrid', 'plotgrid');
				if (colId) {
					this.state.selectColumn(colId, 'arc');
				} else if (beatFilePath) {
					this.state.selectBeat(beatFilePath);
				}
				this.renderShell();
				this.onStateChange?.();
			},
			onShowBeat: (beatFilePath) => {
				this.state.activeTab = 'plotgrid';
				this.plugin.areaManager.setActiveTab('plotgrid', 'plotgrid');
				this.state.selectBeat(beatFilePath);
				this.renderShell();
				this.onStateChange?.();
			},
			onAddEntry: (beatFilePath, key) => {
				new Notice(`Edycja komórki: otwórz plik beatu i dodaj wpis pod kluczem "${key}".`);
				this.plugin.app.workspace.openLinkText(beatFilePath, '', true);
			},
			onSaveEntry: async (beatFilePath, key, newEntry) => {
				const file = this.plugin.app.vault.getAbstractFileByPath(beatFilePath);
				if (file instanceof TFile) {
					await this.plugin.app.fileManager.processFrontMatter(file, (fm: Record<string, any>) => {
						const existing = fm[key];
						if (Array.isArray(existing)) {
							fm[key] = [...existing, newEntry];
						} else if (typeof existing === 'string' && existing.trim()) {
							fm[key] = [existing, newEntry];
						} else {
							fm[key] = [newEntry];
						}
					});
					new Notice(`Dodano wpis w "${file.basename}".`);
					await this.loadData();
					this.renderShell();
				}
			},
			onDeleteEntry: async (beatFilePath, key, index) => {
				const file = this.plugin.app.vault.getAbstractFileByPath(beatFilePath);
				if (file instanceof TFile) {
					await this.plugin.app.fileManager.processFrontMatter(file, (fm: Record<string, any>) => {
						const existing = fm[key];
						if (Array.isArray(existing)) {
							existing.splice(index, 1);
							if (existing.length === 0) {
								delete fm[key];
							} else {
								fm[key] = existing;
							}
						} else {
							delete fm[key];
						}
					});
					new Notice(`Usunięto wpis z "${file.basename}".`);
					await this.loadData();
					this.renderShell();
				}
			},
		};
	}

	// =========================================================================
	// Kontrolki Topbara (Badges, Menu Widoku, Nowe elementy)
	// =========================================================================

	buildTopbarControls(rightEl: HTMLElement): void {
		const project = this.plugin.projectManager.getActiveProject();
		if (!project) return;

		renderPlotGridTopbarControls(rightEl, this.state, project, {
			onTabChange: (tabId) => {
				this.state.activeTab = tabId;
				this.plugin.areaManager.setActiveTab('plotgrid', tabId);
				this.renderShell();
				this.onStateChange?.();
			},
			onOrientChange: (orient) => {
				this.state.orient = orient;
				this.renderShell();
				this.onStateChange?.();
			},
			onRescan: async () => {
				new Notice('Ponowne skanowanie plików książki...');
				await this.reload();
			},
			onFilterColumns: (anchorEl) => {
				this.showColumnFilterPopover(anchorEl);
			},
			onNewBeat: () => this.handleNewEntity('Beat'),
			onNewScene: () => this.handleNewEntity('Scene'),
			onNewArc: () => this.handleNewEntity('Arc'),
			onNewSubplot: () => this.handleNewEntity('Subplot'),
			onNewMechanic: () => this.handleNewEntity('Mechanic'),
			onNewSecret: () => this.handleNewEntity('Secret'),
		});
	}

	// =========================================================================
	// Filtrowanie kolumn (Dropdown / Popover)
	// =========================================================================

	private showColumnFilterPopover(anchorEl: HTMLElement): void {
		const existing = document.querySelector('.ff-pg-filter-popover');
		if (existing) {
			existing.remove();
			return;
		}

		const popover = document.body.createDiv('ff-pg-filter-popover');
		const rect = anchorEl.getBoundingClientRect();
		popover.style.top = `${rect.bottom + 6}px`;
		if (rect.left + 260 > window.innerWidth) {
			popover.style.right = `${Math.max(10, window.innerWidth - rect.right)}px`;
			popover.style.left = 'auto';
		} else {
			popover.style.left = `${rect.left}px`;
		}

		popover.createDiv({ cls: 'ff-pg-popover-title', text: 'Widoczność kolumn' });

		const list = popover.createDiv('ff-pg-popover-list');
		for (const col of this.state.data.cols) {
			const id = col.source.id;
			const isHidden = this.state.hiddenCols.has(id);

			const item = list.createEl('label', { cls: 'ff-pg-popover-item' });
			const cb = item.createEl('input', { attr: { type: 'checkbox' } });
			cb.checked = !isHidden;

			const dot = item.createSpan({ cls: 'ff-pg-col-dot' });
			dot.style.background = col.color;
			item.createSpan({ text: col.source.nazwa });

			cb.addEventListener('change', () => {
				if (cb.checked) {
					this.state.hiddenCols.delete(id);
				} else {
					this.state.hiddenCols.add(id);
				}
				this.renderShell();
				this.onStateChange?.();
			});
		}

		// Przełącznik dla Tajemnic
		const secItem = list.createEl('label', { cls: 'ff-pg-popover-item' });
		const secCb = secItem.createEl('input', { attr: { type: 'checkbox' } });
		secCb.checked = !this.state.hiddenSecrets;
		const secDot = secItem.createSpan({ cls: 'ff-pg-col-dot' });
		secDot.style.background = 'var(--interactive-accent)';
		secItem.createSpan({ text: 'Tajemnice (Secrets)' });
		secCb.addEventListener('change', () => {
			this.state.hiddenSecrets = !secCb.checked;
			this.renderShell();
			this.onStateChange?.();
		});

		const closeHandler = (e: MouseEvent) => {
			if (!popover.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) {
				popover.remove();
				document.removeEventListener('click', closeHandler);
			}
		};
		setTimeout(() => document.addEventListener('click', closeHandler), 10);
	}

	// =========================================================================
	// Skróty klawiszowe
	// =========================================================================

	private setupKeyboardShortcuts(): void {
		if (this.keyHandler) return;
		this.keyHandler = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && this.state.selection) {
				this.state.closeDrawer();
				this.state.selection = null;
				this.plugin.getPlotGridDetailsView()?.clearContent();
				this.renderShell();
			}
		};
		window.addEventListener('keydown', this.keyHandler);
	}

	// =========================================================================
	// Obsługa tworzenia nowych elementów
	// =========================================================================

	private handleNewEntity(type: string): void {
		new Notice(`Tworzenie nowej encji "${type}" w folderze książki.`);
	}

	// =========================================================================
	// Komunikat braku konfiguracji (Setup Notice)
	// =========================================================================

	private renderSetupNotice(message: string): void {
		const box = this.container.createDiv('ff-plotgrid-empty-state');
		setIcon(box.createDiv('ff-plotgrid-empty-icon'), 'grid-3x3');
		box.createEl('h3', { text: 'PlotGrid — Siatka Narracyjna' });
		box.createEl('p', { text: message });

		const btn = box.createEl('button', {
			cls: 'mod-cta',
			text: 'Przejdź do Ustawień Książek',
		});
		btn.addEventListener('click', () => {
			(this.plugin.app as any).setting?.open?.();
			(this.plugin.app as any).setting?.openTabById?.(this.plugin.manifest.id);
		});
	}
}
