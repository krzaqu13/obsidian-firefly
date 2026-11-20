import { setIcon, TFile, Menu, Notice } from 'obsidian';
import type FireflyPlugin from '../../main';
import { SceneReader } from '../../services/SceneReader';
import { getStatusCfg, STATUS_ORDER } from '../../models/Scene';
import type { Scene } from '../../models/Scene';
import { SceneDetails } from './SceneDetails';

type TimelineOrder = 'reading' | 'chronological';
type SwimlaneGroupBy = 'pov' | 'character' | 'location' | 'tag';

/**
 * TimelineView — oś czasu scen w Firefly.
 * Kontrolki renderowane są w firefly-topbar przez WritingArea.buildTimelineControls().
 * Należy do: src/areas/writing/
 */
export class TimelineView {
	private plugin: FireflyPlugin;
	private container: HTMLElement;
	private reader: SceneReader;
	private inspector: SceneDetails | null = null;
	private selectedScenePath: string | null = null;

	// Stan kontrolowany przez topbar
	zoomLevel = 1;
	swimlaneMode = false;
	swimlaneGroupBy: SwimlaneGroupBy = 'pov';
	timelineOrder: TimelineOrder = 'reading';

	private rootEl: HTMLElement | null = null;
	private _pendingRefresh: number | null = null;

	constructor(plugin: FireflyPlugin, container: HTMLElement) {
		this.plugin = plugin;
		this.container = container;
		this.reader = new SceneReader(plugin.app);
	}

	render(): void {
		this.container.empty();
		this.rootEl = this.container;

		const project = this.plugin.projectManager.getActiveProject();
		if (!project) {
			this.renderPlaceholder('book-open', 'Brak projektu', 'Wybierz projekt aby zobaczyć oś czasu.');
			return;
		}
		if (!project.rootFolder) {
			this.renderPlaceholder('folder-open', 'Brak folderu projektu', 'Ustaw folder projektu w ustawieniach.');
			return;
		}

		this.renderView();
	}

	rerender(): void {
		const prevSelected = this.selectedScenePath;
		this.render();
		if (prevSelected) {
			this.selectedScenePath = prevSelected;
			const scene = this.reader.getSceneByPath(this.plugin, prevSelected);
			if (scene && this.inspector) {
				this.inspector.show(scene);
				this.updateCardSelection();
			}
		}
	}

	// ── Render główny ───────────────────────────────────────────

	private renderView(): void {
		this.container.empty();

		const layoutContainer = this.container.createDiv('firefly-timeline-layout');
		const mainArea = layoutContainer.createDiv('firefly-timeline-main-area');
		const inspectorPanel = layoutContainer.createDiv('firefly-inspector-panel');
		inspectorPanel.setCssStyles({ display: 'none' });

		this.inspector = new SceneDetails(inspectorPanel, this.plugin, {
			onEdit: (scene) => void this.openScene(scene),
			onDelete: async (scene) => {
				await this.reader.deleteScene(scene.filePath);
				this.selectedScenePath = null;
				this.refresh();
			},
			onRefresh: () => this.refresh(),
			onStatusChange: async (scene, status) => {
				await this.reader.updateScene(scene.filePath, { status });
				this.refresh();
			},
			onClose: () => {
				this.selectedScenePath = null;
				this.updateCardSelection();
			},
		});

		if (this.swimlaneMode) {
			this.renderSwimlaneTimeline(mainArea);
		} else {
			this.renderLinearTimeline(mainArea);
		}

		if (this.selectedScenePath) {
			const activeScene = this.reader.getSceneByPath(this.plugin, this.selectedScenePath);
			if (activeScene) {
				this.inspector.show(activeScene);
				this.updateCardSelection();
			}
		}
	}

	private updateCardSelection(): void {
		const cards = this.container.querySelectorAll('.firefly-timeline-card');
		cards.forEach((el) => {
			const cardEl = el as HTMLElement;
			if (cardEl.dataset.path === this.selectedScenePath) {
				cardEl.addClass('is-selected');
			} else {
				cardEl.removeClass('is-selected');
			}
		});
	}

	// ── Widok liniowy ───────────────────────────────────────────

	private renderLinearTimeline(mainArea: HTMLElement): void {
		const scenes = this.getSortedScenes();

		if (scenes.length === 0) {
			const emptyEl = mainArea.createDiv('firefly-timeline-empty');
			setIcon(emptyEl.createDiv({ cls: 'firefly-timeline-empty-icon' }), 'clock');
			emptyEl.createEl('h3', { text: 'Brak scen' });
			emptyEl.createEl('p', { text: 'Utwórz sceny z frontmatter type: scene lub Class: Scene w folderze projektu.' });
			return;
		}

		const track = mainArea.createDiv('firefly-timeline-track');

		let lastAct: string | undefined = undefined;
		for (const scene of scenes) {
			const actKey = scene.act !== undefined ? String(scene.act) : undefined;

			if (actKey !== lastAct) {
				const divider = track.createDiv('firefly-timeline-act-divider');
				const label = actKey !== undefined ? `Akt ${actKey}` : 'Bez aktu';
				divider.createSpan({ cls: 'firefly-timeline-act-label', text: label });
				lastAct = actKey;
			}

			this.renderTimelineEntry(track, scene);
		}
	}

	private renderTimelineEntry(track: HTMLElement, scene: Scene): void {
		const entry = track.createDiv('firefly-timeline-entry');
		entry.dataset.path = scene.filePath;

		// Lewa kolumna: sekwencja
		const seqCol = entry.createDiv('firefly-timeline-seq-col');
		const act = scene.act !== undefined ? String(scene.act).padStart(2, '0') : '??';
		const seq = scene.sequence !== undefined ? String(scene.sequence).padStart(2, '0') : (scene.id ? String(scene.id) : '??');
		seqCol.createSpan({ cls: 'firefly-timeline-seq-badge', text: `${act}-${seq}` });

		const displayDate = scene.when ?? scene.date ?? scene.storyDate;
		if (displayDate) {
			seqCol.createSpan({ cls: 'firefly-timeline-date-badge', text: String(displayDate) });
		}
		const storyTime = scene.storyTime;
		if (storyTime) {
			seqCol.createSpan({ cls: 'firefly-timeline-time-badge', text: String(storyTime) });
		}

		// Środek: punkt + linia
		const dotCol = entry.createDiv('firefly-timeline-dot-col');
		const dot = dotCol.createDiv('firefly-timeline-dot');
		dot.setAttribute('data-status', scene.status || 'idea');
		const statusCfg = getStatusCfg(scene.status);
		dot.style.setProperty('--dot-color', statusCfg.color);

		// Prawa kolumna: karta
		const cardCol = entry.createDiv('firefly-timeline-card-col');
		const card = cardCol.createDiv('firefly-timeline-card');
		card.dataset.path = scene.filePath;
		card.setCssStyles({ transform: `scale(${this.zoomLevel})`, transformOrigin: 'left center' });

		if (this.selectedScenePath === scene.filePath) {
			card.addClass('is-selected');
		}

		card.createDiv({ cls: 'firefly-timeline-card-title', text: scene.title || 'Bez tytułu' });

		const meta = card.createDiv('firefly-timeline-card-meta');
		if (scene.pov) {
			meta.createSpan({ cls: 'firefly-timeline-card-pov', text: `POV: ${scene.pov}` });
		}
		if (scene.location) {
			const locSpan = meta.createSpan({ cls: 'firefly-timeline-card-location' });
			setIcon(locSpan, 'map-pin');
			locSpan.appendText(' ' + scene.location);
		}
		if (scene.emotion) {
			const emoSpan = meta.createSpan({ cls: 'firefly-timeline-card-emotion' });
			setIcon(emoSpan, 'smile');
			emoSpan.appendText(' ' + scene.emotion);
		}

		// Excerpt: conflict, shift, synopsis lub summary
		const excerpt = scene.conflict ?? scene.shift ?? scene.synopsis ?? scene.summary;
		if (excerpt) {
			card.createDiv({
				cls: 'firefly-timeline-card-excerpt',
				text: excerpt.length > 120 ? excerpt.substring(0, 120) + '…' : excerpt,
			});
		}

		// Stopka: status raw + słowa
		const footer = card.createDiv('firefly-timeline-card-footer');
		const rawStatus = scene.status || 'idea';
		const statusBadge = footer.createSpan({ cls: 'firefly-timeline-card-status', text: rawStatus });
		statusBadge.style.color = statusCfg.color;

		if (scene.wordcount) {
			footer.createSpan({ cls: 'firefly-timeline-card-wc', text: `${scene.wordcount} słów` });
		}

		if (scene.characters?.length) {
			const chars = card.createDiv('firefly-timeline-card-chars');
			scene.characters.forEach(c => {
				chars.createSpan({ cls: 'firefly-timeline-char-tag', text: c });
			});
		}

		// Pojedyncze kliknięcie → pokazuje szczegóły w inspectorze
		card.addEventListener('click', (e) => {
			e.stopPropagation();
			this.selectedScenePath = scene.filePath;
			this.updateCardSelection();
			this.inspector?.show(scene);
		});

		// Podwójne kliknięcie → otwiera plik w nowej karcie
		card.addEventListener('dblclick', (e) => {
			e.stopPropagation();
			void this.openScene(scene);
		});

		card.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.showContextMenu(scene, e);
		});
	}

	// ── Swimlane ─────────────────────────────────────────────────

	private renderSwimlaneTimeline(mainArea: HTMLElement): void {
		const scenes = this.getSortedScenes();

		if (scenes.length === 0) {
			const emptyEl = mainArea.createDiv('firefly-timeline-empty');
			setIcon(emptyEl.createDiv({ cls: 'firefly-timeline-empty-icon' }), 'clock');
			emptyEl.createEl('h3', { text: 'Brak scen' });
			return;
		}

		const laneSet = new Set<string>();
		for (const s of scenes) {
			for (const lane of this.getSceneLaneKeys(s)) {
				laneSet.add(lane);
			}
		}
		const lanes = Array.from(laneSet).sort();

		const swimlaneEl = mainArea.createDiv('firefly-timeline-swimlane');
		const headerRow = swimlaneEl.createDiv('firefly-timeline-swimlane-header');
		headerRow.createDiv({ cls: 'firefly-timeline-lane-label-header', text: 'Pasmo' });

		const sceneCols = headerRow.createDiv('firefly-timeline-swimlane-scene-cols');
		scenes.forEach((s) => {
			const colHeader = sceneCols.createDiv('firefly-timeline-swimlane-scene-col');
			const act = s.act !== undefined ? String(s.act).padStart(2, '0') : '??';
			const seq = s.sequence !== undefined ? String(s.sequence).padStart(2, '0') : '??';
			colHeader.createSpan({ cls: 'firefly-timeline-seq-badge', text: `${act}-${seq}` });
			colHeader.createDiv({ cls: 'firefly-timeline-col-title', text: s.title || 'Bez tytułu' });
		});

		for (const lane of lanes) {
			const row = swimlaneEl.createDiv('firefly-timeline-swimlane-row');
			const label = row.createDiv('firefly-timeline-lane-label');
			label.createSpan({ text: lane });

			const cells = row.createDiv('firefly-timeline-lane-cells');
			for (const scene of scenes) {
				const cell = cells.createDiv('firefly-timeline-lane-cell');
				const sceneLanes = this.getSceneLaneKeys(scene);
				if (sceneLanes.includes(lane)) {
					this.renderSwimlaneCard(cell, scene);
				}
			}
		}
	}

	private renderSwimlaneCard(cell: HTMLElement, scene: Scene): void {
		const statusCfg = getStatusCfg(scene.status);

		const dot = cell.createDiv('firefly-timeline-dot');
		dot.setAttribute('data-status', scene.status || 'idea');
		dot.style.setProperty('--dot-color', statusCfg.color);

		const card = cell.createDiv('firefly-timeline-card firefly-timeline-swimlane-card');
		card.setCssStyles({ transform: `scale(${this.zoomLevel})`, transformOrigin: 'left top' });
		card.dataset.path = scene.filePath;

		if (this.selectedScenePath === scene.filePath) {
			card.addClass('is-selected');
		}

		card.createDiv({ cls: 'firefly-timeline-card-title', text: scene.title || 'Bez tytułu' });

		const meta = card.createDiv('firefly-timeline-card-meta');
		if (this.swimlaneGroupBy !== 'pov' && scene.pov) {
			meta.createSpan({ cls: 'firefly-timeline-card-pov', text: `POV: ${scene.pov}` });
		}
		if (this.swimlaneGroupBy !== 'location' && scene.location) {
			const locSpan = meta.createSpan({ cls: 'firefly-timeline-card-location' });
			setIcon(locSpan, 'map-pin');
			locSpan.appendText(' ' + scene.location);
		}

		const footer = card.createDiv('firefly-timeline-card-footer');
		const rawStatus = scene.status || 'idea';
		const statusBadge = footer.createSpan({ cls: 'firefly-timeline-card-status', text: rawStatus });
		statusBadge.style.color = statusCfg.color;

		// Pojedyncze kliknięcie → pokazuje szczegóły w inspectorze
		card.addEventListener('click', (e) => {
			e.stopPropagation();
			this.selectedScenePath = scene.filePath;
			this.updateCardSelection();
			this.inspector?.show(scene);
		});

		// Podwójne kliknięcie → otwiera plik
		card.addEventListener('dblclick', (e) => {
			e.stopPropagation();
			void this.openScene(scene);
		});

		card.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.showContextMenu(scene, e);
		});
	}

	// ── Pomocnicze ───────────────────────────────────────────────

	private getSortedScenes(): Scene[] {
		const scenes = this.reader.getAllScenes(this.plugin);
		if (this.timelineOrder === 'chronological') {
			return [...scenes].sort((a, b) => {
				if (a.when && b.when) {
					const diff = a.when.localeCompare(b.when);
					if (diff !== 0) return diff;
				} else if (a.when) {
					return -1;
				} else if (b.when) {
					return 1;
				}
				const na = this.reader.normalizeAct(a.act);
				const nb = this.reader.normalizeAct(b.act);
				if (na !== nb) return na - nb;
				return (a.sequence ?? 999) - (b.sequence ?? 999);
			});
		}
		return scenes;
	}

	private getSceneLaneKeys(scene: Scene): string[] {
		switch (this.swimlaneGroupBy) {
			case 'pov':
				return [scene.pov || '(bez POV)'];
			case 'character':
				return scene.characters?.length
					? scene.characters.map(c => c.trim()).filter(Boolean)
					: ['(bez postaci)'];
			case 'location':
				return [scene.location || '(bez lokacji)'];
			case 'tag':
				return scene.tags?.length
					? scene.tags.map(t => t.trim()).filter(Boolean)
					: ['(bez tagu)'];
			default:
				return ['(brak)'];
		}
	}

	private async openScene(scene: Scene): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(scene.filePath);
		if (file instanceof TFile) {
			// Otwiera w nowej karcie (tab)
			const leaf = this.plugin.app.workspace.getLeaf('tab');
			await leaf.openFile(file, { state: { mode: 'source', source: false } });
		} else {
			new Notice(`Nie znaleziono pliku: ${scene.filePath}`);
		}
	}

	private showContextMenu(scene: Scene, event: MouseEvent): void {
		const menu = new Menu();

		menu.addItem(item =>
			item.setTitle('Otwórz scenę').setIcon('pencil')
				.onClick(() => void this.openScene(scene))
		);

		menu.addSeparator();

		for (const status of STATUS_ORDER) {
			const cfg = getStatusCfg(status);
			menu.addItem(item =>
				item.setTitle(`Status: ${cfg.label} (${status})`)
					.setChecked(scene.status?.toLowerCase() === status.toLowerCase())
					.onClick(async () => {
						const file = this.plugin.app.vault.getAbstractFileByPath(scene.filePath);
						if (file instanceof TFile) {
							await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
								if ('Status' in fm) {
									fm['Status'] = status.charAt(0).toUpperCase() + status.slice(1);
								} else {
									fm['status'] = status;
								}
							});
							this.refresh();
						}
					})
			);
		}

		menu.showAtMouseEvent(event);
	}

	private renderPlaceholder(icon: string, title: string, subtitle: string): void {
		const ph = this.container.createDiv('firefly-placeholder');
		setIcon(ph.createDiv({ cls: 'firefly-placeholder-icon' }), icon);
		ph.createEl('h2', { cls: 'firefly-placeholder-title', text: title });
		ph.createEl('p', { cls: 'firefly-placeholder-subtitle', text: subtitle });
	}

	refresh(): void {
		if (this._pendingRefresh) cancelAnimationFrame(this._pendingRefresh);
		this._pendingRefresh = window.requestAnimationFrame(() => {
			this._pendingRefresh = null;
			const scrollEl = this.container.querySelector('.firefly-timeline-main-area') as HTMLElement | null;
			const savedScroll = scrollEl ? { top: scrollEl.scrollTop, left: scrollEl.scrollLeft } : null;
			this.render();
			if (savedScroll) {
				const restore = () => {
					const el = this.container.querySelector('.firefly-timeline-main-area') as HTMLElement | null;
					if (el) { el.scrollTop = savedScroll.top; el.scrollLeft = savedScroll.left; }
				};
				restore();
				window.requestAnimationFrame(restore);
				window.setTimeout(restore, 50);
			}
		});
	}
}
