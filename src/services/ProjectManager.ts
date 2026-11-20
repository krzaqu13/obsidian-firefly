import type FireflyPlugin from '../main';
import type { FireflyProject, ProjectsData } from '../models/Project';

const PROJECTS_KEY = 'firefly-projects';

export class ProjectManager {
	private plugin: FireflyPlugin;
	private data: ProjectsData;

	constructor(plugin: FireflyPlugin) {
		this.plugin = plugin;
		this.data   = this.load();
	}

	// ── Read ───────────────────────────────────────────────────────

	getProjects(): FireflyProject[] {
		return this.data.projects;
	}

	getActiveProject(): FireflyProject | null {
		if (!this.data.activeProjectId) return null;
		return this.data.projects.find(p => p.id === this.data.activeProjectId) ?? null;
	}

	// ── Write ──────────────────────────────────────────────────────

	setActiveProject(id: string): void {
		this.data.activeProjectId = id;
		this.save();
		this.plugin.app.workspace.trigger('firefly:project-changed' as any, id);
	}

	addProject(project: FireflyProject): void {
		this.data.projects.push(project);
		if (!this.data.activeProjectId) this.data.activeProjectId = project.id;
		this.save();
	}

	updateProject(id: string, patch: Partial<FireflyProject>): void {
		const idx = this.data.projects.findIndex(p => p.id === id);
		if (idx === -1) return;
		this.data.projects[idx] = { ...this.data.projects[idx]!, ...patch };
		this.save();
	}

	deleteProject(id: string): void {
		this.data.projects = this.data.projects.filter(p => p.id !== id);
		if (this.data.activeProjectId === id) {
			this.data.activeProjectId = this.data.projects[0]?.id ?? null;
		}
		this.save();
	}

	// ── Persistence ────────────────────────────────────────────────

	private load(): ProjectsData {
		try {
			const raw = window.localStorage.getItem(PROJECTS_KEY);
			if (raw) return JSON.parse(raw) as ProjectsData;
		} catch { /* ignore */ }
		return { projects: [], activeProjectId: null };
	}

	private save(): void {
		try {
			window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(this.data));
		} catch { /* ignore */ }
	}
}
