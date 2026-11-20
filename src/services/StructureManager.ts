import type FireflyPlugin from '../main';
import type { StructureProfile } from '../models/StructureProfile';
import type { TFile } from 'obsidian';
import { createDefaultStructureSettings, createProfileFromPreset, ALL_STRUCTURE_PRESETS } from '../models/StructurePresets';

export interface StructurePlanEntry {
	path: string;
	kind: 'folder' | 'beat' | 'arc' | 'subplot';
	name: string;
	frontmatter?: Record<string, string | string[] | number | null>;
}

export class StructureManager {
	private plugin: FireflyPlugin;
	private syncTimer: number | null = null;

	constructor(plugin: FireflyPlugin) {
		this.plugin = plugin;
		if (!this.plugin.settings.projectStructure) {
			this.plugin.settings.projectStructure = createDefaultStructureSettings();
		}
	}

	getProfiles(): StructureProfile[] {
		return this.plugin.settings.projectStructure?.profiles ?? [];
	}

	getActiveProfile(): StructureProfile | undefined {
		const settings = this.plugin.settings.projectStructure ?? createDefaultStructureSettings();
		this.plugin.settings.projectStructure = settings;
		const projectProfileId = this.plugin.projectManager.getActiveProject()?.structureProfileId;
		return settings.profiles.find(profile => profile.id === projectProfileId)
			?? settings.profiles.find(profile => profile.id === settings.activeProfileId)
			?? settings.profiles[0];
	}

	setActiveProfile(profileId: string): StructureProfile | undefined {
		const settings = this.plugin.settings.projectStructure ?? createDefaultStructureSettings();
		const found = settings.profiles.find(profile => profile.id === profileId);
		if (!found) return undefined;
		settings.activeProfileId = found.id;
		this.plugin.settings.projectStructure = settings;
		const activeProject = this.plugin.projectManager.getActiveProject();
		if (activeProject) {
			this.plugin.projectManager.updateProject(activeProject.id, { structureProfileId: found.id });
		}
		return found;
	}

	mapExistingBeatFiles(profile = this.getActiveProfile()): number {
		const project = this.plugin.projectManager.getActiveProject();
		if (!project?.rootFolder || !profile) return 0;
		const root = this.normalizePath(project.rootFolder);
		const rootPrefix = `${root.toLocaleLowerCase()}/`;
		const beatFolder = `${root}/${profile.folders.beats}`.toLocaleLowerCase();
		const files = this.plugin.app.vault.getMarkdownFiles().filter(file =>
			this.normalizePath(file.path).toLocaleLowerCase().startsWith(rootPrefix)
				&& (this.normalizePath(file.path).toLocaleLowerCase().startsWith(`${beatFolder}/`) || this.isBeatFile(file)),
		);
		const used = new Set<string>();
		const beats = [...profile.beats].sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999));
		let mapped = 0;

		for (let index = 0; index < beats.length; index++) {
			const beat = beats[index]!;
			const order = beat.order ?? index + 1;
			const expected = this.normalizeBeatName(profile.naming.beatPattern
				.replace('{order}', String(order).padStart(profile.naming.orderPadding || 2, '0'))
				.replace('{name}', beat.name));
			const match = files.find(file => {
				if (used.has(file.path)) return false;
				const fm = this.getFrontmatter(file);
				const fileOrder = this.readNumber(fm, ['Order', 'order', 'Sequence', 'sequence']);
				const basename = this.normalizeBeatName(file.basename);
				const title = this.normalizeBeatName(this.readText(fm, ['Title', 'title', 'Name', 'name']) ?? file.basename);
				if (fileOrder !== undefined && fileOrder === order) return true;
				if (basename === expected || title === expected) return true;
				const baseOrder = this.extractLeadingOrder(file.basename);
				return baseOrder === order && (this.isBeatFile(file) || this.normalizePath(file.path).toLocaleLowerCase().startsWith(`${beatFolder}/`));
			});
			if (!match) continue;
			used.add(match.path);
			beat.sourcePath = match.path;
			this.syncBeatFromFile(beat, match);
			mapped++;
		}

		if (mapped > 0) {
			this.syncLoadedStoryBeats(profile, true);
			void this.plugin.saveSettings();
		}
		return mapped;
	}

	scheduleMappedBeatSync(changedFile?: TFile, oldPath?: string, deleted = false): void {
		if (this.syncTimer !== null) window.clearTimeout(this.syncTimer);
		this.syncTimer = window.setTimeout(() => {
			this.syncTimer = null;
			this.syncMappedBeatFiles(changedFile, oldPath, deleted);
		}, 120);
	}

	private syncMappedBeatFiles(changedFile?: TFile, oldPath?: string, deleted = false): void {
		const project = this.plugin.projectManager.getActiveProject();
		const profile = this.getActiveProfile();
		if (!project?.rootFolder || !profile) return;
		const rootPrefix = `${this.normalizePath(project.rootFolder).toLocaleLowerCase()}/`;
		const changedPath = changedFile ? this.normalizePath(changedFile.path) : undefined;
		const oldNormalized = oldPath ? this.normalizePath(oldPath) : undefined;
		let changed = false;

		for (const beat of profile.beats) {
			if (!beat.sourcePath) continue;
			let sourcePath = this.normalizePath(beat.sourcePath);
			if (oldNormalized && sourcePath.toLocaleLowerCase() === oldNormalized.toLocaleLowerCase()) {
				if (deleted || !changedPath?.toLocaleLowerCase().startsWith(rootPrefix)) {
					delete beat.sourcePath;
					changed = true;
					continue;
				}
				sourcePath = changedPath;
				beat.sourcePath = changedPath;
				changed = true;
			}
			if (changedPath && sourcePath.toLocaleLowerCase() !== changedPath.toLocaleLowerCase()) continue;
			const file = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
			if (!file || !('extension' in file)) continue;
			if (this.syncBeatFromFile(beat, file as TFile)) changed = true;
		}

		if (changed) {
			this.syncLoadedStoryBeats(profile, false);
			void this.plugin.saveSettings();
			this.plugin.app.workspace.trigger('firefly:beats-synced' as any, profile.id);
			this.plugin.app.workspace.trigger('firefly:project-changed' as any, project.id);
		}
	}

	private syncBeatFromFile(beat: StructureProfile['beats'][number], file: TFile): boolean {
		const fm = this.getFrontmatter(file);
		const title = this.readText(fm, ['Title', 'title', 'Name', 'name']) ?? file.basename.replace(/^\d+(?:\.\d+)?[.\s_-]*/, '').trim();
		const act = this.readNumber(fm, ['Act', 'act', 'Akt', 'akt']);
		const order = this.readNumber(fm, ['Order', 'order', 'Sequence', 'sequence']);
		const range = this.readText(fm, ['Range', 'range']);
		const purpose = this.readText(fm, ['Purpose', 'purpose']);
		let changed = false;
		if (title && beat.name !== title) { beat.name = title; changed = true; }
		if (act !== undefined && beat.act !== act) { beat.act = act; changed = true; }
		if (order !== undefined && beat.order !== order) { beat.order = order; changed = true; }
		if (range !== undefined && beat.range !== range) { beat.range = range; changed = true; }
		if (purpose !== undefined && beat.purpose !== purpose) { beat.purpose = purpose; changed = true; }
		return changed;
	}

	private syncLoadedStoryBeats(profile: StructureProfile, markCustom: boolean): void {
		const storyBeats = this.plugin.settings.storyBeats;
		if (!storyBeats) return;
		const tab = storyBeats.loadedTabs.find(item => item.tabId === storyBeats.activeTabId) ?? storyBeats.loadedTabs[0];
		if (!tab) return;
		let changed = false;
		for (const beat of profile.beats) {
			if (beat.enabled === false || !beat.sourcePath) continue;
			const storyBeat = tab.beats.find(item => item.id === beat.key)
				?? tab.beats[(beat.order ?? 1) - 1];
			if (storyBeat && storyBeat.name !== beat.name) {
				storyBeat.name = beat.name;
				changed = true;
			}
		}
		if (changed || markCustom) {
			tab.sourceKind = 'saved';
			tab.dirty = true;
		}
	}

	private getFrontmatter(file: TFile): Record<string, unknown> {
		return (this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
	}

	private isBeatFile(file: TFile): boolean {
		const fm = this.getFrontmatter(file);
		const rawClass = fm.Class ?? fm.class ?? fm.Type ?? fm.type ?? fm.Role ?? fm.role;
		const values = Array.isArray(rawClass) ? rawClass : [rawClass];
		return values.some(value => typeof value === 'string' && /^(story[-_ ]?beat|beat|beaty)$/i.test(value.trim()));
	}

	private readText(fm: Record<string, unknown>, keys: string[]): string | undefined {
		for (const key of keys) {
			const value = fm[key];
			if (typeof value === 'string' && value.trim()) return value.trim().replace(/^\[\[|\]\]$/g, '').split('|')[0]!.trim();
		}
		return undefined;
	}

	private readNumber(fm: Record<string, unknown>, keys: string[]): number | undefined {
		for (const key of keys) {
			const value = fm[key];
			const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
			if (Number.isFinite(number)) return number;
		}
		return undefined;
	}

	private normalizePath(path: string): string {
		return path.replace(/\\/g, '/').replace(/\/$/, '');
	}

	private normalizeBeatName(name: string): string {
		return name.trim().replace(/\.md$/i, '').replace(/^\d+(?:\.\d+)?[.\s_-]*/, '').replace(/\s+/g, ' ').toLocaleLowerCase();
	}

	private extractLeadingOrder(name: string): number | undefined {
		const match = name.match(/^(\d+)(?:[.\s_-]|$)/);
		return match?.[1] ? Number(match[1]) : undefined;
	}

	createProfileFromPreset(presetId: string): StructureProfile {
		const preset = ALL_STRUCTURE_PRESETS.find(item => item.id === presetId) ?? ALL_STRUCTURE_PRESETS[0];
		if (!preset) {
			throw new Error('Brak dostępnego presetów struktury.');
		}
		const profile = createProfileFromPreset(preset);
		const settings = this.plugin.settings.projectStructure ?? createDefaultStructureSettings();
		settings.profiles.push(profile);
		settings.activeProfileId = profile.id;
		this.plugin.settings.projectStructure = settings;
		return profile;
	}

	validateProfile(profile: StructureProfile): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		if (!profile.name.trim()) {
			errors.push('Nazwa profilu nie może być pusta.');
		}
		if (!profile.id.trim()) {
			errors.push('Id profilu jest wymagane.');
		}
		if (!profile.beats.length && profile.arcElements.length > 0) {
			errors.push('Profil z elementami arcu powinien mieć co najmniej jeden beat.');
		}
		for (const beat of profile.beats) {
			if (!beat.name.trim()) {
				errors.push('Każdy beat musi mieć nazwę.');
				break;
			}
		}
		for (const arc of profile.arcElements) {
			if (!arc.key.trim()) {
				errors.push('Każdy element arcu musi mieć klucz.');
				break;
			}
		}
		return {
			valid: errors.length === 0,
			errors,
		};
	}

	static getArcCharacterNames(characters: string[]): string[] {
		const cleaned = characters
			.map(name => StructureManager.normalizeName(name))
			.filter(Boolean);
		const roles = ['Protagonista', 'Antagonista'];
		return cleaned.slice(0, 2).map((_, index) => roles[index] ?? cleaned[index] ?? '');
	}

	static resolveProjectRoot(projectTitle: string, rootFolder?: string): string {
		const baseRoot = rootFolder?.trim() || projectTitle?.trim() || 'Nowa książka';
		return StructureManager.normalizeName(baseRoot);
	}

	buildPlan(profile: StructureProfile, projectTitle: string, characters: string[] = [], rootFolder?: string): StructurePlanEntry[] {
		const root = StructureManager.resolveProjectRoot(projectTitle, rootFolder);
		const entries: StructurePlanEntry[] = [
			{ path: `${root}/${profile.folders.beats}`, kind: 'folder', name: profile.folders.beats },
			{ path: `${root}/${profile.folders.scenes}`, kind: 'folder', name: profile.folders.scenes },
			{ path: `${root}/${profile.folders.arcs}`, kind: 'folder', name: profile.folders.arcs },
			{ path: `${root}/${profile.folders.subplots}`, kind: 'folder', name: profile.folders.subplots },
		];

		for (const beat of profile.beats.filter(item => item.enabled !== false)) {
			const order = String(beat.order ?? 1).padStart(profile.naming.orderPadding || 2, '0');
			const generatedName = profile.naming.beatPattern
				.replace('{order}', order)
				.replace('{name}', StructureManager.normalizeName(beat.name));
			entries.push({
				path: `${root}/${profile.folders.beats}/${generatedName}.md`,
				kind: 'beat',
				name: generatedName,
				frontmatter: {
					Class: 'Beat',
					'Beat Model': 'Story Beat',
					Act: beat.act,
					Range: beat.range ?? '',
					Order: beat.order ?? 1,
					Purpose: beat.purpose ?? '',
					Arc: [],
				},
			});
		}

		for (const character of StructureManager.getArcCharacterNames(characters)) {
			if (!character) continue;
			entries.push({
				path: `${root}/${profile.folders.arcs}/Arc - ${character}.md`,
				kind: 'arc',
				name: `Arc - ${character}`,
				frontmatter: {
					Class: 'Arc',
					Character: character,
					Color: '',
					Lie: '',
					Truth: '',
					Want: '',
					Need: '',
					Ghost: [],
					LieActive: [],
					LieTested: [],
					TruthContact: [],
					TruthAccepted: [],
				},
			});
		}

		return entries;
	}

	async generateProjectFiles(profile: StructureProfile, projectTitle: string, characters: string[] = [], rootFolder?: string): Promise<{ created: string[]; skipped: string[]; errors: string[] }> {
		const result = { created: [] as string[], skipped: [] as string[], errors: [] as string[] };
		const vault = this.plugin?.app?.vault;
		if (!vault) {
			result.skipped.push('Brak dostępu do vaultu w Obsidianie.');
			return result;
		}

		const plan = this.buildPlan(profile, projectTitle, characters, rootFolder);
		const folderPaths = [...new Set(plan.filter(entry => entry.kind === 'folder').map(entry => entry.path))];

		for (const folderPath of folderPaths) {
			const folder = vault.getAbstractFileByPath(folderPath);
			if (!folder) {
				try {
					await vault.createFolder(folderPath);
					result.created.push(folderPath);
				} catch (error) {
					result.skipped.push(`${folderPath} (folder exists or could not be created)`);
				}
			}
		}

		for (const entry of plan) {
			if (entry.kind === 'folder') continue;
			const fileExists = !!vault.getAbstractFileByPath(entry.path);
			if (fileExists) {
				result.skipped.push(`${entry.path} (plik już istnieje)`);
				continue;
			}
			try {
				await vault.create(entry.path, this.renderMarkdown(entry));
				result.created.push(entry.path);
			} catch (error) {
				result.errors.push(`${entry.path} (${String(error)})`);
			}
		}

		return result;
	}

	renderMarkdown(entry: StructurePlanEntry): string {
		const frontmatter = entry.frontmatter ?? {};
		const lines: string[] = ['---'];
		for (const [key, value] of Object.entries(frontmatter)) {
			if (Array.isArray(value)) {
				lines.push(`${key}: ${value.join(', ')}`);
				continue;
			}
			if (value === null || value === undefined || value === '') {
				lines.push(`${key}:`);
				continue;
			}
			lines.push(`${key}: ${String(value)}`);
		}
		lines.push('---');
		lines.push('');
		if (entry.kind === 'beat') {
			lines.push(`# ${entry.name}`);
			lines.push('');
			lines.push('## Purpose');
			lines.push((frontmatter.Purpose as string) || '');
		}
		if (entry.kind === 'arc') {
			lines.push(`# ${entry.name}`);
			lines.push('');
			lines.push('## Arc overview');
			lines.push('');
		}
		return lines.join('\n');
	}

	static normalizeName(value: string): string {
		return value.trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
	}

	static detectMixedScripts(value: string): boolean {
		const hasLatin = /[A-Za-z]/.test(value);
		const hasCyrillic = /[А-Яа-я]/.test(value);
		const hasOther = /[\u0400-\u04FF]/.test(value);
		return (hasLatin && hasCyrillic) || (hasLatin && hasOther) || (hasCyrillic && hasOther);
	}
}
