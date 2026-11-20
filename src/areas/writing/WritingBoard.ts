import { setIcon, TFile } from 'obsidian';
import type FireflyPlugin from '../../main';
import { SceneReader } from '../../services/SceneReader';
import { STATUS_ORDER, getStatusCfg } from '../../models/Scene';
import type { Scene, BoardColumn } from '../../models/Scene';
import { SceneDetails } from './SceneDetails';

export type BoardGroupBy = 'act' | 'status' | 'chapter';
export type BoardMode    = 'kanban' | 'corkboard';

export class WritingBoard {
	private plugin: FireflyPlugin;
	private container: HTMLElement;
	private reader: SceneReader;
	private inspector: SceneDetails | null = null;
	private selectedScenePath: string | null = null;

	groupBy: BoardGroupBy = 'act';
	boardMode: BoardMode  = 'kanban';

	constructor(plugin: FireflyPlugin, container: HTMLElement) {
		this.plugin    = plugin;
		this.container = container;
		this.reader    = new SceneReader(plugin.app);
	}

	render(): void {
		this.container.empty();

		// Guard: brak projektu
		const project = this.plugin.projectManager.getActiveProject();
		if (!project) {
			this.renderNoProject();
			return;
		}
		// Guard: brak folderu
		if (!project.rootFolder) {
			this.renderNoFolder(project);
			return;
		}

		const scenes = this.reader.getAllScenes(this.plugin);
		if (scenes.length === 0) { this.renderEmpty(); return; }

		// Kontener główny dla tablicy + panelu szczegółów
		const layoutWrapper = this.container.createDiv('firefly-board-layout');
		const boardArea = layoutWrapper.createDiv('firefly-board-main');
		const inspectorPanel = layoutWrapper.createDiv('firefly-inspector-panel');
		inspectorPanel.setCssStyles({ display: 'none' });

		this.inspector = new SceneDetails(inspectorPanel, this.plugin, {
			onEdit: (scene) => this.openScene(scene.filePath),
			onDelete: async (scene) => {
				await this.reader.deleteScene(scene.filePath);
				this.selectedScenePath = null;
				this.rerender();
			},
			onRefresh: () => this.rerender(),
			onStatusChange: async (scene, status) => {
				await this.reader.updateScene(scene.filePath, { status });
				this.rerender();
			},
			onClose: () => {
				this.selectedScenePath = null;
				this.updateCardSelection();
			},
		});

		this.renderBoard(boardArea, this.buildColumns(scenes));

		// Przywróć zaznaczenie i panel jeśli był otwarty
		if (this.selectedScenePath) {
			const activeScene = scenes.find(s => s.filePath === this.selectedScenePath);
			if (activeScene) {
				this.inspector.show(activeScene);
				this.updateCardSelection();
			}
		}
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

	private updateCardSelection(): void {
		const cards = this.container.querySelectorAll('.firefly-scene-card');
		cards.forEach((el) => {
			const cardEl = el as HTMLElement;
			if (cardEl.dataset.path === this.selectedScenePath) {
				cardEl.addClass('is-selected');
			} else {
				cardEl.removeClass('is-selected');
			}
		});
	}

	private openScene(filePath: string): void {
		const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			const leaf = this.plugin.app.workspace.getLeaf('tab');
			void leaf.openFile(file);
		} else {
			this.reader.openScene(filePath, true);
		}
	}

	// ── Grupowanie ────────────────────────────────────────────────

	private buildColumns(scenes: Scene[]): BoardColumn[] {
		if (this.groupBy === 'status')  return this.groupByStatus(scenes);
		if (this.groupBy === 'chapter') return this.groupByChapter(scenes);
		return this.groupByAct(scenes);
	}

	private groupByAct(scenes: Scene[]): BoardColumn[] {
		return this.genericGroup(
			scenes,
			s => s.act !== undefined ? String(s.act) : 'Bez aktu',
			key => isNaN(parseFloat(key)) ? key : `Akt ${key}`,
			'act-',
		);
	}

	private groupByChapter(scenes: Scene[]): BoardColumn[] {
		return this.genericGroup(
			scenes,
			s => s.chapter !== undefined ? String(s.chapter) : 'Bez rozdziału',
			key => isNaN(parseFloat(key)) ? key : `Rozdział ${key}`,
			'ch-',
		);
	}

	private groupByStatus(scenes: Scene[]): BoardColumn[] {
		const map = new Map<string, Scene[]>();
		for (const s of STATUS_ORDER) map.set(s, []);
		for (const scene of scenes) {
			const key = scene.status ?? 'idea';
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(scene);
		}
		return Array.from(map.entries())
			.filter(([, sc]) => sc.length > 0)
			.map(([key, sc]) => ({ id: `status-${key}`, title: getStatusCfg(key).label, scenes: sc }));
	}

	private genericGroup(
		scenes: Scene[],
		getKey: (s: Scene) => string,
		getTitle: (key: string) => string,
		prefix: string,
	): BoardColumn[] {
		const map = new Map<string, Scene[]>();
		for (const scene of scenes) {
			const key = getKey(scene);
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(scene);
		}
		const sorted = Array.from(map.keys()).sort((a, b) => {
			const na = parseFloat(a), nb = parseFloat(b);
			if (!isNaN(na) && !isNaN(nb)) return na - nb;
			if (!isNaN(na)) return -1;
			if (!isNaN(nb)) return  1;
			return a.localeCompare(b);
		});
		return sorted.map(key => ({ id: `${prefix}${key}`, title: getTitle(key), scenes: map.get(key)! }));
	}

	// ── Renderowanie ──────────────────────────────────────────────

	private renderBoard(boardArea: HTMLElement, columns: BoardColumn[]): void {
		const board = boardArea.createDiv('firefly-board');
		for (const col of columns) this.renderColumn(board, col);
	}

	private renderColumn(board: HTMLElement, col: BoardColumn): void {
		const colEl  = board.createDiv('firefly-board-column');
		const header = colEl.createDiv('firefly-board-column-header');
		header.createSpan({ cls: 'firefly-board-column-title', text: col.title });
		header.createSpan({ cls: 'firefly-board-column-count', text: String(col.scenes.length) });
		const list = colEl.createDiv('firefly-board-column-list');
		for (const scene of col.scenes) this.renderCard(list, scene);
	}

	private renderCard(container: HTMLElement, scene: Scene): void {
		const cfg  = getStatusCfg(scene.status);
		const card = container.createDiv('firefly-scene-card');
		card.dataset.path = scene.filePath;
		card.style.setProperty('--card-status-color', cfg.color);

		if (this.selectedScenePath === scene.filePath) {
			card.addClass('is-selected');
		}

		const body   = card.createDiv('firefly-scene-card-body');
		const header = body.createDiv('firefly-scene-card-header');

		header.createSpan({ cls: 'firefly-scene-card-seq', text: this.formatSeq(scene) });
		const icon = header.createSpan({ cls: 'firefly-scene-card-status-icon' });
		setIcon(icon, cfg.icon);
		icon.style.color = cfg.color;

		body.createDiv({ cls: 'firefly-scene-card-title', text: scene.title || 'Bez tytułu' });

		const textContent = scene.synopsis || scene.summary;
		if (textContent) {
			const max  = 120;
			const text = textContent.length > max
				? textContent.slice(0, max).trimEnd() + '…'
				: textContent;
			body.createDiv({ cls: 'firefly-scene-card-synopsis', text });
		}

		const footer = body.createDiv('firefly-scene-card-footer');
		if (scene.wordcount !== undefined)
			footer.createSpan({ cls: 'firefly-scene-card-wordcount', text: `${scene.wordcount} słów` });
		if (scene.pov)
			footer.createSpan({ cls: 'firefly-scene-card-pov', text: scene.pov });

		// Pojedyncze kliknięcie → otwiera szczegóły sceny (inspector)
		card.addEventListener('click', (e) => {
			e.stopPropagation();
			this.selectedScenePath = scene.filePath;
			this.updateCardSelection();
			this.inspector?.show(scene);
		});

		// Podwójne kliknięcie → otwiera plik sceny w nowej karcie
		card.addEventListener('dblclick', (e) => {
			e.stopPropagation();
			this.openScene(scene.filePath);
		});
	}

	// ── Empty states ──────────────────────────────────────────────

	private renderNoProject(): void {
		const ph = this.container.createDiv('firefly-placeholder');
		setIcon(ph.createDiv({ cls: 'firefly-placeholder-icon' }), 'folder-open');
		ph.createEl('h2', { cls: 'firefly-placeholder-title', text: 'Brak aktywnego projektu' });
		ph.createEl('p',  { cls: 'firefly-placeholder-subtitle', text: 'Wybierz lub utwórz projekt w selectorze po lewej.' });
	}

	private renderNoFolder(project: { title: string }): void {
		const ph = this.container.createDiv('firefly-placeholder');
		setIcon(ph.createDiv({ cls: 'firefly-placeholder-icon' }), 'folder-x');
		ph.createEl('h2', { cls: 'firefly-placeholder-title', text: 'Brak folderu projektu' });
		ph.createEl('p',  { cls: 'firefly-placeholder-subtitle', text: `Projekt „${project.title}" nie ma ustawionego folderu. Ustaw go w Zarządzaj projektami.` });
	}

	private renderEmpty(): void {
		const ph = this.container.createDiv('firefly-placeholder');
		setIcon(ph.createDiv({ cls: 'firefly-placeholder-icon' }), 'columns-2');
		ph.createEl('h2', { cls: 'firefly-placeholder-title', text: 'Brak scen' });
		ph.createEl('p',  { cls: 'firefly-placeholder-subtitle', text: 'Dodaj pliki z frontmatter type: scene lub Class: Scene do folderu projektu.' });
	}

	private formatSeq(scene: Scene): string {
		const act = scene.act      !== undefined ? String(scene.act).padStart(2, '0')      : '??';
		const seq = scene.sequence !== undefined ? String(scene.sequence).padStart(2, '0') : (scene.id ? String(scene.id) : '??');
		return `${act}·${seq}`;
	}
}

