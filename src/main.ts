import { Plugin, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, FireflySettings, FireflySettingTab } from './settings';
import { AreaManager } from './services/AreaManager';
import { ProjectManager } from './services/ProjectManager';
import { SceneReader } from './services/SceneReader';
import { StructureManager } from './services/StructureManager';
import { BookService } from './services/BookService';
import { FireflyMainView } from './views/FireflyMainView';
import { FireflySidebarView } from './views/FireflySidebarView';
import { PlotGridDetailsView } from './views/PlotGridDetailsView';
import {
	FIREFLY_MAIN_VIEW_TYPE,
	FIREFLY_SIDEBAR_VIEW_TYPE,
	FIREFLY_FILE_BROWSER_VIEW_TYPE_LEGACY,
	FIREFLY_PLOTGRID_DETAILS_VIEW_TYPE,
	type AreaId,
} from './constants';

export default class FireflyPlugin extends Plugin {
	settings!: FireflySettings;
	areaManager!: AreaManager;
	projectManager!: ProjectManager;
	sceneReader!: SceneReader;
	structureManager!: StructureManager;
	bookService!: BookService;

	async onload() {
		await this.loadSettings();

		this.areaManager    = new AreaManager(this);
		this.projectManager = new ProjectManager(this);
		this.sceneReader    = new SceneReader(this.app);
		this.structureManager = new StructureManager(this);
		this.bookService    = new BookService(this.app, this);

		this.registerEvent(this.app.vault.on('modify', file => {
			if (file instanceof TFile) this.structureManager.scheduleMappedBeatSync(file);
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile) this.structureManager.scheduleMappedBeatSync(file, oldPath);
		}));
		this.registerEvent(this.app.vault.on('delete', file => {
			if (file instanceof TFile) this.structureManager.scheduleMappedBeatSync(file, file.path, true);
		}));
		this.registerEvent(this.app.metadataCache.on('changed', file => {
			if (file instanceof TFile) this.structureManager.scheduleMappedBeatSync(file);
		}));

		this.registerView(
			FIREFLY_MAIN_VIEW_TYPE,
			leaf => new FireflyMainView(leaf, this),
		);
		this.registerView(
			FIREFLY_SIDEBAR_VIEW_TYPE,
			leaf => new FireflySidebarView(leaf, this),
		);
		this.registerView(
			FIREFLY_FILE_BROWSER_VIEW_TYPE_LEGACY,
			leaf => new FireflySidebarView(leaf, this),
		);
		this.registerView(
			FIREFLY_PLOTGRID_DETAILS_VIEW_TYPE,
			leaf => new PlotGridDetailsView(leaf, this),
		);

		this.addRibbonIcon('feather', 'Otwórz Firefly', () => {
			this.openFireflyMainView();
		});

		this.addCommand({
			id: 'open-firefly',
			name: 'Otwórz Firefly',
			callback: () => this.openFireflyMainView(),
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'f' }],
		});

		this.addCommand({
			id: 'open-firefly-sidebar',
			name: 'Otwórz Sidebar Firefly',
			callback: () => this.openFireflySidebar(),
		});

		this.addSettingTab(new FireflySettingTab(this.app, this));
		console.log('Firefly loaded.');
	}

	onunload() {
		console.log('Firefly unloaded.');
	}

	async openAreaView(areaId: AreaId): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(FIREFLY_MAIN_VIEW_TYPE);
		const existingLeaf = leaves.find(leaf => {
			const view = leaf.view;
			return view instanceof FireflyMainView && view.areaId === areaId;
		});

		if (existingLeaf) {
			this.app.workspace.revealLeaf(existingLeaf);
			this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
			return;
		}

		const activeMainView = this.app.workspace.getActiveViewOfType(FireflyMainView);
		const targetLeaf = activeMainView?.leaf ?? (leaves.length > 0 ? leaves[0] : null);
		if (targetLeaf) {
			await targetLeaf.setViewState({
				type: FIREFLY_MAIN_VIEW_TYPE,
				state: { areaId },
				active: true,
			});
			this.app.workspace.revealLeaf(targetLeaf);
			this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
			return;
		}

		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: FIREFLY_MAIN_VIEW_TYPE,
			state: { areaId },
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
	}

	async openFireflyMainView(): Promise<void> {
		const areaId = this.areaManager.getCurrentAreaId();
		await this.openAreaView(areaId);
	}

	async openFireflySidebar(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(FIREFLY_SIDEBAR_VIEW_TYPE)
			.concat(this.app.workspace.getLeavesOfType(FIREFLY_FILE_BROWSER_VIEW_TYPE_LEGACY));
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]!);
			return;
		}
		const leaf = this.app.workspace.getLeftLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: FIREFLY_SIDEBAR_VIEW_TYPE, active: true });
	}

	async openFireflyInnerSidebar(): Promise<void> {
		return this.openFireflySidebar();
	}

	async openFireflyFileBrowser(): Promise<void> {
		return this.openFireflySidebar();
	}

	async openPlotGridDetails(): Promise<PlotGridDetailsView | null> {
		const existing = this.app.workspace.getLeavesOfType(FIREFLY_PLOTGRID_DETAILS_VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]!);
			return existing[0]!.view as PlotGridDetailsView;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return null;
		await leaf.setViewState({ type: FIREFLY_PLOTGRID_DETAILS_VIEW_TYPE, active: true });
		return leaf.view as PlotGridDetailsView;
	}

	getPlotGridDetailsView(): PlotGridDetailsView | null {
		const leaves = this.app.workspace.getLeavesOfType(FIREFLY_PLOTGRID_DETAILS_VIEW_TYPE);
		if (leaves.length > 0) return leaves[0]!.view as PlotGridDetailsView;
		return null;
	}

	closePlotGridDetails(): void {
		const leaves = this.app.workspace.getLeavesOfType(FIREFLY_PLOTGRID_DETAILS_VIEW_TYPE);
		for (const leaf of leaves) leaf.detach();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<FireflySettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
