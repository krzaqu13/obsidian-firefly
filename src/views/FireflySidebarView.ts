import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import type FireflyPlugin from '../main';
import {
	FIREFLY_SIDEBAR_VIEW_TYPE,
	FIREFLY_EVENT_AREA_CHANGED,
	AREA_ORDER,
	type AreaId,
} from '../constants';
import type { AreaConfig } from '../models/Area';
import { renderProjectSelector } from './ProjectSelector';
import { FireflyMainView } from './FireflyMainView';

interface FileTreeNode {
	files: TFile[];
	children: Map<string, FileTreeNode>;
}

export class FireflySidebarView extends ItemView {
	private plugin: FireflyPlugin;
	private projectSelectorWrap: HTMLElement | null = null;
	private areaSidebarEl: HTMLElement | null = null;
	private listEl: HTMLElement | null = null;
	private headerTitleEl: HTMLElement | null = null;
	private collapsedFoldersByArea: Map<AreaId, Set<string>> = new Map();
	private initializedAreas: Set<AreaId> = new Set();

	constructor(leaf: WorkspaceLeaf, plugin: FireflyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return FIREFLY_SIDEBAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Sidebar';
	}

	getIcon(): string {
		return 'layout-sidebar';
	}

	async onOpen(): Promise<void> {
		this.containerEl.addClass('firefly-leaf-content');
		const viewHeader = this.containerEl.querySelector('.view-header') as HTMLElement | null;
		if (viewHeader) viewHeader.style.display = 'none';

		const container = (this.containerEl.children[1] || this.containerEl) as HTMLElement;
		container.empty();
		container.addClass('firefly-sidebar');
		container.addClass('firefly-file-browser');

		// ── Sekcja 1: Inner Sidebar (Projekt + Obszary) ───────────────
		const innerSidebarEl = container.createDiv('firefly-inner-sidebar');

		this.projectSelectorWrap = innerSidebarEl.createDiv('firefly-project-selector-wrapper');
		this.renderProjectSelector();

		this.areaSidebarEl = innerSidebarEl.createDiv('firefly-area-sidebar');
		this.renderAreaSidebar(this.plugin.areaManager.getCurrentAreaId());

		// ── Sekcja 2: Drzewo plików pod selektorem obszarów ────────────
		const browserSection = container.createDiv('firefly-browser-section');
		const header = browserSection.createDiv('firefly-browser-header');
		this.headerTitleEl = header.createSpan({ cls: 'firefly-browser-title', text: 'Pliki' });

		this.listEl = browserSection.createDiv('firefly-browser-list');
		this.refreshFileTree();

		// ── Obsługa zdarzeń w workspace ──────────────────────────────
		this.registerEvent(
			this.app.workspace.on(FIREFLY_EVENT_AREA_CHANGED as any, ((areaId: AreaId) => {
				this.setAreaActive(areaId);
				this.refreshFileTree();
			}) as any),
		);

		this.registerEvent(
			this.app.workspace.on('firefly:project-changed' as any, () => {
				this.renderProjectSelector();
				const currentAreaId = this.plugin.areaManager.getCurrentAreaId();
				this.renderAreaSidebar(currentAreaId);
				this.refreshFileTree();
			}),
		);

		this.registerEvent(this.app.vault.on('create', () => this.refreshFileTree()));
		this.registerEvent(this.app.vault.on('delete', () => this.refreshFileTree()));
		this.registerEvent(this.app.vault.on('rename', () => this.refreshFileTree()));
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf?.view instanceof FireflyMainView) {
					const areaId = leaf.view.areaId;
					if (areaId && areaId !== this.plugin.areaManager.getCurrentAreaId()) {
						this.plugin.areaManager.setCurrentArea(areaId);
					}
				}
				this.highlightActiveFile();
			}),
		);
	}

	async onClose(): Promise<void> {
		this.projectSelectorWrap = null;
		this.areaSidebarEl = null;
		this.listEl = null;
		this.headerTitleEl = null;
	}

	// ── Project Selector ─────────────────────────────────────────

	private renderProjectSelector(): void {
		if (!this.projectSelectorWrap) return;
		this.projectSelectorWrap.empty();
		renderProjectSelector(this.projectSelectorWrap, this.plugin, () => {
			const currentAreaId = this.plugin.areaManager.getCurrentAreaId();
			this.renderAreaSidebar(currentAreaId);
			this.refreshFileTree();
		});
	}

	// ── Area Sidebar ─────────────────────────────────────────────

	private renderAreaSidebar(currentAreaId: AreaId): void {
		if (!this.areaSidebarEl) return;
		this.areaSidebarEl.empty();
		for (const areaId of AREA_ORDER) {
			const config = this.plugin.areaManager.getAreaConfig(areaId);
			const btn = this.areaSidebarEl.createDiv({
				cls: `firefly-area-btn${areaId === currentAreaId ? ' is-active' : ''}`,
				attr: { 'aria-label': config.label, 'data-tooltip-position': 'right' },
			});
			setIcon(btn.createSpan({ cls: 'firefly-area-icon' }), config.icon);
			btn.addEventListener('click', async () => {
				this.plugin.areaManager.setCurrentArea(areaId);
				await this.plugin.openAreaView(areaId);
			});
		}
	}

	private setAreaActive(areaId: AreaId): void {
		if (!this.areaSidebarEl) return;
		this.areaSidebarEl.querySelectorAll('.firefly-area-btn').forEach((btn, index) => {
			btn.classList.toggle('is-active', AREA_ORDER[index] === areaId);
		});
	}

	// ── File Tree (pod sekcją inner sidebar) ──────────────────────

	private refreshFileTree(): void {
		if (!this.listEl) return;
		this.listEl.empty();

		const config = this.plugin.areaManager.getCurrentAreaConfig();
		const currentAreaId = this.plugin.areaManager.getCurrentAreaId();

		if (this.headerTitleEl) {
			this.headerTitleEl.setText(config.label ? `Pliki: ${config.label}` : 'Pliki');
		}

		const files = this.getFilteredFiles(config);

		if (files.length === 0) {
			this.listEl.createDiv({
				cls: 'firefly-browser-empty',
				text: config.rootFolder
					? `Brak plików w folderze "${config.rootFolder}"`
					: 'Brak plików pasujących do filtrów tego obszaru.',
			});
			return;
		}

		if (!this.initializedAreas.has(currentAreaId)) {
			this.initializeCollapsedFolders(currentAreaId, files, config.rootFolder);
			this.initializedAreas.add(currentAreaId);
		}

		this.renderTree(this.listEl, files, config.rootFolder, currentAreaId);
	}

	private getFilteredFiles(config: AreaConfig): TFile[] {
		let files = this.app.vault.getMarkdownFiles();

		if (config.rootFolder) {
			const root = config.rootFolder.replace(/\\/g, '/').replace(/\/$/, '');
			files = files.filter(f => f.path.startsWith(root + '/') || f.path === root);
		}

		if (config.allowedFileTypes.length > 0) {
			files = files.filter(f => {
				const cache = this.app.metadataCache.getFileCache(f);
				const fm = cache?.frontmatter;
				if (!fm) return false;
				const fileType =
					fm['type'] ??
					fm['Type'] ??
					fm['Class'] ??
					fm['class'] ??
					fm['Typ Notatki'] ??
					fm['typ notatki'];
				if (!fileType) return false;
				const ftString = String(fileType).toLowerCase().trim();
				return config.allowedFileTypes.some(t => t.toLowerCase().trim() === ftString);
			});
		}

		if (config.allowedTags.length > 0) {
			files = files.filter(f => {
				const cache = this.app.metadataCache.getFileCache(f);
				const fileTags: string[] = cache?.frontmatter?.['tags'] ?? [];
				const normalized = fileTags.map(t => t.replace(/^#/, '').toLowerCase());
				return config.allowedTags.some(tag =>
					normalized.includes(tag.replace(/^#/, '').toLowerCase()),
				);
			});
		}

		return files.sort((a, b) => a.path.localeCompare(b.path));
	}

	private buildFileTree(files: TFile[], rootFolder: string): FileTreeNode {
		const root: FileTreeNode = { files: [], children: new Map() };
		const normalizedRoot = rootFolder.replace(/\\/g, '/').replace(/\/$/, '');

		for (const file of files) {
			const relativePath = rootFolder
				? file.path.slice(normalizedRoot.length + 1)
				: file.path;
			const parts = relativePath.split('/');
			let node = root;

			for (let i = 0; i < parts.length - 1; i++) {
				const folder = parts[i]!;
				if (!node.children.has(folder)) {
					node.children.set(folder, { files: [], children: new Map() });
				}
				node = node.children.get(folder)!;
			}
			node.files.push(file);
		}
		return root;
	}

	private initializeCollapsedFolders(areaId: AreaId, files: TFile[], rootFolder: string): void {
		const collapsed = new Set<string>();
		this.collapsedFoldersByArea.set(areaId, collapsed);
		const tree = this.buildFileTree(files, rootFolder);
		this.collectFolderPaths(collapsed, tree, '');
	}

	private collectFolderPaths(set: Set<string>, node: FileTreeNode, prefix: string): void {
		for (const [name, child] of node.children.entries()) {
			const path = prefix ? `${prefix}/${name}` : name;
			set.add(path);
			this.collectFolderPaths(set, child, path);
		}
	}

	private renderTree(container: HTMLElement, files: TFile[], rootFolder: string, areaId: AreaId): void {
		const tree = this.buildFileTree(files, rootFolder);
		this.renderTreeNode(container, tree, '', areaId);
	}

	private renderTreeNode(container: HTMLElement, node: FileTreeNode, folderPath: string, areaId: AreaId): void {
		const collapsed = this.collapsedFoldersByArea.get(areaId) ?? new Set();

		for (const file of node.files) {
			this.renderFileItem(container, file);
		}

		const sortedFolders = Array.from(node.children.keys()).sort((a, b) => a.localeCompare(b));

		for (const folderName of sortedFolders) {
			const child = node.children.get(folderName)!;
			const fullPath = folderPath ? `${folderPath}/${folderName}` : folderName;
			const isCollapsed = collapsed.has(fullPath);

			const folderEl = container.createDiv('firefly-folder-item');
			folderEl.setAttribute('data-folder-path', fullPath);

			const chevronEl = folderEl.createSpan({ cls: 'firefly-folder-chevron' });
			setIcon(chevronEl, isCollapsed ? 'chevron-right' : 'chevron-down');

			setIcon(folderEl.createSpan({ cls: 'firefly-folder-icon' }), 'folder');
			folderEl.createSpan({ cls: 'firefly-folder-name', text: folderName });

			folderEl.addEventListener('click', () => this.toggleFolder(fullPath, areaId));

			const childrenEl = container.createDiv('firefly-folder-children');
			if (isCollapsed) childrenEl.style.display = 'none';

			this.renderTreeNode(childrenEl, child, fullPath, areaId);
		}
	}

	private toggleFolder(folderPath: string, areaId: AreaId): void {
		const collapsed = this.collapsedFoldersByArea.get(areaId);
		if (!collapsed) return;

		if (collapsed.has(folderPath)) {
			collapsed.delete(folderPath);
		} else {
			collapsed.add(folderPath);
		}
		this.refreshFileTree();
	}

	private renderFileItem(container: HTMLElement, file: TFile): void {
		const activeFile = this.app.workspace.getActiveFile();
		const isActive = activeFile?.path === file.path;

		const item = container.createDiv({
			cls: `firefly-file-item${isActive ? ' is-active' : ''}`,
			attr: { 'data-path': file.path },
		});

		setIcon(item.createSpan({ cls: 'firefly-file-icon' }), 'file-text');
		item.createSpan({ cls: 'firefly-file-name', text: file.basename });

		item.addEventListener('click', (e) => {
			this.app.workspace.openLinkText(file.path, '', e.ctrlKey || e.metaKey);
		});
	}

	private highlightActiveFile(): void {
		if (!this.listEl) return;
		const activeFile = this.app.workspace.getActiveFile();
		this.listEl.querySelectorAll('.firefly-file-item').forEach(el => {
			el.classList.toggle('is-active', el.getAttribute('data-path') === activeFile?.path);
		});
	}
}
