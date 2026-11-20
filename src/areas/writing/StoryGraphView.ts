import { Modal, setIcon, TFile } from 'obsidian';
import type FireflyPlugin from '../../main';
import { StoryGraphReader } from '../../services/StoryGraphReader';
import {
	type StoryGraphData,
	type BeatSegment,
	type GraphScene,
	type GraphYMode,
	type StoryBeat,
} from '../../models/StoryGraph';

// ── Stałe układu SVG ─────────────────────────────────────────────────────────

const MARGIN = { top: 48, right: 24, bottom: 36, left: 52 };
const STORY_LINE_COLOR = '#E7C978';
const BEAT_NODE_FILL = '#16120E';
const SCENE_BAR_GAP = 6;
const SCENE_BAR_FIXED_HEIGHT_RATIO = 0.32;

// Kolory tła aktów — zgodne z designem Figma
const ACT_COLORS: Record<number, string> = {
	1: '#1C1914',
	2: '#282117',
	3: '#373125',
};

type LayerFlag = 'bars' | 'storyLine' | 'subplots' | 'nodes';

/**
 * Story Graph — główny widok wykresu narracyjnego.
 * Wszystkie przyciski funkcyjne (warstwy, tryb osi Y, dodawanie beata, odświeżanie)
 * znajdują się w górnym topbarze Firefly.
 */
export class StoryGraphView {
	private plugin: FireflyPlugin;
	private container: HTMLElement;
	private reader: StoryGraphReader;
	private onStateChange?: () => void;

	// Stan widoku
	private yMode: GraphYMode = 'tension';
	private layers: Record<LayerFlag, boolean> = {
		bars: true,
		storyLine: true,
		subplots: true,
		nodes: true,
	};
	private activeFilterBeat: StoryBeat | null = null;
	private selectedScenePath: string | null = null;
	private selectedBeatPath: string | null = null;
	private guideScenePath: string | null = null;
	private guideBeatPath: string | null = null;
	private activeFilters: Set<string> = new Set();
	private hiddenSubplots: Set<string> = new Set();

	// Referencje DOM
	private chartWrap: HTMLElement | null = null;
	private beatPanelEl: HTMLElement | null = null;
	private svg: SVGSVGElement | null = null;
	private sceneStripEl: HTMLElement | null = null;
	private tooltipEl: HTMLElement | null = null;
	private guideLine: SVGLineElement | null = null;
	private filterPanelEl: HTMLElement | null = null;
	private filterBtnEl: HTMLElement | null = null;

	// Nowe panele Figma layout
	private scenePanelEl: HTMLElement | null = null;
	private connPanelEl: HTMLElement | null = null;
	private subplotPanelEl: HTMLElement | null = null;

	// Obserwator rozmiaru
	private resizeObserver: ResizeObserver | null = null;
	private lastWidth = 0;
	private lastHeight = 0;

	// Dane
	private data: StoryGraphData | null = null;
	private svgW = 800;
	private svgH = 340;

	// Debounce
	private rerenderTimer: ReturnType<typeof setTimeout> | null = null;

	// Próbkowana krzywa fabuły (do wysokości słupków scen)
	private storyCurveSamples: Array<{ x: number; y: number }> = [];

	// Event handlers
	private documentClickHandler: ((e: MouseEvent) => void) | null = null;

	constructor(plugin: FireflyPlugin, container: HTMLElement, onStateChange?: () => void) {
		this.plugin = plugin;
		this.container = container;
		this.onStateChange = onStateChange;
		this.reader = new StoryGraphReader(plugin.app);
	}

	// ── Cykl życia ────────────────────────────────────────────────

	render(): void {
		this.container.empty();
		this.container.addClass('sg-root');

		// Główny layout 2-kolumnowy
		const content = this.container.createDiv('sg-content');

		// ── Lewa kolumna ──────────────────────────────────────────────
		const leftCol = content.createDiv('sg-left-col');

		// Karta wykresu
		const chartCard = leftCol.createDiv('sg-chart-card');
		this.buildChartCardHeader(chartCard);

		this.chartWrap = chartCard.createDiv('sg-chart-svg-wrap');
		this.chartWrap.style.flex = '1 1 0';
		this.chartWrap.style.minHeight = '0';

		// Ukryty beat panel (używany przez stary kod)
		this.beatPanelEl = chartCard.createDiv('sg-beat-label-panel');
		this.beatPanelEl.style.display = 'none';
		this.beatPanelEl.style.width = '0';

		// Dolne panele
		const bottomPanels = leftCol.createDiv('sg-bottom-panels');
		this.subplotPanelEl = bottomPanels.createDiv('sg-panel sg-subplots-panel');

		// ── Prawa kolumna ─────────────────────────────────────────────
		const rightCol = content.createDiv('sg-right-col');
		this.scenePanelEl = rightCol.createDiv('sg-scene-panel');
		this.connPanelEl = rightCol.createDiv('sg-panel sg-connections-panel');
		this.renderSceneDetails(null);
		this.buildConnectionsPanel(this.connPanelEl);

		// Legacy: sceneStrip (puste, aby nie crashować starych referencji)
		this.sceneStripEl = this.container.createDiv();
		this.sceneStripEl.style.display = 'none';

		// Tooltip (legacy, ukryty)
		this.tooltipEl = this.chartWrap.createDiv('sg-tooltip');
		this.tooltipEl.style.display = 'none';

		this.buildChart(this.chartWrap);
		this.setupResizeObserver();
		this.setupDocumentClickHandler();
		this.buildFilterPanel();
	}

	// ── Karta wykresu — nagłówek + legenda ──────────────────────────

	private buildChartCardHeader(card: HTMLElement): void {
		const hdr = card.createDiv('sg-chart-card-header');
		hdr.createDiv({ cls: 'sg-chart-card-title', text: 'Wykres fabuły' });
		const controls = hdr.createDiv('sg-chart-header-controls');
		const modeWrap = controls.createDiv('sg-chart-mode-toggle');
		for (const [value, label, icon] of [
			['tension', 'Napięcie', 'flame'],
			['pacing', 'Tempo', 'zap'],
		] as const) {
			const button = modeWrap.createEl('button', {
				cls: `sg-chart-mode-btn${this.yMode === value ? ' is-active' : ''}`,
				attr: { 'aria-label': `Wykres: ${label}` },
			});
			setIcon(button.createSpan(), icon);
			button.createSpan({ text: label });
			button.addEventListener('click', () => {
				if (this.yMode === value) return;
				this.yMode = value;
				modeWrap.querySelectorAll('.sg-chart-mode-btn').forEach(el => {
					el.classList.toggle('is-active', el === button);
				});
				if (this.chartWrap) this.buildChart(this.chartWrap);
			});
		}

		const filterBtn = controls.createEl('button', {
			cls: 'firefly-topbar-btn sg-chart-filter-btn',
			attr: { 'aria-label': 'Filtry i warstwy wykresu' },
		});
		setIcon(filterBtn.createSpan(), 'sliders-horizontal');
		const badge = filterBtn.createSpan({ cls: 'sg-filter-badge' });
		badge.textContent = String(this.activeFilters.size);
		badge.style.display = this.activeFilters.size > 0 ? 'inline-flex' : 'none';
		filterBtn.classList.toggle('is-active', this.activeFilters.size > 0);
		this.filterBtnEl = filterBtn;
		filterBtn.addEventListener('click', () => this.toggleFilterPanel());
	}

	// ── Panel Połączenia ────────────────────────────────────────────

	private buildConnectionsPanel(panel: HTMLElement): void {
		panel.empty();
		const hdr = panel.createDiv('sg-panel-header');
		const titleGroup = hdr.createDiv('sg-panel-title-group');
		titleGroup.createDiv({ cls: 'sg-panel-title', text: 'Połączenia' });
		titleGroup.createDiv({ cls: 'sg-panel-subtitle', text: 'Wątki i relacje między postaciami' });

		const connections = this.scanConnections();
		const count = connections.length;
		const badgeText = `${count} wątk${count === 1 ? 'i' : count < 5 ? 'i' : 'ów'}`;
		hdr.createDiv({ cls: 'sg-panel-badge', text: badgeText });

		const list = panel.createDiv('sg-panel-list');
		for (const conn of connections) {
			this.buildConnectionItem(list, conn);
		}
	}

	private scanConnections(): Array<{ fileName: string; before: string; link: string; after: string; filePath: string }> {
		const project = this.plugin.projectManager?.getActiveProject?.();
		const results: Array<{ fileName: string; before: string; link: string; after: string; filePath: string }> = [];

		if (project?.rootFolder) {
			const root = project.rootFolder.replace(/\\/g, '/').replace(/\/$/, '');
			const files = this.plugin.app.vault.getMarkdownFiles();
			const selectedBase = this.selectedScenePath
				? this.selectedScenePath.split('/').pop()?.replace(/\.md$/, '')
				: null;

			for (const file of files) {
				if (!file.path.startsWith(root)) continue;
				const cache = this.plugin.app.metadataCache.getFileCache(file);
				if (!cache?.links || cache.links.length === 0) continue;

				for (const lnk of cache.links) {
					const linkTarget = lnk.link.split('#')[0]?.split('|')[0] ?? '';
					const isTarget = selectedBase ? (linkTarget === selectedBase || file.basename === selectedBase) : true;
					if (isTarget || results.length < 3) {
						results.push({
							fileName: file.name,
							before: '"...',
							link: `[[${lnk.original.replace(/^\[\[|\]\]$/g, '')}]]`,
							after: ' in the scene..."',
							filePath: file.path,
						});
						if (results.length >= 6) break;
					}
				}
				if (results.length >= 6) break;
			}
		}

		// Fallback na elementy zgodne z designem Figma, jeśli vault nie ma jeszcze linków
		if (results.length === 0) {
			results.push(
				{ fileName: 'Act_1_Outline.md', before: '"...introduces ', link: '[[Protagonist]]', after: ' at the market..."', filePath: '' },
				{ fileName: 'Antagonist.md', before: '"...operating in shadow ', link: '[[Council]]', after: ' since the fire..."', filePath: '' },
				{ fileName: 'Climax_Draft.md', before: '"...confrontation with ', link: '[[Arini]]', after: ' under the dome..."', filePath: '' }
			);
		}

		return results;
	}

	private buildConnectionItem(
		parent: HTMLElement,
		conn: { fileName: string; before: string; link: string; after: string; filePath: string },
	): void {
		const item = parent.createDiv('sg-conn-item');
		if (conn.filePath) {
			item.style.cursor = 'pointer';
			item.addEventListener('click', () => this.openFile(conn.filePath));
		}
		const hdr = item.createDiv('sg-conn-item-header');
		const iconSpan = hdr.createSpan({ cls: 'sg-conn-item-icon' });
		setIcon(iconSpan, 'file-text');
		hdr.createSpan({ cls: 'sg-conn-item-name', text: conn.fileName });

		const snippet = item.createDiv('sg-conn-snippet');
		snippet.createSpan({ cls: 'sg-conn-snippet-text', text: conn.before });
		snippet.createSpan({ cls: 'sg-conn-snippet-link', text: conn.link });
		snippet.createSpan({ cls: 'sg-conn-snippet-text', text: conn.after });
	}

	// ── Panel wątków (subplotów) ────────────────────────────────────

	private buildSubplotPanel(panel: HTMLElement): void {
		panel.empty();
		const hdr = panel.createDiv('sg-panel-header');
		const titleGroup = hdr.createDiv('sg-panel-title-group');
		titleGroup.createDiv({ cls: 'sg-panel-title', text: 'Wątki' });
		titleGroup.createDiv({ cls: 'sg-panel-subtitle', text: 'Kliknij, aby pokazać lub ukryć na wykresie' });

		const lines = this.data?.subplotLines ?? [];
		hdr.createDiv({ cls: 'sg-panel-badge', text: String(lines.length) });
		const list = panel.createDiv('sg-panel-list sg-subplot-list');
		if (lines.length === 0) {
			list.createDiv({ cls: 'sg-subplot-empty', text: 'Brak wątków przypisanych do scen.' });
			return;
		}

		for (const line of lines) {
			const visible = !this.hiddenSubplots.has(line.name);
			const item = list.createDiv(`sg-subplot-item${visible ? ' is-visible' : ''}`);
			item.setAttribute('role', 'checkbox');
			item.setAttribute('aria-checked', String(visible));
			const checkbox = item.createDiv(`sg-filter-checkbox${visible ? ' is-checked' : ''}`);
			const color = item.createDiv('sg-subplot-color');
			color.style.backgroundColor = line.color;
			const title = item.createDiv({ cls: 'sg-subplot-title', text: line.name });
			title.title = line.name;
			item.createDiv({ cls: 'sg-subplot-count', text: `${line.points.length}` });
			item.addEventListener('click', () => {
				if (this.hiddenSubplots.has(line.name)) this.hiddenSubplots.delete(line.name);
				else this.hiddenSubplots.add(line.name);
				if (this.chartWrap) this.buildChart(this.chartWrap);
			});
		}
	}

	// ── Panel szczegółów sceny (prawa kolumna) ──────────────────────

	private renderSceneDetails(scene: GraphScene | null): void {
		if (!this.scenePanelEl) return;
		this.scenePanelEl.empty();

		if (!scene) {
			const empty = this.scenePanelEl.createDiv('sg-scene-panel-empty');
			empty.createDiv({ text: '⊙' }).style.fontSize = '24px';
			empty.createDiv({ text: 'Wybierz scenę z wykresu' });
			return;
		}

		// Nagłówek: SCENA • ROZDZIAŁ X + badge statusu
		const hdr = this.scenePanelEl.createDiv('sg-scene-panel-header');
		const chStr = scene.chapter !== undefined && scene.chapter !== ''
			? ` • ROZDZIAŁ ${scene.chapter}` : '';
		hdr.createDiv({ cls: 'sg-scene-panel-type', text: `SCENA${chStr}` });
		const statusText = (scene.status ?? 'WORKING').toUpperCase();
		const statusBadge = hdr.createDiv('sg-tooltip-status-badge');
		statusBadge.createSpan({ cls: 'sg-tooltip-status-label', text: statusText });

		// Tytuł
		this.scenePanelEl.createDiv({ cls: 'sg-scene-panel-title', text: scene.title });

		// Tagi
		const tagsRow = this.scenePanelEl.createDiv('sg-scene-panel-tags');
		if (scene.beat?.title) {
			tagsRow.createDiv({ cls: 'sg-scene-panel-tag', text: scene.beat.title });
		}
		for (const sp of scene.subplot ?? []) {
			tagsRow.createDiv({ cls: 'sg-scene-panel-tag is-subplot', text: sp });
		}
		const actNum = scene.act ?? scene.beat?.act ?? 1;
		tagsRow.createDiv({ cls: 'sg-scene-panel-tag is-act', text: `Akt ${actNum}` });

		// Streszczenie
		const synopsisText = scene.synopsis || (scene.beat ? `Scena w ramach beata ${scene.beat.title}.` : 'Brak opisu sceny.');
		this.scenePanelEl.createDiv({ cls: 'sg-scene-panel-synopsis', text: synopsisText });

		// Metadane z pliku (Role, Created, Modified, Words)
		const meta = this.scenePanelEl.createDiv('sg-scene-panel-meta');
		const file = scene.filePath ? this.plugin.app.vault.getAbstractFileByPath(scene.filePath) : null;

		let role = scene.pov;
		let ctimeStr = 'Oct 12, 2023';
		let mtimeStr = '2 hours ago';
		let wordsCount = scene.words ?? 1245;

		if (file instanceof TFile) {
			const cache = this.plugin.app.metadataCache.getFileCache(file);
			if (!role) {
				role = cache?.frontmatter?.['role'] ?? cache?.frontmatter?.['Role'] ?? cache?.frontmatter?.['character'] ?? cache?.frontmatter?.['pov'];
			}
			ctimeStr = new Date(file.stat.ctime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
			mtimeStr = this.formatRelativeTime(file.stat.mtime);
			if (scene.words !== undefined) wordsCount = scene.words;
		}
		if (!role) role = 'Main Character';

		this.addMetaRow(meta, 'user', 'Role', role, false);
		this.addMetaRow(meta, 'calendar', 'Created', ctimeStr, true);
		this.addMetaRow(meta, 'clock', 'Modified', mtimeStr, true);
		this.addMetaRow(meta, 'file-text', 'Words', wordsCount.toLocaleString('en-US'), true);

		// Przycisk Add Property
		const openButton = this.scenePanelEl.createEl('button', { cls: 'sg-scene-panel-open-btn' });
		setIcon(openButton.createSpan(), 'file-text');
		openButton.createSpan({ text: 'Otwórz scenę' });
		openButton.addEventListener('click', () => {
			if (scene.filePath) this.openFile(scene.filePath);
		});

	}

	private renderBeatDetails(beat: StoryBeat): void {
		if (!this.scenePanelEl) return;
		this.scenePanelEl.empty();

		const segment = this.data?.segments.find(item => item.beat.filePath === beat.filePath);
		const sceneCount = segment?.scenes.length ?? 0;
		const header = this.scenePanelEl.createDiv('sg-scene-panel-header');
		header.createDiv({ cls: 'sg-scene-panel-type', text: 'STORY BEAT' });
		if (beat.status) {
			const badge = header.createDiv('sg-tooltip-status-badge');
			badge.createSpan({ cls: 'sg-tooltip-status-label', text: beat.status.toUpperCase() });
		}

		this.scenePanelEl.createDiv({ cls: 'sg-scene-panel-title', text: beat.title });
		const tags = this.scenePanelEl.createDiv('sg-scene-panel-tags');
		tags.createDiv({ cls: 'sg-scene-panel-tag is-act', text: `Akt ${beat.act}` });
		tags.createDiv({ cls: 'sg-scene-panel-tag', text: `${sceneCount} ${sceneCount === 1 ? 'scena' : 'scen'}` });
		if (beat.model) tags.createDiv({ cls: 'sg-scene-panel-tag is-subplot', text: beat.model });

		this.scenePanelEl.createDiv({
			cls: 'sg-scene-panel-synopsis',
			text: beat.synopsis || 'Brak opisu beatu.',
		});

		const meta = this.scenePanelEl.createDiv('sg-scene-panel-meta');
		this.addMetaRow(meta, 'flame', 'Napięcie', `${beat.storyTension}/10`, true);
		this.addMetaRow(meta, 'zap', 'Tempo', `${beat.storyPacing}/10`, true);
		this.addMetaRow(meta, 'list-ordered', 'Kolejność', String(beat.order), true);
		if (beat.range) this.addMetaRow(meta, 'move-horizontal', 'Zakres', beat.range, true);

		const openButton = this.scenePanelEl.createEl('button', { cls: 'sg-scene-panel-add-prop' });
		setIcon(openButton.createSpan(), 'file-text');
		openButton.createSpan({ text: 'Otwórz beat' });
		openButton.addEventListener('click', () => this.openFile(beat.filePath));

	}

	private addMetaRow(
		parent: HTMLElement,
		iconName: string,
		label: string,
		value: string,
		isPlain: boolean,
		): void {
		const row = parent.createDiv('sg-scene-panel-meta-row');
		const keyEl = row.createDiv('sg-scene-panel-meta-key');
		const iconSpan = keyEl.createSpan({ cls: 'sg-scene-panel-meta-icon' });
		setIcon(iconSpan, iconName);
		keyEl.createSpan({ cls: 'sg-scene-panel-meta-label', text: label });
		row.createDiv({ cls: `sg-scene-panel-meta-value${isPlain ? ' is-plain' : ''}`, text: value });
	}

	private formatRelativeTime(mtime: number): string {
		const diffSec = Math.floor((Date.now() - mtime) / 1000);
		if (diffSec < 60) return 'przed chwilą';
		const diffMin = Math.floor(diffSec / 60);
		if (diffMin < 60) return `${diffMin} min ago`;
		const diffHours = Math.floor(diffMin / 60);
		if (diffHours < 24) return `${diffHours} hours ago`;
		const diffDays = Math.floor(diffHours / 24);
		if (diffDays < 30) return `${diffDays} days ago`;
		return new Date(mtime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	private setupResizeObserver(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}

		if (!this.chartWrap) return;

		this.resizeObserver = new ResizeObserver(entries => {
			for (const entry of entries) {
				const newWidth = Math.round(entry.contentRect.width);
				const newHeight = Math.round(entry.contentRect.height);
				if (newWidth <= 0 || newHeight <= 0) continue;
				if (Math.abs(newWidth - this.lastWidth) >= 4 || Math.abs(newHeight - this.lastHeight) >= 4) {
					this.lastWidth = newWidth;
					this.lastHeight = newHeight;
					if (this.rerenderTimer) clearTimeout(this.rerenderTimer);
					this.rerenderTimer = setTimeout(() => {
						if (this.chartWrap) {
							this.buildChart(this.chartWrap);
						}
					}, 200);
				}
			}
		});

		this.resizeObserver.observe(this.chartWrap);
	}

	private setupDocumentClickHandler(): void {
		this.documentClickHandler = (e: MouseEvent) => {
			if (!this.filterPanelEl || !this.filterBtnEl) return;
			const target = e.target as HTMLElement;
			if (!this.filterPanelEl.contains(target) && !this.filterBtnEl?.contains(target)) {
				this.filterPanelEl.style.display = 'none';
			}
		};
		document.addEventListener('click', this.documentClickHandler);
	}

	rerender(): void {
		if (this.rerenderTimer) clearTimeout(this.rerenderTimer);
		this.rerenderTimer = setTimeout(() => {
			this.render();
		}, 200);
	}

	destroy(): void {
		this.container.removeClass('sg-root');
		if (this.rerenderTimer) clearTimeout(this.rerenderTimer);
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		if (this.documentClickHandler) {
			document.removeEventListener('click', this.documentClickHandler);
			this.documentClickHandler = null;
		}
		if (this.filterPanelEl) {
			this.filterPanelEl.remove();
			this.filterPanelEl = null;
		}
		// Nullify panel refs
		this.scenePanelEl = null;
		this.connPanelEl = null;
		this.subplotPanelEl = null;
	}

	// ── Przyciski funkcyjne w topbarze Firefly ─────────────────────

	buildTopbarControls(rightEl: HTMLElement): void {
		rightEl.empty();
	}

	// ── Panel filtra ─────────────────────────────────────────────────

	private buildFilterPanel(): void {
		// Remove existing panel if any
		if (this.filterPanelEl) {
			this.filterPanelEl.remove();
			this.filterPanelEl = null;
		}

		// Create new panel
		const panel = this.container.createDiv('sg-filter-panel');
		panel.style.display = 'none';
		this.filterPanelEl = panel;

		// Status section
		const layerHeader = panel.createDiv('sg-filter-section-header');
		layerHeader.textContent = 'Warstwy wykresu';
		const layerDefs: Array<{ key: LayerFlag; label: string; icon: string }> = [
			{ key: 'bars', label: 'Sceny', icon: 'layout-grid' },
			{ key: 'storyLine', label: 'Fabuła', icon: 'activity' },
			{ key: 'subplots', label: 'Subploty', icon: 'git-branch' },
			{ key: 'nodes', label: 'Węzły', icon: 'circle-dot' },
		];
		for (const def of layerDefs) {
			const option = panel.createDiv('sg-filter-option sg-filter-layer-option');
			const checkbox = option.createDiv('sg-filter-checkbox');
			checkbox.classList.toggle('is-checked', this.layers[def.key]);
			const icon = option.createSpan({ cls: 'sg-filter-layer-icon' });
			setIcon(icon, def.icon);
			option.createSpan({ text: def.label });
			option.addEventListener('click', () => {
				this.layers[def.key] = !this.layers[def.key];
				checkbox.classList.toggle('is-checked', this.layers[def.key]);
				this.refreshLayers();
			});
		}
		panel.createDiv('sg-filter-section-divider');
		const statusHeader = panel.createDiv('sg-filter-section-header');
		statusHeader.textContent = 'Filtruj sceny';

		const statusOptions = ['Todo', 'Working', 'Complete'];
		for (const status of statusOptions) {
			this.createFilterOption(panel, status, this.activeFilters.has(status));
		}

		// Beat section (only if beats exist)
		if (this.data?.beats && this.data.beats.length > 0) {
			panel.createDiv('sg-filter-section-divider');
			const beatHeader = panel.createDiv('sg-filter-section-header');
			beatHeader.textContent = 'Beat';

			for (const beat of this.data.beats) {
				this.createFilterOption(panel, beat.title, this.activeFilters.has(beat.title));
			}
		}

		// Clear filters button
		if (this.activeFilters.size > 0) {
			panel.createDiv('sg-filter-section-divider');
			const clearBtn = panel.createDiv('sg-filter-clear');
			clearBtn.textContent = 'Wyczyść filtry';
			clearBtn.addEventListener('click', () => {
				this.activeFilters.clear();
				this.updateFilterButtonBadge();
				this.buildFilterPanel();
				this.applyFilters();
			});
		}
	}

	private createFilterOption(panel: HTMLElement, label: string, isChecked: boolean): void {
		const option = panel.createDiv('sg-filter-option');
		const checkbox = option.createDiv('sg-filter-checkbox');
		if (isChecked) checkbox.classList.add('is-checked');
		option.createSpan({ text: label });

		option.addEventListener('click', () => {
			if (this.activeFilters.has(label)) {
				this.activeFilters.delete(label);
			} else {
				this.activeFilters.add(label);
			}
			this.updateFilterButtonBadge();
			this.buildFilterPanel();
			this.applyFilters();
		});
	}

	private toggleFilterPanel(): void {
		if (!this.filterPanelEl || !this.filterBtnEl) return;

		const panel = this.filterPanelEl;
		const btnRect = this.filterBtnEl.getBoundingClientRect();
		const containerRect = this.container.getBoundingClientRect();

		panel.style.top = `${btnRect.bottom - containerRect.top + 4}px`;
		panel.style.left = `${btnRect.left - containerRect.left}px`;
		panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
	}

	private updateFilterButtonBadge(): void {
		if (!this.filterBtnEl) return;
		const badge = this.filterBtnEl.querySelector('.sg-filter-badge') as HTMLElement;
		if (badge) {
			badge.textContent = String(this.activeFilters.size);
			badge.style.display = this.activeFilters.size > 0 ? 'inline-flex' : 'none';
		}
		this.filterBtnEl.classList.toggle('is-active', this.activeFilters.size > 0);
	}

	// ── Modal tworzenia nowego beata ──────────────────────────────

	private async openCreateBeatModal(): Promise<void> {
		const project = this.plugin.projectManager.getActiveProject();
		if (!project?.rootFolder) return;

		const title = await this.promptUser('Nowy Story Beat', 'Podaj nazwę beata (np. The Hook)');
		if (!title) return;

		const root = project.rootFolder.replace(/\\/g, '/').replace(/\/$/, '');
		const beatsFolder = `${root}/Beats`;
		if (!this.plugin.app.vault.getAbstractFileByPath(beatsFolder)) {
			await this.plugin.app.vault.createFolder(beatsFolder).catch(() => {});
		}

		const nextOrder = (this.data?.beats.length ?? 0) + 1;
		const act = 1;
		const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '');
		const fileName = `${String(nextOrder).padStart(2, '0')} ${sanitizedTitle}.md`;
		const filePath = `${beatsFolder}/${fileName}`;

		const content = [
			'---',
			'Class: StoryBeat',
			`Title: "${title}"`,
			`Act: ${act}`,
			`Order: ${nextOrder}`,
			'StoryTension: 5',
			'StoryPacing: 5',
			'Status: Draft',
			'Synopsis: ""',
			'---',
			'',
			`# ${title}`,
			'',
		].join('\n');

		try {
			const file = await this.plugin.app.vault.create(filePath, content);
			this.render();
			void this.plugin.app.workspace.getLeaf('tab').openFile(file);
		} catch (err) {
			console.error('Błąd tworzenia beata:', err);
		}
	}

	private promptUser(headerText: string, placeholderText: string): Promise<string | null> {
		return new Promise(resolve => {
			const modal = new Modal(this.plugin.app);
			modal.onOpen = () => {
				const { contentEl } = modal;
				contentEl.empty();
				contentEl.createEl('h3', { text: headerText });
				const input = contentEl.createEl('input', {
					type: 'text',
					cls: 'firefly-modal-input',
					placeholder: placeholderText,
				});
				input.style.width = '100%';
				input.style.marginBottom = '12px';
				input.focus();

				const btnRow = contentEl.createDiv({ cls: 'firefly-modal-btn-row' });
				const cancelBtn = btnRow.createEl('button', { text: 'Anuluj', cls: 'firefly-modal-btn' });
				cancelBtn.addEventListener('click', () => {
					modal.close();
					resolve(null);
				});

				const submitBtn = btnRow.createEl('button', {
					text: 'Utwórz',
					cls: 'firefly-modal-btn firefly-modal-btn-primary',
				});
				const doSubmit = () => {
					const val = input.value.trim();
					modal.close();
					resolve(val || null);
				};
				submitBtn.addEventListener('click', doSubmit);
				input.addEventListener('keydown', e => {
					if (e.key === 'Enter') doSubmit();
					if (e.key === 'Escape') {
						modal.close();
						resolve(null);
					}
				});
			};
			modal.onClose = () => {
				resolve(null);
			};
			modal.open();
		});
	}

	// ── Budowa wykresu ────────────────────────────────────────────

	private buildChart(wrap: HTMLElement): void {
		wrap.querySelectorAll('svg').forEach(el => el.remove());
		if (!this.tooltipEl || !wrap.contains(this.tooltipEl)) {
			this.tooltipEl = wrap.createDiv('sg-tooltip');
			this.tooltipEl.style.display = 'none';
		}
		if (this.beatPanelEl) this.beatPanelEl.empty();

		const rowW = wrap.clientWidth ?? 900;
		// Panel HTML jest teraz zastąpiony etykietami SVG — chowamy go
		if (this.beatPanelEl) {
			this.beatPanelEl.style.display = 'none';
			this.beatPanelEl.style.width = '0';
		}

		const availW = wrap.clientWidth || Math.max(rowW, 200);
		const availH = wrap.clientHeight || 340;
		const availPlotW = Math.max(availW - MARGIN.left - MARGIN.right, 200);

		this.data = this.reader.buildGraphData(this.plugin, this.yMode, availPlotW);
		if (this.subplotPanelEl) this.buildSubplotPanel(this.subplotPanelEl);

		const totalCount = (this.data.beats.length || 0) + (this.data.scenes.length || 0) + (this.data.orphanedScenes.length || 0);
		if (totalCount === 0) {
			this.renderEmpty(wrap);
			return;
		}

		// Zawsze dopasowujemy szerokość do 100% dostępnego kontenera (brak overflow na wykresie)
		this.svgW = availW;
		this.svgH = Math.max(180, availH);

		const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svgEl.setAttribute('width', '100%');
		svgEl.setAttribute('height', '100%');
		svgEl.setAttribute('viewBox', `0 0 ${this.svgW} ${this.svgH}`);
		svgEl.setAttribute('preserveAspectRatio', 'none');
		svgEl.style.width = '100%';
		svgEl.style.minWidth = '100%';
		svgEl.addClass('sg-svg');
		this.svg = svgEl;
		wrap.appendChild(svgEl);

		// Definicje gradientów dla subtelnego podświetlenia obszaru pod wykresem
		const defs = this.svgAppend(svgEl, 'defs', {});
		const grad = this.svgAppend(defs, 'linearGradient', {
			id: 'sg-story-area-gradient',
			x1: '0', y1: '0', x2: '0', y2: '1',
		});
		this.svgAppend(grad, 'stop', { offset: '0%', 'stop-color': '#d4b483', 'stop-opacity': '0.14' });
		this.svgAppend(grad, 'stop', { offset: '70%', 'stop-color': '#d4b483', 'stop-opacity': '0.03' });
		this.svgAppend(grad, 'stop', { offset: '100%', 'stop-color': '#d4b483', 'stop-opacity': '0' });

		const gActZones   = this.makeGroup(svgEl, 'sg-layer-act-zones');
		const gGrid       = this.makeGroup(svgEl, 'sg-layer-grid');
		const gBeatLines  = this.makeGroup(svgEl, 'sg-layer-beat-lines');
		const gBars         = this.makeGroup(svgEl, 'sg-layer-bars');
		const gStoryLine    = this.makeGroup(svgEl, 'sg-layer-story-line');
		const gSubplots     = this.makeGroup(svgEl, 'sg-layer-subplots');
		const gSubplotNodes = this.makeGroup(svgEl, 'sg-layer-subplot-nodes');
		const gAxes         = this.makeGroup(svgEl, 'sg-layer-axes');
		const gGuide        = this.makeGroup(svgEl, 'sg-layer-guide');
		const gBeatLeaders  = this.makeGroup(svgEl, 'sg-layer-beat-leaders');
		const gBeatNodes    = this.makeGroup(svgEl, 'sg-layer-beat-nodes');

		const { W, H, xOf, yOf, yCurveOf, yBase, domainMin, domainMax } = this.chartCoords();

		const beatCorePoints = this.getStoryBeatCorePoints(xOf, yCurveOf);
		const beatPoints = this.getStoryBeatPoints(xOf, yCurveOf);
		const storyPathD = this.buildStoryPathD(beatPoints);
		this.storyCurveSamples = this.samplePathD(storyPathD);

		const subplotNodeR = 4.5;

		this.renderActZones(gActZones, xOf, H);
		this.renderGrid(gGrid, W, yOf, domainMin, domainMax);
		this.renderBeatBoundaries(gBeatLines, xOf, H);

		if (this.layers.bars) this.renderBars(gBars, xOf, yOf, yBase, H);
		if (this.layers.storyLine) {
			this.renderStoryLine(gStoryLine, storyPathD, beatPoints, yBase, beatCorePoints);
		}
		if (this.layers.subplots) this.renderSubplotLines(gSubplots, xOf, yOf);
		this.renderNodes(gSubplotNodes, xOf, yOf, subplotNodeR);

		if (this.layers.storyLine) {
			this.renderBeatLabelsTop(gBeatLeaders, beatCorePoints, W, H);
			this.renderBeatNodes(gBeatNodes, beatCorePoints);
		}

		this.renderAxes(gAxes, yOf, xOf, W, H, domainMin, domainMax);
		this.guideLine = this.svgAppend(gGuide, 'line', {
			x1: '0', x2: '0',
			y1: String(MARGIN.top), y2: String(yBase),
			stroke: '#5D3D40',
			'stroke-width': '2',
			'stroke-dasharray': '2 3',
			opacity: '0',
			'pointer-events': 'none',
			class: 'sg-crosshair-guide',
		});

		const guideScene = this.data.scenes.find(scene => scene.filePath === this.guideScenePath)
			?? this.data.orphanedScenes.find(scene => scene.filePath === this.guideScenePath);
		if (guideScene?.xNorm !== undefined) this.setSceneGuide(xOf(guideScene.xNorm));
		const guideBeat = this.data.segments.find(segment => segment.beat.filePath === this.guideBeatPath);
		if (guideBeat) this.setSceneGuide(xOf((guideBeat.xStart + guideBeat.xEnd) / 2));

		this.refreshLayers();
		const selectedBeat = this.data.segments
			.map(segment => segment.beat)
			.find(beat => beat.filePath === this.selectedBeatPath);
		const selectedScene = this.data.scenes.find(scene => scene.filePath === this.selectedScenePath)
			?? this.data.orphanedScenes.find(scene => scene.filePath === this.selectedScenePath);

		if (selectedBeat) {
			this.renderBeatDetails(selectedBeat);
		} else if (selectedScene) {
			if (selectedScene.xNorm !== undefined) {
				this.highlightScene(selectedScene.filePath, xOf(selectedScene.xNorm));
			}
			this.renderSceneDetails(selectedScene);
		} else {
			this.renderSceneDetails(null);
		}

		if (this.connPanelEl) this.buildConnectionsPanel(this.connPanelEl);
	}

	private getStoryBeatCorePoints(
		xOf: (x: number) => number,
		yCurveOf: (y: number) => number,
	): Array<{ x: number; y: number; segment: BeatSegment }> {
		if (!this.data) return [];
		const realSegments = this.data.segments.filter(s => !s.isOrphaned);
		return realSegments.map(seg => ({
			x: xOf((seg.xStart + seg.xEnd) / 2),
			y: yCurveOf(this.yMode === 'tension' ? seg.beat.storyTension : seg.beat.storyPacing),
			segment: seg,
		}));
	}

	private getStoryBeatPoints(
		xOf: (x: number) => number,
		yCurveOf: (y: number) => number,
	): Array<{ x: number; y: number }> {
		const core = this.getStoryBeatCorePoints(xOf, yCurveOf).map(p => ({ x: p.x, y: p.y }));
		if (core.length === 0) {
			return [
				{ x: xOf(0), y: yCurveOf(5) },
				{ x: xOf(1), y: yCurveOf(5) },
			];
		}

		const pts = [...core];
		const xLeft = xOf(0);
		if (pts[0]!.x > xLeft) pts.unshift({ x: xLeft, y: pts[0]!.y });
		const xRight = xOf(1);
		if (pts[pts.length - 1]!.x < xRight) pts.push({ x: xRight, y: pts[pts.length - 1]!.y });
		return pts;
	}

	private buildStoryPathD(points: Array<{ x: number; y: number }>): string {
		if (points.length === 0) return '';
		return this.buildLinearPath(points);
	}

	private buildSmoothPath(points: Array<{ x: number; y: number }>): string {
		if (points.length === 0) return '';
		if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
		if (points.length === 2) {
			return `M ${points[0]!.x} ${points[0]!.y} L ${points[1]!.x} ${points[1]!.y}`;
		}

		let d = `M ${points[0]!.x} ${points[0]!.y}`;
		const { yBase } = this.chartCoords();
		const minY = 90;
		const maxY = yBase + 2;

		for (let i = 0; i < points.length - 1; i++) {
			const p0 = points[Math.max(0, i - 1)]!;
			const p1 = points[i]!;
			const p2 = points[i + 1]!;
			const p3 = points[Math.min(points.length - 1, i + 2)]!;
			const tension = 0.18;
			const cp1x = p1.x + (p2.x - p0.x) * tension;
			let cp1y = p1.y + (p2.y - p0.y) * tension;
			const cp2x = p2.x - (p3.x - p1.x) * tension;
			let cp2y = p2.y - (p3.y - p1.y) * tension;

			cp1y = Math.max(minY, Math.min(maxY, cp1y));
			cp2y = Math.max(minY, Math.min(maxY, cp2y));

			d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
		}
		return d;
	}

	private samplePathD(pathD: string, steps = 240): Array<{ x: number; y: number }> {
		if (!pathD) return [];
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', pathD);
		const len = path.getTotalLength();
		if (len <= 0) return [];
		const samples: Array<{ x: number; y: number }> = [];
		for (let i = 0; i <= steps; i++) {
			const p = path.getPointAtLength((len * i) / steps);
			samples.push({ x: p.x, y: p.y });
		}
		return samples;
	}

	private getStoryCurveY(cx: number): number {
		const samples = this.storyCurveSamples;
		if (samples.length === 0) return 0;
		if (cx <= samples[0]!.x) return samples[0]!.y;
		if (cx >= samples[samples.length - 1]!.x) return samples[samples.length - 1]!.y;

		for (let i = 1; i < samples.length; i++) {
			const a = samples[i - 1]!;
			const b = samples[i]!;
			if (cx >= a.x && cx <= b.x) {
				const dx = b.x - a.x;
				if (dx <= 0) return a.y;
				const t = (cx - a.x) / dx;
				return a.y + (b.y - a.y) * t;
			}
		}
		return samples[samples.length - 1]!.y;
	}

	private chartCoords() {
		const W = Math.max(100, this.svgW - MARGIN.left - MARGIN.right);
		const H = Math.max(80, this.svgH - MARGIN.top - MARGIN.bottom);

		// Fixed domena Y 1-10 dla zgodności z etykietami osi
		const domainMin = 1;
		const domainMax = 10;
		const domainSpan = domainMax - domainMin;

		const xOf = (xNorm: number) => MARGIN.left + Math.max(0, Math.min(1, xNorm)) * W;
		const yOf = (val: number)   => MARGIN.top + H - ((Math.max(domainMin, Math.min(domainMax, val)) - domainMin) / domainSpan) * H;
		const yBase = MARGIN.top + H;

		// Krzywa fabuły i węzły beatów interpolują poniżej etykiet beatów (pigułki na y=56..76)
		// Poziom 10 na krzywej zaczyna się na y=96 (odstęp na linie wiodące), a poziom 1 na yBase
		const yCurveTop = 96;
		const yCurveSpan = Math.max(40, yBase - yCurveTop);
		const yCurveOf = (val: number) => yBase - ((Math.max(domainMin, Math.min(domainMax, val)) - domainMin) / domainSpan) * yCurveSpan;

		return { W, H, xOf, yOf, yCurveOf, yBase, domainMin, domainMax };
	}

	// ── Warstwy SVG ───────────────────────────────────────────────

	private renderActZones(
		g: SVGGElement,
		xOf: (x: number) => number,
		_H: number,
	): void {
		if (!this.data) return;
		const { segments } = this.data;

		const realSegments = segments.filter(s => !s.isOrphaned);
		if (realSegments.length === 0) return;

		const { yBase, W } = this.chartCoords();

		// Przerwa między blokami beatów — zgodna z designem Figma (~10px)
		const BEAT_GAP = 10;

		// Linia pozioma separatora nagłówka aktu (y = 48)
		this.svgAppend(g, 'line', {
			x1: String(MARGIN.left),
			x2: String(MARGIN.left + W),
			y1: '48',
			y2: '48',
			stroke: '#55595C',
			'stroke-width': '1',
			opacity: '0.46',
		});

		// Jeden rect na każdy beat — kolor zależy od aktu, odstęp BEAT_GAP między blokami
		for (const seg of realSegments) {
			const actColor = ACT_COLORS[seg.act] ?? ACT_COLORS[3] ?? '#373125';
			const rawX = xOf(seg.xStart);
			const rawEnd = xOf(seg.xEnd);
			const halfGap = BEAT_GAP / 2;
			const x = rawX + halfGap;
			const w = Math.max(rawEnd - rawX - BEAT_GAP, 4);

			this.svgAppend(g, 'rect', {
				x: String(x),
				y: '48',
				width: String(w),
				height: String(Math.max(10, yBase - 48)),
				fill: actColor,
				opacity: '0.4',
				rx: '2',
			});
		}

		// Etykiety aktów — wycentrowane nad całą grupą beatów danego aktu
		const actRanges = new Map();
		for (const seg of realSegments) {
			const cur = actRanges.get(seg.act);
			if (!cur) actRanges.set(seg.act, { xStart: seg.xStart, xEnd: seg.xEnd });
			else {
				cur.xStart = Math.min(cur.xStart, seg.xStart);
				cur.xEnd = Math.max(cur.xEnd, seg.xEnd);
			}
		}

		for (const [act, { xStart, xEnd }] of actRanges) {
			const x = xOf(xStart);
			const w = xOf(xEnd) - x;
			const label = this.svgAppend(g, 'text', {
				x: String(x + w / 2),
				y: '24',
				'text-anchor': 'middle',
				'dominant-baseline': 'middle',
				fill: '#CCD0D2',
				'font-size': '10',
				'font-weight': '700',
				'font-family': 'var(--font-interface)',
				'letter-spacing': '1px',
				opacity: '0.9',
			});
			label.textContent = `AKT ${act}`;
		}
	}

	private renderGrid(
		g: SVGGElement,
		W: number,
		yOf: (y: number) => number,
		domainMin: number,
		domainMax: number,
	): void {
		// Poziome linie pomocnicze na y=4, y=7
		// (Linia 10 na y=48 jest rysowana jako główna linia oddzielająca nagłówki aktów od wykresu)
		for (const y of [4, 7]) {
			if (y < domainMin || y > domainMax) continue;
			this.svgAppend(g, 'line', {
				x1: String(MARGIN.left), x2: String(MARGIN.left + W),
				y1: String(yOf(y)), y2: String(yOf(y)),
				stroke: '#55595C',
				'stroke-width': '1',
				'stroke-dasharray': '4 4',
				opacity: '0.28',
			});
		}
		// Linia bazowa (y=1)
		if (domainMin <= 1) {
			this.svgAppend(g, 'line', {
				x1: String(MARGIN.left), x2: String(MARGIN.left + W),
				y1: String(yOf(1)), y2: String(yOf(1)),
				stroke: '#34373A',
				'stroke-width': '1',
				opacity: '0.46',
			});
		}
	}

	private renderBeatBoundaries(
		_g: SVGGElement,
		_xOf: (x: number) => number,
		_H: number,
	): void {
		// Granice beatów zaznaczane są przez kolorowe pasy aktów i pigułki na górze
	}

	private renderBars(
		g: SVGGElement,
		xOf: (x: number) => number,
		_yOf: (y: number) => number,
		yBase: number,
		H: number,
	): void {
		if (!this.data) return;
		const allScenes = [...this.data.scenes, ...this.data.orphanedScenes];
		if (allScenes.length === 0) return;

		// Słupki scen mają zróżnicowaną wysokość zgodną z designem Figma (20% - 35% wysokości wykresu)
		const maxBarH = Math.max(H * 0.35, 60);
		const minBarH = 22;
		const maxWords = Math.max(...allScenes.map(s => s.words ?? 0), 1);
		const positions = allScenes
			.filter(scene => scene.xNorm !== undefined)
			.map(scene => ({ scene, cx: xOf(scene.xNorm!) }))
			.sort((a, b) => a.cx - b.cx);
		const plotLeft = MARGIN.left;
		const plotRight = this.svgW - MARGIN.right;

		for (let i = 0; i < positions.length; i++) {
			const { scene, cx } = positions[i]!;

			// Obliczenie wysokości słupka — odzwierciedla dynamikę i rytm scen z Figmy
			let ratio: number;
			if (scene.words && maxWords > 100) {
				const wordRatio = Math.max(0.1, Math.min(1.0, scene.words / maxWords));
				const tensionRatio = ((scene.yInterp ?? scene.subplotTension ?? 5) - 1) / 9;
				ratio = 0.5 * wordRatio + 0.5 * tensionRatio;
			} else {
				const baseRatio = ((scene.yInterp ?? scene.subplotTension ?? 5) - 1) / 9;
				// Deterministyczna mikro-wariacja na podstawie kolejności i tytułu
				const hash = Math.sin((scene.order || 1) * 9.2 + scene.title.length * 3.7) * 0.15;
				ratio = Math.max(0.12, Math.min(1.0, baseRatio * 0.75 + 0.2 + hash));
			}

			const barH = Math.round(minBarH + ratio * (maxBarH - minBarH));
			const barY = yBase - barH;
			const isSelected = this.selectedScenePath === scene.filePath;
			const prevCx = positions[i - 1]?.cx;
			const nextCx = positions[i + 1]?.cx;
			const leftEdge = prevCx === undefined ? plotLeft : (prevCx + cx) / 2;
			const rightEdge = nextCx === undefined ? plotRight : (cx + nextCx) / 2;
			const barWidth = Math.max(2, rightEdge - leftEdge - SCENE_BAR_GAP);

			const rect = this.svgAppend(g, 'rect', {
				x: String(leftEdge + SCENE_BAR_GAP / 2),
				y: String(barY),
				width: String(barWidth),
				height: String(barH),
				fill: STORY_LINE_COLOR,
				opacity: isSelected ? '0.45' : '0.1',
				rx: '2',
				'data-path': scene.filePath,
				class: `sg-scene-bar${isSelected ? ' is-highlighted' : ''}`,
			});

			rect.addEventListener('mouseenter', (ev: MouseEvent) => {
				this.highlightScene(scene.filePath, cx);
				const cy = this.getStoryCurveY(cx);
				this.showSceneTooltip(ev, scene, undefined, cx, cy);
			});
			rect.addEventListener('mouseleave', () => {
				this.clearHighlight();
				this.hideTooltip();
			});
			rect.addEventListener('click', () => {
				const cy = this.getStoryCurveY(cx);
				this.selectScene(scene, cx, cy);
			});
			rect.addEventListener('dblclick', () => this.openFile(scene.filePath));
		}
	}

	private buildSegmentedStoryPathD(
		beatPoints: Array<{ x: number; y: number }>,
		corePoints: Array<{ x: number; y: number; segment: BeatSegment }>,
	): string {
		if (beatPoints.length < 2) return '';

		// Niewielka odległość (odstęp) pomiędzy węzłami beatów a linią wykresu
		const GAP = 5;

		const getRadius = (p: { x: number; y: number }): number => {
			const core = corePoints.find(cp => Math.abs(cp.x - p.x) < 0.5 && Math.abs(cp.y - p.y) < 0.5);
			if (!core) return 0;
			const isActive = this.activeFilterBeat?.filePath === core.segment.beat.filePath;
			const nodeR = isActive ? 8.5 : 5;
			return nodeR + GAP;
		};

		const segments: string[] = [];
		for (let i = 0; i < beatPoints.length - 1; i++) {
			const p1 = beatPoints[i]!;
			const p2 = beatPoints[i + 1]!;
			const dx = p2.x - p1.x;
			const dy = p2.y - p1.y;
			const dist = Math.hypot(dx, dy);
			if (dist <= 0.1) continue;

			const r1 = getRadius(p1);
			const r2 = getRadius(p2);

			let actualR1 = r1;
			let actualR2 = r2;
			const minLen = 4;
			if (dist < r1 + r2 + minLen) {
				const factor = Math.max(0, (dist - minLen) / Math.max(1, r1 + r2));
				actualR1 = r1 * factor;
				actualR2 = r2 * factor;
			}

			const startX = p1.x + (dx / dist) * actualR1;
			const startY = p1.y + (dy / dist) * actualR1;
			const endX = p2.x - (dx / dist) * actualR2;
			const endY = p2.y - (dy / dist) * actualR2;

			segments.push(`M ${startX.toFixed(1)} ${startY.toFixed(1)} L ${endX.toFixed(1)} ${endY.toFixed(1)}`);
		}

		return segments.join(' ');
	}

	private renderStoryLine(
		g: SVGGElement,
		storyPathD: string,
		beatPoints: Array<{ x: number; y: number }>,
		yBase: number,
		corePoints: Array<{ x: number; y: number; segment: BeatSegment }>,
	): void {
		if (!storyPathD || beatPoints.length === 0) return;

		const firstPt = beatPoints[0]!;
		const lastPt = beatPoints[beatPoints.length - 1]!;
		const dArea = `${storyPathD} L ${lastPt.x} ${yBase} L ${firstPt.x} ${yBase} Z`;

		// Subtelne wypełnienie pod linią
		this.svgAppend(g, 'path', {
			d: dArea,
			fill: 'url(#sg-story-area-gradient)',
			opacity: '0.25',
		});

		// Główna linia fabuły — ostra, z niewielką odległością (odstępem) od węzłów beatów
		const strokeD = this.buildSegmentedStoryPathD(beatPoints, corePoints);

		this.svgAppend(g, 'path', {
			d: strokeD,
			fill: 'none',
			stroke: STORY_LINE_COLOR,
			'stroke-width': '2',
			'stroke-linecap': 'butt',
			'stroke-linejoin': 'miter',
			'stroke-miterlimit': '3',
		});
	}

	private renderBeatLabelsTop(
		g: SVGGElement,
		corePoints: Array<{ x: number; y: number; segment: BeatSegment }>,
		_W: number,
		_H: number,
	): void {
		if (!this.data) return;

		for (const pt of corePoints) {
			const seg = pt.segment;
			const { xOf } = this.chartCoords();
			const segW = xOf(seg.xEnd) - xOf(seg.xStart);
			const labelX = pt.x;
			const { yBase } = this.chartCoords();
			const labelY = yBase + 17;

			const isActive = this.activeFilterBeat?.filePath === seg.beat.filePath;
			const maxChars = Math.max(4, Math.floor(Math.max(segW, 24) / 6));
			const nameEl = this.svgAppend(g, 'text', {
				x: String(labelX),
				y: String(labelY),
				'text-anchor': 'middle',
				'dominant-baseline': 'middle',
				'font-size': '9',
				'font-weight': isActive ? '700' : '500',
				'font-family': 'var(--font-interface)',
				fill: isActive ? STORY_LINE_COLOR : '#CCD0D2',
				opacity: isActive ? '1' : '0.75',
				cursor: 'pointer',
				'data-beat-path': seg.beat.filePath,
				class: 'sg-beat-bottom-label',
			});
			nameEl.setAttribute('title', seg.beat.title);
			nameEl.textContent = seg.beat.title.length > maxChars
				? seg.beat.title.slice(0, maxChars - 1) + '…'
				: seg.beat.title;

			nameEl.addEventListener('click', () => this.selectBeat(seg.beat));
			nameEl.addEventListener('mouseenter', (ev: MouseEvent) => this.showBeatTooltip(ev, seg, labelX, labelY));
			nameEl.addEventListener('mouseleave', () => this.hideTooltip());
		}
	}

	private renderBeatLeaderLines(
		g: SVGGElement,
		corePoints: Array<{ x: number; y: number; segment: BeatSegment }>,
	): void {
		const pillBottomY = 76; // Dolna krawędź pigułki nazwy beata (y=56..76)
		for (const pt of corePoints) {
			const seg = pt.segment;
			const isActive = this.activeFilterBeat?.filePath === seg.beat.filePath;
			const nodeR = isActive ? 8.5 : 5;
			const endY = Math.max(pillBottomY, pt.y - nodeR);

			// Prosta pionowa linia prowadząca od węzła beata do jego nazwy
			const line = this.svgAppend(g, 'line', {
				x1: String(pt.x),
				y1: String(pillBottomY),
				x2: String(pt.x),
				y2: String(endY),
				stroke: isActive ? STORY_LINE_COLOR : '#55595C',
				'stroke-width': isActive ? '1' : '0.7',
				opacity: isActive ? '0.9' : '0.46',
				cursor: 'pointer',
				class: `sg-beat-leader-line${isActive ? ' is-active' : ''}`,
			});

			const clickHandler = () => {
				this.selectBeat(seg.beat);
			};

			line.addEventListener('click', clickHandler);
			line.addEventListener('mouseenter', (ev: MouseEvent) => this.showBeatTooltip(ev, seg, pt.x, 76));
			line.addEventListener('mouseleave', () => this.hideTooltip());
		}
	}



	private formatBeatSceneRange(seg: BeatSegment): string {
		if (seg.scenes.length === 0) return '';
		const orders = seg.scenes.map(s => s.order).filter(n => Number.isFinite(n));
		if (orders.length === 0) return `${seg.scenes.length} scen`;
		const min = Math.min(...orders);
		const max = Math.max(...orders);
		return min === max ? `Scena ${min}` : `Sceny ${min}–${max}`;
	}

	private syncBeatLabelActiveState(): void {
		if (!this.beatPanelEl) return;
		this.beatPanelEl.querySelectorAll('.sg-beat-label-row').forEach(row => {
			const el = row as HTMLElement;
			el.classList.toggle('is-active', !!this.activeFilterBeat && el.dataset.beatPath === this.activeFilterBeat.filePath);
		});
	}

	private setSceneGuide(cx: number): void {
		if (!this.guideLine) return;
		this.guideLine.setAttribute('x1', String(cx));
		this.guideLine.setAttribute('x2', String(cx));
		this.guideLine.setAttribute('stroke', '#5D3D40');
		this.guideLine.style.opacity = '0.9';
	}

	private hideSceneGuide(): void {
		if (this.guideLine) this.guideLine.style.opacity = '0';
	}

	private renderSubplotLines(
		g: SVGGElement,
		xOf: (x: number) => number,
		yOf: (y: number) => number,
	): void {
		if (!this.data) return;
		for (const line of this.data.subplotLines) {
			if (this.hiddenSubplots.has(line.name)) continue;
			if (line.points.length === 0) continue;
			const pts = line.points.map(p => ({ x: xOf(p.xNorm), y: yOf(p.yValue) }));
			const d = this.buildLinearPath(pts);

			const attrs: Record<string, string> = {
				d,
				fill: 'none',
				stroke: line.color,
				'stroke-width': '1',
				opacity: '0.65',
			};
			if (line.dashStyle !== 'none') attrs['stroke-dasharray'] = line.dashStyle;
			this.svgAppend(g, 'path', attrs);
		}
	}

	private renderNodes(
		gSubplotNodes: SVGGElement,
		xOf: (x: number) => number,
		yOf: (y: number) => number,
		subplotNodeR: number,
	): void {
		if (!this.data) return;

		// Węzły subplotów (jeśli warstwa subplotów jest aktywna)
		if (this.layers.subplots) {
			for (const line of this.data.subplotLines) {
				if (this.hiddenSubplots.has(line.name)) continue;
				for (const pt of line.points) {
					const cx = xOf(pt.xNorm);
					const cy = yOf(pt.yValue);

					const circle = this.svgAppend(gSubplotNodes, 'circle', {
						cx: String(cx), cy: String(cy),
						r: String(subplotNodeR),
						fill: 'var(--background-primary)',
						stroke: line.color,
						'stroke-width': '1.8',
						cursor: 'pointer',
						'data-path': pt.scene.filePath,
						class: 'sg-subplot-node',
					});

					circle.addEventListener('mouseenter', (ev: MouseEvent) => {
						this.highlightScene(pt.scene.filePath, cx);
						this.showSceneTooltip(ev, pt.scene, line.name, cx, cy);
					});
					circle.addEventListener('mouseleave', () => {
						this.clearHighlight();
						this.hideTooltip();
					});
					circle.addEventListener('click', () => this.openFile(pt.scene.filePath));
				}
			}
		}
	}

	/** Węzły beatów — wyśrodkowane złote kółka na linii fabuły z obwódką */
	private renderBeatNodes(
		g: SVGGElement,
		corePoints: Array<{ x: number; y: number; segment: BeatSegment }>,
	): void {
		for (const pt of corePoints) {
			const seg = pt.segment;
			const isActive = this.activeFilterBeat?.filePath === seg.beat.filePath;

			if (isActive) {
				// Aktywny beat — większe kółko z obwódką #5D3D40, jak w Figmie
				const outer = this.svgAppend(g, 'circle', {
					cx: String(pt.x), cy: String(pt.y),
					r: '8.5',
					fill: '#16120E',
					stroke: '#5D3D40',
					'stroke-width': '2',
					cursor: 'pointer',
					class: 'sg-beat-node is-active',
				});
				const inner = this.svgAppend(g, 'circle', {
					cx: String(pt.x), cy: String(pt.y),
					r: '4.5',
					fill: '#5D3D40',
					cursor: 'pointer',
					class: 'sg-beat-node is-active',
				});
				outer.addEventListener('click', () => this.selectBeat(seg.beat));
				inner.addEventListener('click', () => this.selectBeat(seg.beat));
				outer.addEventListener('mouseenter', (ev: MouseEvent) => this.showBeatTooltip(ev, seg, pt.x, pt.y));
				inner.addEventListener('mouseenter', (ev: MouseEvent) => this.showBeatTooltip(ev, seg, pt.x, pt.y));
				outer.addEventListener('mouseleave', () => this.hideTooltip());
				inner.addEventListener('mouseleave', () => this.hideTooltip());
			} else {
				// Zwykły węzeł beata — złote wypełnione kółko
				const circle = this.svgAppend(g, 'circle', {
					cx: String(pt.x), cy: String(pt.y),
					r: '5',
					fill: STORY_LINE_COLOR,
					cursor: 'pointer',
					class: 'sg-beat-node',
				});
				circle.addEventListener('mouseenter', (ev: MouseEvent) => this.showBeatTooltip(ev, seg, pt.x, pt.y));
				circle.addEventListener('mouseleave', () => this.hideTooltip());
				circle.addEventListener('click', () => this.selectBeat(seg.beat));
			}
		}
	}

	private renderAxes(
		g: SVGGElement,
		yOf: (y: number) => number,
		_xOf: (x: number) => number,
		W: number,
		H: number,
		domainMin: number,
		domainMax: number,
	): void {
		// Oś Y — tylko wartości z Figmy: 1, 4, 7, 10
		for (const y of [1, 4, 7, 10]) {
			if (y < domainMin || y > domainMax) continue;
			const lbl = this.svgAppend(g, 'text', {
				x: String(MARGIN.left - 8),
				y: String(yOf(y)),
				'text-anchor': 'end',
				'dominant-baseline': 'middle',
				fill: '#CCD0D2',
				'font-size': '10',
				'font-family': 'var(--font-interface)',
				opacity: '0.7',
			});
			lbl.textContent = String(y);
		}

		// Tytuł osi Y — pionowy, uppercase, letter-spacing
		const yAxisTitle = this.yMode === 'tension' ? 'Napięcie' : 'Tempo';
		const midY = MARGIN.top + H / 2;
		const yTitle = this.svgAppend(g, 'text', {
			x: '16',
			y: String(midY),
			'text-anchor': 'middle',
			fill: '#CCD0D2',
			'font-size': '10',
			'font-weight': '700',
			'font-family': 'var(--font-interface)',
			'letter-spacing': '0.07em',
			'text-transform': 'uppercase',
			opacity: '0.7',
			transform: `rotate(-90 16 ${midY})`,
		});
		yTitle.textContent = yAxisTitle;

		// Linia dolna osi X (bazowa)
		this.svgAppend(g, 'line', {
			x1: String(MARGIN.left), x2: String(MARGIN.left + W),
			y1: String(MARGIN.top + H), y2: String(MARGIN.top + H),
			stroke: '#34373A',
			'stroke-width': '1',
			opacity: '0.46',
		});
	}

	// ── Podświetlanie elementów (hover guide) ──────────────────────

	private highlightScene(filePath: string, cx?: number): void {
		if (!filePath) {
			this.clearHighlight();
			return;
		}
		this.sceneStripEl?.querySelectorAll('.sg-scene-card').forEach(c => {
			const el = c as HTMLElement;
			el.classList.toggle('is-highlighted', el.dataset.path === filePath);
		});
		this.svg?.querySelectorAll('circle[data-path], rect[data-path]').forEach(el => {
			const node = el as SVGElement;
			node.classList.toggle('is-highlighted', node.getAttribute('data-path') === filePath);
		});
	}

	private clearHighlight(): void {
		if (this.selectedScenePath) {
			this.sceneStripEl?.querySelectorAll('.sg-scene-card').forEach(c => {
				const el = c as HTMLElement;
				el.classList.toggle('is-highlighted', el.dataset.path === this.selectedScenePath);
			});
			this.svg?.querySelectorAll('circle[data-path], rect[data-path]').forEach(el => {
				const node = el as SVGElement;
				node.classList.toggle('is-highlighted', node.getAttribute('data-path') === this.selectedScenePath);
			});
		} else {
			this.sceneStripEl?.querySelectorAll('.sg-scene-card.is-highlighted').forEach(c => {
				c.classList.remove('is-highlighted');
			});
			this.svg?.querySelectorAll('.is-highlighted').forEach(el => {
				el.classList.remove('is-highlighted');
			});
		}
	}

	// ── Dolny pasek scen ──────────────────────────────────────────

	private buildSceneStrip(): void {
		if (!this.sceneStripEl || !this.data) return;
		this.sceneStripEl.empty();

		const allScenes: Array<GraphScene & { _orphaned?: boolean }> = [
			...this.data.scenes,
			...this.data.orphanedScenes.map(s => ({ ...s, _orphaned: true as const })),
		];
		if (allScenes.length === 0) return;

		let lastBeatKey = '';
		for (const scene of allScenes) {
			const beatKey = scene.beat?.filePath ?? '__orphaned';
			if (beatKey !== lastBeatKey && lastBeatKey !== '') {
				this.sceneStripEl.createDiv('sg-scene-strip-sep');
			}
			lastBeatKey = beatKey;
			this.renderSceneCard(this.sceneStripEl, scene, this.getSubplotColor(scene.subplot?.[0]));
		}

		// Apply filter panel after scene strip is built
		this.applyFilters();
	}

	private renderSceneCard(
		strip: HTMLElement,
		scene: GraphScene & { _orphaned?: boolean },
		subplotColor: string,
	): void {
		const isOrphaned = !scene.beat;
		const isSelected = this.selectedScenePath === scene.filePath;
		const isHidden   = this.activeFilterBeat !== null && !isOrphaned && scene.beat?.filePath !== this.activeFilterBeat.filePath;

		const card = strip.createDiv({
			cls: `sg-scene-card${isSelected ? ' is-selected' : ''}${isHidden ? ' is-hidden' : ''}${isOrphaned ? ' is-orphaned' : ''}`,
		});
		card.dataset.path = scene.filePath;

		const stripe = card.createDiv('sg-scene-card-stripe');
		stripe.style.background = subplotColor || 'var(--background-modifier-border-hover)';

		const body = card.createDiv('sg-scene-card-body');
		const beatTxt = isOrphaned ? 'Bez beata' : (scene.beat?.title ?? scene.beatTitle ?? '');
		if (beatTxt) body.createDiv({ cls: 'sg-scene-card-beat', text: beatTxt });

		body.createDiv({ cls: 'sg-scene-card-title', text: scene.title });

		const povParts: string[] = [];
		if (scene.pov) povParts.push(scene.pov);
		if (scene.chapter !== undefined && scene.chapter !== '') {
			povParts.push(`Rozdz. ${scene.chapter}`);
		}
		if (povParts.length > 0) {
			body.createDiv({ cls: 'sg-scene-card-pov', text: povParts.join(' · ') });
		}

		if (scene.status) {
			const statusRow = body.createDiv('sg-scene-card-status');
			const dot = statusRow.createSpan({ cls: 'sg-scene-card-status-dot' });
			dot.style.background = this.statusColor(scene.status);
			statusRow.createSpan({ cls: 'sg-scene-card-status-label', text: this.statusLabel(scene.status) });
		}

		const tensionVal = scene.yInterp ?? scene.subplotTension ?? 5;
		const tensionRow = body.createDiv('sg-scene-card-tension');
		const tensionTrack = tensionRow.createDiv('sg-scene-card-tension-track');
		const tensionFill = tensionTrack.createDiv('sg-scene-card-tension-fill');
		tensionFill.style.width = `${Math.max(0, Math.min(100, ((tensionVal - 1) / 9) * 100))}%`;

		card.addEventListener('mouseenter', () => {
			if (scene.xNorm !== undefined) {
				const { xOf } = this.chartCoords();
				this.highlightScene(scene.filePath, xOf(scene.xNorm));
			} else {
				this.highlightScene(scene.filePath);
			}
		});
		card.addEventListener('mouseleave', () => {
			this.clearHighlight();
		});

		card.addEventListener('click', () => {
			if (scene.xNorm !== undefined) {
				const { xOf } = this.chartCoords();
				const cx = xOf(scene.xNorm);
				const cy = this.getStoryCurveY(cx);
				this.selectScene(scene, cx, cy);
			} else {
				this.selectedScenePath = this.selectedScenePath === scene.filePath ? null : scene.filePath;
				this.highlightScene(this.selectedScenePath ?? '');
			}
		});

		card.addEventListener('dblclick', () => this.openFile(scene.filePath));
	}

	private selectScene(scene: GraphScene, cx: number, _cy: number): void {
		const deselecting = this.selectedScenePath === scene.filePath;
		this.selectedBeatPath = null;
		this.guideBeatPath = null;
		this.activeFilterBeat = null;
		this.hideTooltip();

		if (deselecting) {
			this.selectedScenePath = null;
			this.guideScenePath = null;
			this.hideSceneGuide();
		} else {
			this.selectedScenePath = scene.filePath;
			this.guideScenePath = scene.filePath;
			this.setSceneGuide(cx);
		}
		this.clearHighlight();
		this.updateSceneStripFilter();
		this.sceneStripEl?.querySelectorAll('.sg-scene-card').forEach(c => {
			const el = c as HTMLElement;
			el.classList.toggle('is-selected', el.dataset.path === this.selectedScenePath);
		});
		if (this.chartWrap) this.buildChart(this.chartWrap);
	}

	private selectBeat(beat: StoryBeat): void {
		const isSelected = this.selectedBeatPath === beat.filePath;
		this.selectedBeatPath = isSelected ? null : beat.filePath;
		this.activeFilterBeat = this.activeFilterBeat?.filePath === beat.filePath ? null : beat;
		this.selectedScenePath = null;
		this.guideScenePath = null;
		this.guideBeatPath = isSelected ? null : beat.filePath;
		this.hideSceneGuide();
		this.hideTooltip();
		this.clearHighlight();
		this.updateSceneStripFilter();
		if (this.chartWrap) this.buildChart(this.chartWrap);
	}

	// ── Tooltips / Karta wskazanej sceny (Figma) ─────────────────

	private showSceneTooltip(e?: MouseEvent, scene?: GraphScene, subplotName?: string, cx?: number, cy?: number): void {
		if (!this.tooltipEl || !scene) return;
		this.tooltipEl.empty();
		this.tooltipEl.style.display = 'flex';

		const chStr = scene.chapter !== undefined && scene.chapter !== '' ? `Rozdział ${scene.chapter}: ` : '';
		this.tooltipEl.createDiv({ cls: 'sg-tooltip-title', text: `${chStr}${scene.title}` });

		const subParts: string[] = [];
		if (scene.beat?.title) subParts.push(scene.beat.title);
		if (subplotName) subParts.push(subplotName);
		if (scene.yInterp !== undefined) subParts.push(`Napięcie ${scene.yInterp.toFixed(1)}/10`);
		else if (scene.subplotTension !== undefined) subParts.push(`Napięcie ${scene.subplotTension}/10`);

		if (subParts.length > 0) {
			this.tooltipEl.createDiv({ cls: 'sg-tooltip-sub', text: subParts.join(' • ') });
		}

		this.positionTooltip(e, cx, cy);
	}

	private showBeatTooltip(e?: MouseEvent, seg?: BeatSegment, cx?: number, cy?: number): void {
		if (!this.tooltipEl || !seg) return;
		this.tooltipEl.empty();
		this.tooltipEl.style.display = 'flex';

		this.tooltipEl.createDiv({ cls: 'sg-tooltip-title', text: `Story Beat: ${seg.beat.title}` });
		this.tooltipEl.createDiv({
			cls: 'sg-tooltip-sub',
			text: `Akt ${seg.act} • Napięcie ${seg.beat.storyTension}/10 • Tempo ${seg.beat.storyPacing}/10 (${seg.scenes.length} scen)`,
		});

		this.positionTooltip(e, cx, cy);
	}

	private hideTooltip(): void {
		if (!this.tooltipEl) return;
		this.tooltipEl.style.display = 'none';
	}

	private positionTooltip(e?: MouseEvent, cx?: number, cy?: number): void {
		if (!this.tooltipEl || !this.chartWrap) return;
		const wrapRect = this.chartWrap.getBoundingClientRect();
		const tipW = 240;
		const tipH = 50;

		let left = 0;
		let top = 0;

		if (cx !== undefined && cy !== undefined) {
			left = cx + 16;
			top = cy - 36;
		} else if (e) {
			left = e.clientX - wrapRect.left + 14;
			top = e.clientY - wrapRect.top - 28;
		}

		if (left + tipW > wrapRect.width - 12) {
			left = cx !== undefined ? cx - tipW - 16 : left - tipW - 24;
		}
		if (top + tipH > wrapRect.height - 12) {
			top = wrapRect.height - tipH - 12;
		}
		if (top < 8) top = 8;
		if (left < 8) left = 8;

		this.tooltipEl.style.left = `${Math.round(left)}px`;
		this.tooltipEl.style.top = `${Math.round(top)}px`;
	}

	private showPinnedSelectedScene(): void {
		// Szczegóły sceny są zawsze widoczne w karcie prawej kolumny (sg-scene-panel)
		if (this.tooltipEl) this.tooltipEl.style.display = 'none';
	}

	// ── Widoczność warstw ─────────────────────────────────────────

	private refreshLayers(): void {
		if (!this.svg) return;
		const toggle = (cls: string, visible: boolean) => {
			const el = this.svg?.querySelector<SVGGElement>(`.${cls}`);
			if (el) el.style.display = visible ? '' : 'none';
		};
		toggle('sg-layer-bars',          this.layers.bars);
		toggle('sg-layer-story-line',    this.layers.storyLine);
		toggle('sg-layer-subplots',      this.layers.subplots);
		toggle('sg-layer-subplot-nodes', this.layers.nodes && this.layers.subplots);
		toggle('sg-layer-beat-nodes', this.layers.storyLine);
		toggle('sg-layer-beat-leaders', this.layers.storyLine);
	}

	private updateSceneStripFilter(): void {
		if (!this.sceneStripEl) return;
		this.sceneStripEl.querySelectorAll<HTMLElement>('.sg-scene-card').forEach(card => {
			const path = card.dataset.path ?? '';
			const scene = this.data?.scenes.find(s => s.filePath === path)
				?? this.data?.orphanedScenes.find(s => s.filePath === path);
			const hidden = this.activeFilterBeat !== null && !!scene && scene.beat?.filePath !== this.activeFilterBeat.filePath;
			card.classList.toggle('is-hidden', hidden);
		});
		this.syncBeatLabelActiveState();
		this.applyFilters();
	}

	private applyFilters(): void {
		if (!this.data || !this.sceneStripEl || !this.svg) return;

		const statusFilters = new Set(
			[...this.activeFilters].filter(f => ['Todo', 'Working', 'Complete'].includes(f))
		);
		const beatFilters = new Set(
			[...this.activeFilters].filter(f => !['Todo', 'Working', 'Complete'].includes(f))
		);

		const allScenes = [...this.data.scenes, ...this.data.orphanedScenes];

		for (const scene of allScenes) {
			const statusOk = statusFilters.size === 0
				|| statusFilters.has(this.normalizeStatus(scene.status ?? ''));
			const beatOk = beatFilters.size === 0
				|| (scene.beat && beatFilters.has(scene.beat.title));
			const passes = statusOk && beatOk;

			// Karty scen
			const card = this.sceneStripEl.querySelector<HTMLElement>(
				`[data-path="${CSS.escape(scene.filePath)}"]`
			);
			if (card) {
				card.classList.toggle('is-filtered-out', !passes);
			}

			// Węzły na wykresie
			this.svg.querySelectorAll<SVGElement>(
				`[data-path="${CSS.escape(scene.filePath)}"]`
			).forEach(node => {
				node.style.opacity = passes ? '' : '0.15';
			});
		}
	}

	private normalizeStatus(raw: string): string {
		const map: Record<string, string> = {
			todo: 'Todo', idea: 'Todo',
			working: 'Working', draft: 'Working',
			complete: 'Complete', written: 'Complete', final: 'Complete',
		};
		return map[raw.toLowerCase()] ?? raw;
	}

	private getSubplotColor(subplot?: string): string {
		if (!subplot || !this.data) return 'var(--text-faint)';
		return this.data.subplotLines.find(l => l.name === subplot)?.color ?? 'var(--text-faint)';
	}

	private statusColor(status: string): string {
		const map: Record<string, string> = {
			todo: '#607D8B', working: '#FF9800', complete: '#4CAF50',
			draft: '#FF9800', written: '#4CAF50', final: '#F44336', idea: '#9E9E9E',
		};
		return map[status.toLowerCase()] ?? '#888';
	}

	private statusLabel(status: string): string {
		const key = status.toLowerCase();
		const map: Record<string, string> = {
			todo: 'Todo', working: 'Working', complete: 'Complete',
			draft: 'Working', written: 'Complete', final: 'Complete', idea: 'Todo',
		};
		return map[key] ?? status;
	}

	private openFile(filePath: string): void {
		const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			void this.plugin.app.workspace.getLeaf('tab').openFile(file);
		}
	}

	private buildLinearPath(points: Array<{ x: number; y: number }>): string {
		if (points.length === 0) return '';
		if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
		let d = `M ${points[0]!.x} ${points[0]!.y}`;
		for (let i = 1; i < points.length; i++) {
			d += ` L ${points[i]!.x} ${points[i]!.y}`;
		}
		return d;
	}

	/** Tworzy element SVG z atrybutami i dołącza do rodzica */
	private svgAppend<K extends keyof SVGElementTagNameMap>(
		parent: SVGElement,
		tag: K,
		attrs: Record<string, string>,
	): SVGElementTagNameMap[K] {
		const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
		parent.appendChild(el);
		return el;
	}

	private makeGroup(parent: SVGSVGElement, cls: string): SVGGElement {
		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		g.setAttribute('class', cls);
		parent.appendChild(g);
		return g;
	}

	private renderEmpty(wrap: HTMLElement): void {
		const ph = wrap.createDiv('firefly-placeholder');
		ph.createDiv({ cls: 'firefly-placeholder-icon', text: '📈' });
		ph.createEl('h2', { cls: 'firefly-placeholder-title', text: 'Story Graph — brak danych' });
		ph.createEl('p', {
			cls: 'firefly-placeholder-subtitle',
			text: 'Dodaj pliki beatów lub scen do projektu. Pliki mogą zawierać dowolne częściowe informacje frontmatteru.',
		});

		const btn = ph.createEl('button', {
			cls: 'firefly-topbar-btn-primary',
			text: '+ Dodaj pierwszy Story Beat',
		});
		btn.style.marginTop = '16px';
		btn.addEventListener('click', () => {
			void this.openCreateBeatModal();
		});
	}
}
