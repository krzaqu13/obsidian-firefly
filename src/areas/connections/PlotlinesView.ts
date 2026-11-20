import { setIcon, Menu, Modal, Notice } from 'obsidian';
import type FireflyPlugin from '../../main';
import { Scene, getStatusCfg } from '../../models/Scene';

// ─── Subplot palette ────────────────────────────────────────────────────────
// 12 distinct, high-contrast subway-line colors that look great on dark and light themes
const SUBPLOT_HUES = [210, 32, 145, 275, 4, 185, 45, 315, 95, 240, 165, 345];

function getSubplotColor(index: number): string {
	const hue = SUBPLOT_HUES[index % SUBPLOT_HUES.length]!;
	return `hsl(${hue}, 52%, 48%)`;
}

type PlotlinesSortMode = 'chronological' | 'reading' | 'title';

/**
 * PlotlinesView — widok "Connections → Plotlines".
 *
 * Układ:
 *   - Kolumna 0: Sceny ułożone chronologicznie od góry do dołu (pionowo)
 *   - Obok nich: Kolumny ze ścieżkami metra dla każdego subplotu (czytane z atrybutu "subplots")
 *   - Wszystkie przyciski funkcyjne: w firefly-topbar
 */
export class PlotlinesView {
	private plugin: FireflyPlugin;
	private container: HTMLElement;
	private onStateChange?: () => void;

	// Stan widoku
	private hiddenSubplots: Set<string> = new Set();
	private sortMode: PlotlinesSortMode = 'chronological';
	private showSynopsis = false;
	private allSubplots: string[] = [];

	constructor(plugin: FireflyPlugin, container: HTMLElement, onStateChange?: () => void) {
		this.plugin = plugin;
		this.container = container;
		this.onStateChange = onStateChange;
	}

	// ── Topbar Controls ───────────────────────────────────────────────────────

	/**
	 * Buduje kontrolki funkcyjne wewnątrz firefly-topbar.
	 */
	buildTopbarControls(rightEl: HTMLElement): void {
		rightEl.empty();

		// 1. Filtr subplotów (menu wyboru widocznych wątków)
		const filterBtn = rightEl.createEl('button', {
			cls: `firefly-topbar-mode-btn${this.hiddenSubplots.size > 0 ? ' is-active' : ''}`,
			attr: { 'aria-label': 'Filtruj wątki (subploty)' },
		});
		setIcon(filterBtn.createSpan(), 'filter');
		const visibleCount = this.allSubplots.length - this.hiddenSubplots.size;
		const filterLabel = filterBtn.createSpan({
			text: this.hiddenSubplots.size > 0
				? `Wątki (${visibleCount}/${this.allSubplots.length})`
				: `Wątki (${this.allSubplots.length})`,
		});

		filterBtn.addEventListener('click', (e: MouseEvent) => {
			if (this.allSubplots.length === 0) return;
			const menu = new Menu();

			menu.addItem(item => {
				item.setTitle('Pokaż wszystkie')
					.setIcon('eye')
					.onClick(() => {
						this.hiddenSubplots.clear();
						this.rerender();
						this.onStateChange?.();
					});
			});

			menu.addItem(item => {
				item.setTitle('Ukryj wszystkie')
					.setIcon('eye-off')
					.onClick(() => {
						for (const sp of this.allSubplots) this.hiddenSubplots.add(sp);
						this.rerender();
						this.onStateChange?.();
					});
			});

			menu.addSeparator();

			this.allSubplots.forEach((sp, idx) => {
				const isVisible = !this.hiddenSubplots.has(sp);
				menu.addItem(item => {
					item.setTitle(`${isVisible ? '✓ ' : '    '}${sp}`)
						.onClick(() => {
							if (isVisible) {
								this.hiddenSubplots.add(sp);
							} else {
								this.hiddenSubplots.delete(sp);
							}
							this.rerender();
							this.onStateChange?.();
						});
				});
			});

			menu.showAtPosition({ x: e.clientX, y: e.clientY });
		});

		rightEl.createDiv('firefly-topbar-separator');

		// 2. Sortowanie
		const orderWrap = rightEl.createDiv('firefly-topbar-group');
		orderWrap.createSpan({ cls: 'firefly-topbar-group-label', text: 'Kolejność:' });
		const orderSelect = orderWrap.createEl('select', { cls: 'firefly-topbar-select' });
		orderSelect.addEventListener('keydown', (e: KeyboardEvent) => e.stopPropagation());
		for (const [value, label] of [
			['chronological', 'Chronologiczna'],
			['reading', 'Czytania'],
			['title', 'Tytuł'],
		] as const) {
			const opt = orderSelect.createEl('option', { text: label, value });
			if (value === this.sortMode) opt.selected = true;
		}
		orderSelect.addEventListener('change', () => {
			this.sortMode = orderSelect.value as PlotlinesSortMode;
			this.rerender();
		});

		rightEl.createDiv('firefly-topbar-separator');

		// 3. Przełącznik opisu sceny
		const synBtn = rightEl.createEl('button', {
			cls: `firefly-topbar-mode-btn${this.showSynopsis ? ' is-active' : ''}`,
			attr: { 'aria-label': this.showSynopsis ? 'Ukryj opisy' : 'Pokaż opisy' },
		});
		setIcon(synBtn.createSpan(), 'align-left');
		synBtn.createSpan({ text: 'Opis' });
		synBtn.addEventListener('click', () => {
			this.showSynopsis = !this.showSynopsis;
			synBtn.classList.toggle('is-active', this.showSynopsis);
			this.rerender();
		});

		rightEl.createDiv('firefly-topbar-separator');

		// 4. Odśwież
		const refreshBtn = rightEl.createEl('button', {
			cls: 'firefly-topbar-icon-btn',
			attr: { 'aria-label': 'Odśwież' },
		});
		setIcon(refreshBtn, 'refresh-cw');
		refreshBtn.addEventListener('click', () => {
			this.refresh();
		});

		rightEl.createDiv('firefly-topbar-separator');

		// 5. Nowa scena
		const newBtn = rightEl.createEl('button', { cls: 'firefly-topbar-btn-primary' });
		setIcon(newBtn.createSpan(), 'plus');
		newBtn.createSpan({ text: 'Nowa scena' });
		newBtn.addEventListener('click', () => this.openNewSceneModal());
	}

	// ── Render ────────────────────────────────────────────────────────────────

	render(): void {
		this.container.empty();

		const scenes = this.plugin.sceneReader.getAllScenes(this.plugin);
		if (scenes.length === 0) {
			this.renderEmpty();
			return;
		}

		// Zbieramy unikalne subploty w kolejności występowania
		const subplots: string[] = [];
		for (const scene of scenes) {
			if (Array.isArray(scene.subplots)) {
				for (const sp of scene.subplots) {
					const trimmed = String(sp).trim();
					if (trimmed && !subplots.includes(trimmed)) {
						subplots.push(trimmed);
					}
				}
			}
		}
		this.allSubplots = subplots;

		if (subplots.length === 0) {
			this.renderNoSubplots(scenes);
			return;
		}

		// Sortowanie scen wg wybranego trybu
		const sortedScenes = [...scenes].sort((a, b) => {
			if (this.sortMode === 'chronological') {
				const actA = this.parseNum(a.act, 999);
				const actB = this.parseNum(b.act, 999);
				if (actA !== actB) return actA - actB;
				return (a.sequence ?? 999) - (b.sequence ?? 999);
			}
			if (this.sortMode === 'reading') {
				const actA = this.parseNum(a.act, 999);
				const actB = this.parseNum(b.act, 999);
				if (actA !== actB) return actA - actB;
				const chA = this.parseNum(a.chapter, 999);
				const chB = this.parseNum(b.chapter, 999);
				if (chA !== chB) return chA - chB;
				return (a.sequence ?? 999) - (b.sequence ?? 999);
			}
			if (this.sortMode === 'title') {
				return (a.title || '').localeCompare(b.title || '');
			}
			return 0;
		});

		// Filtrowanie widocznych subplotów
		const visibleSubplots = subplots.filter(sp => !this.hiddenSubplots.has(sp));

		this.renderSubwayMatrix(sortedScenes, visibleSubplots, subplots);
	}

	rerender(): void {
		this.render();
	}

	refresh(): void {
		this.render();
		this.onStateChange?.();
	}

	// ── Subway Matrix ─────────────────────────────────────────────────────────

	private renderSubwayMatrix(
		scenes: Scene[],
		visibleSubplots: string[],
		allSubplots: string[],
	): void {
		const scrollWrapper = this.container.createDiv('ff-plotlines-scroll-wrapper');
		const matrix = scrollWrapper.createDiv('ff-plotlines-matrix');

		// ── Nagłówek tabeli ───────────────────────────────────────────────────
		const headerRow = matrix.createDiv('ff-plotlines-header-row');

		// Róg: Sceny
		const corner = headerRow.createDiv('ff-plotlines-corner-cell');
		const cornerIcon = corner.createSpan({ cls: 'ff-plotlines-corner-icon' });
		setIcon(cornerIcon, 'film');
		const cornerText = corner.createDiv('ff-plotlines-corner-text');
		cornerText.createDiv({ cls: 'ff-plotlines-corner-title', text: 'SCENY' });
		cornerText.createDiv({ cls: 'ff-plotlines-corner-subtitle', text: `${scenes.length} scen` });

		// Kolumny dla widocznych subplotów
		if (visibleSubplots.length === 0) {
			const emptyCol = headerRow.createDiv('ff-plotlines-empty-header-notice');
			emptyCol.setText('Wszystkie wątki ukryte. Włącz je w menu "Wątki" na górnym pasku.');
		} else {
			visibleSubplots.forEach(sp => {
				const colorIdx = allSubplots.indexOf(sp);
				const color = getSubplotColor(colorIdx);
				const colHeader = headerRow.createDiv('ff-plotlines-col-header');

				const lineCap = colHeader.createDiv('ff-plotlines-col-cap');
				lineCap.style.backgroundColor = color;

				const titleEl = colHeader.createDiv({ cls: 'ff-plotlines-col-title', text: sp });
				titleEl.title = sp;

				const count = scenes.filter(s => s.subplots?.map(x => String(x).trim()).includes(sp)).length;
				colHeader.createDiv({ cls: 'ff-plotlines-col-count', text: `${count} sc.` });
			});
		}

		// ── Ciało tabeli (wiersze scen) ───────────────────────────────────────
		const body = matrix.createDiv('ff-plotlines-body');

		// Obliczamy indeksy wystąpień każdego subplotu
		const subplotIndices = new Map<string, number[]>();
		visibleSubplots.forEach(sp => {
			const idxs: number[] = [];
			scenes.forEach((s, idx) => {
				if (s.subplots?.map(x => String(x).trim()).includes(sp)) {
					idxs.push(idx);
				}
			});
			subplotIndices.set(sp, idxs);
		});

		scenes.forEach((scene, rowIdx) => {
			const row = body.createDiv('ff-plotlines-row');
			row.setAttribute('data-status', scene.status ?? 'idea');

			// 1. Karta sceny (przypięta po lewej)
			const sceneCell = row.createDiv('ff-plotlines-scene-cell');
			const statusCfg = getStatusCfg(scene.status);
			sceneCell.style.borderLeft = `3px solid ${statusCfg.color}`;

			const actStr = scene.act !== undefined ? String(scene.act).padStart(2, '0') : '??';
			const seqStr = scene.sequence !== undefined ? String(scene.sequence).padStart(2, '0') : '??';

			const badge = sceneCell.createDiv('ff-plotlines-scene-badge');
			badge.createSpan({ text: `${actStr}-${seqStr}` });

			const info = sceneCell.createDiv('ff-plotlines-scene-info');
			info.createDiv({ cls: 'ff-plotlines-scene-title', text: scene.title || 'Bez tytułu' });
			if (this.showSynopsis && scene.synopsis) {
				info.createDiv({ cls: 'ff-plotlines-scene-synopsis', text: scene.synopsis });
			}

			sceneCell.title = `Kliknij, aby otworzyć: ${scene.title || scene.filePath}`;
			sceneCell.addEventListener('click', () => {
				this.plugin.sceneReader.openScene(scene.filePath);
			});

			// 2. Ścieżki metra dla widocznych subplotów
			const activeColIndices: number[] = [];

			visibleSubplots.forEach((sp, colIdx) => {
				const colorIdx = allSubplots.indexOf(sp);
				const color = getSubplotColor(colorIdx);
				const trackCell = row.createDiv('ff-plotlines-track-cell');

				const idxs = subplotIndices.get(sp) ?? [];
				const isStation = idxs.includes(rowIdx);
				if (isStation) {
					activeColIndices.push(colIdx);
				}

				if (idxs.length > 0) {
					const firstIdx = idxs[0]!;
					const lastIdx = idxs[idxs.length - 1]!;

					if (rowIdx >= firstIdx && rowIdx <= lastIdx) {
						const line = trackCell.createDiv('ff-plotlines-track-line');
						line.style.backgroundColor = color;

						if (firstIdx === lastIdx) {
							line.addClass('ff-plotlines-track-line--single');
						} else if (rowIdx === firstIdx) {
							line.addClass('ff-plotlines-track-line--start');
						} else if (rowIdx === lastIdx) {
							line.addClass('ff-plotlines-track-line--end');
						} else {
							line.addClass('ff-plotlines-track-line--through');
						}
					}
				}

				if (isStation) {
					const node = trackCell.createDiv('ff-plotlines-station-node');
					node.style.borderColor = color;
					node.title = `${scene.title} • Wątek: ${sp}`;
					node.addEventListener('click', (e: MouseEvent) => {
						e.stopPropagation();
						this.plugin.sceneReader.openScene(scene.filePath);
					});

					const dot = node.createDiv('ff-plotlines-station-dot');
					dot.style.backgroundColor = color;
				}
			});

			// 3. Poziomy łącznik, jeśli scena należy do >= 2 subplotów
			if (activeColIndices.length >= 2) {
				const minCol = Math.min(...activeColIndices);
				const maxCol = Math.max(...activeColIndices);
				if (maxCol > minCol) {
					const conn = row.createDiv('ff-plotlines-row-connector');
					const colWidth = 110;
					const sceneCellWidth = 280;
					const leftPx = sceneCellWidth + minCol * colWidth + colWidth / 2;
					const widthPx = (maxCol - minCol) * colWidth;
					conn.style.left = `${leftPx}px`;
					conn.style.width = `${widthPx}px`;
				}
			}
		});
	}

	// ── Placeholders ──────────────────────────────────────────────────────────

	private renderEmpty(): void {
		const ph = this.container.createDiv('firefly-placeholder');
		setIcon(ph.createDiv({ cls: 'firefly-placeholder-icon' }), 'git-branch');
		ph.createEl('h2', { cls: 'firefly-placeholder-title', text: 'Brak scen' });
		ph.createEl('p', {
			cls: 'firefly-placeholder-subtitle',
			text: 'Wybierz projekt i utwórz sceny, aby zobaczyć widok Plotlines.',
		});
	}

	private renderNoSubplots(scenes: Scene[]): void {
		const wrap = this.container.createDiv('ff-plotlines-no-subplots');
		wrap.createEl('h3', { text: 'Brak zdefiniowanych wątków (subplots)' });
		wrap.createEl('p', {
			cls: 'ff-plotlines-hint',
			text: `Znaleziono ${scenes.length} scen(y), ale żadna nie ma pola "subplots" w pliku frontmatter.`,
		});
		wrap.createEl('p', {
			cls: 'ff-plotlines-hint',
			text: 'Dodaj pole "subplots" w pliku sceny, na przykład:',
		});
		const pre = wrap.createEl('pre', { cls: 'ff-plotlines-hint-code' });
		pre.createEl('code', { text: '---\ntype: scene\ntitle: Tytuł sceny\nact: 1\nsequence: 1\nsubplots:\n  - Bractwo\n  - Organizacja\n---' });
	}

	// ── Modal Nowa Scena ──────────────────────────────────────────────────────

	private openNewSceneModal(): void {
		const plugin = this.plugin;
		const allSubplots = this.allSubplots;
		const scenes = plugin.sceneReader.getAllScenes(plugin);
		const nextSeq = scenes.length + 1;
		const refreshCallback = () => this.refresh();

		class CreateSceneModal extends Modal {
			onOpen() {
				const { contentEl } = this;
				contentEl.empty();
				contentEl.createEl('h2', { text: 'Nowa scena' });

				const titleWrap = contentEl.createDiv({ cls: 'firefly-modal-field' });
				titleWrap.createEl('label', { text: 'Tytuł sceny' });
				const titleInput = titleWrap.createEl('input', {
					type: 'text',
					placeholder: 'np. Tajne spotkanie w archiwum',
					cls: 'firefly-modal-input',
				});
				titleInput.focus();

				const actWrap = contentEl.createDiv({ cls: 'firefly-modal-field' });
				actWrap.createEl('label', { text: 'Akt' });
				const actInput = actWrap.createEl('input', {
					type: 'number',
					value: '1',
					cls: 'firefly-modal-input firefly-modal-input-sm',
				});

				const seqWrap = contentEl.createDiv({ cls: 'firefly-modal-field' });
				seqWrap.createEl('label', { text: 'Sekwencja' });
				const seqInput = seqWrap.createEl('input', {
					type: 'number',
					value: String(nextSeq),
					cls: 'firefly-modal-input firefly-modal-input-sm',
				});

				const subplotsWrap = contentEl.createDiv({ cls: 'firefly-modal-field' });
				subplotsWrap.createEl('label', { text: 'Subploty (oddzielone przecinkami)' });
				const subplotsInput = subplotsWrap.createEl('input', {
					type: 'text',
					placeholder: allSubplots.slice(0, 3).join(', ') || 'np. Bractwo, Śledztwo',
					cls: 'firefly-modal-input',
				});

				const btnRow = contentEl.createDiv({ cls: 'firefly-modal-btn-row' });
				const cancelBtn = btnRow.createEl('button', { text: 'Anuluj', cls: 'firefly-modal-btn' });
				cancelBtn.addEventListener('click', () => this.close());

				const createBtn = btnRow.createEl('button', {
					text: 'Utwórz',
					cls: 'firefly-modal-btn firefly-modal-btn-primary',
				});

				createBtn.addEventListener('click', async () => {
					const title = titleInput.value.trim();
					if (!title) {
						titleInput.addClass('firefly-input-error');
						return;
					}

					const project = plugin.projectManager.getActiveProject();
					if (!project?.rootFolder) {
						new Notice('Wybierz najpierw projekt z ustawionym folderem.');
						return;
					}

					const subplotsVal = subplotsInput.value
						.split(',')
						.map(s => s.trim())
						.filter(Boolean);

					const safeFileName = title.replace(/[/\\?%*:|"<>]/g, '-');
					const root = project.rootFolder.replace(/\\/g, '/').replace(/\/$/, '');
					const filePath = `${root}/${safeFileName}.md`;

					const frontmatter = [
						'---',
						'type: scene',
						`title: "${title.replace(/"/g, '\\"')}"`,
						`act: ${parseInt(actInput.value) || 1}`,
						`sequence: ${parseInt(seqInput.value) || nextSeq}`,
						'status: idea',
					];

					if (subplotsVal.length > 0) {
						frontmatter.push('subplots:');
						for (const sp of subplotsVal) {
							frontmatter.push(`  - "${sp.replace(/"/g, '\\"')}"`);
						}
					}

					frontmatter.push('---', '', '');

					try {
						const file = await plugin.app.vault.create(filePath, frontmatter.join('\n'));
						new Notice(`Utworzono scenę: ${title}`);
						this.close();
						refreshCallback();
						await plugin.app.workspace.openLinkText(file.path, '', false);
					} catch (e: any) {
						new Notice(`Błąd podczas tworzenia sceny: ${e.message || e}`);
					}
				});

				titleInput.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') createBtn.click();
				});
			}

			onClose() {
				this.contentEl.empty();
			}
		}

		new CreateSceneModal(this.plugin.app).open();
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	private parseNum(val: number | string | undefined, fallback: number): number {
		if (val === undefined || val === null) return fallback;
		if (typeof val === 'number') return val;
		const n = parseFloat(String(val));
		return isNaN(n) ? fallback : n;
	}
}
