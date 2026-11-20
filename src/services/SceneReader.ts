import { App, TFile } from 'obsidian';
import type FireflyPlugin from '../main';
import type { Scene } from '../models/Scene';

export class SceneReader {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	getAllScenes(plugin: FireflyPlugin): Scene[] {
		// Guard: brak projektu lub brak folderu → nie szukaj
		const project = plugin.projectManager.getActiveProject();
		if (!project?.rootFolder) return [];

		const root  = project.rootFolder.replace(/\\/g, '/').replace(/\/$/, '');
		const files = this.app.vault.getMarkdownFiles()
			.filter(f => f.path.startsWith(root + '/'));

		const scenes: Scene[] = [];

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm    = cache?.frontmatter;
			if (!fm || !this.isSceneFrontmatter(fm)) continue;

			scenes.push(this.parseScene(file.path, file.basename, fm));
		}

		return scenes.sort((a, b) => {
			const na = this.normalizeAct(a.act);
			const nb = this.normalizeAct(b.act);
			if (na !== nb) return na - nb;
			return (a.sequence ?? 999) - (b.sequence ?? 999);
		});
	}

	normalizeAct(act?: number | string): number {
		if (act === undefined || act === null) return 999;
		if (typeof act === 'number') return act;
		const n = parseFloat(act);
		return isNaN(n) ? 999 : n;
	}

	openScene(filePath: string, newLeaf = false): void {
		this.app.workspace.openLinkText(filePath, '', newLeaf);
	}

	/**
	 * Sprawdza czy plik reprezentuje scenę.
	 * Kompatybilny z Firefly (type: scene) oraz Radial Timeline (Class: Scene).
	 */
	isSceneFrontmatter(fm: Record<string, unknown>): boolean {
		const classVal = this.getString(fm, ['class', 'Class']);
		if (classVal) {
			const lowerClass = classVal.toLowerCase().trim();
			if (lowerClass === 'scene' || lowerClass === 'scena') return true;
			// Jeśli Class jest jawnie czymś innym (Beat, Backdrop, itp.), to nie scena
			if (['beat', 'backdrop', 'character', 'location', 'place', 'worldbuilding', 'database'].includes(lowerClass)) {
				return false;
			}
		}

		const typeVal = this.getString(fm, ['type', 'Type', 'Typ Notatki', 'typ notatki', 'typ', 'Typ']);
		if (typeVal) {
			const lowerType = typeVal.toLowerCase().trim();
			if (lowerType === 'scene' || lowerType === 'scena') return true;
		}

		// Obsługa tablic (np. Type: [scene, draft])
		const classArray = this.getValue(fm, ['class', 'Class']);
		if (Array.isArray(classArray) && classArray.some(c => String(c).toLowerCase().trim() === 'scene')) {
			return true;
		}
		const typeArray = this.getValue(fm, ['type', 'Type']);
		if (Array.isArray(typeArray) && typeArray.some(t => String(t).toLowerCase().trim() === 'scene')) {
			return true;
		}

		// Heurystyka: jeśli Class/Type są puste, ale plik posiada charakterystyczne pola sceny
		const hasActOrChapter = fm['Act'] !== undefined || fm['act'] !== undefined || fm['Chapter'] !== undefined || fm['chapter'] !== undefined;
		const hasSceneKeys = fm['Subplot'] !== undefined || fm['subplot'] !== undefined ||
			fm['Pending Edits'] !== undefined || fm['pending edits'] !== undefined ||
			fm['Reader Emotion'] !== undefined || fm['reader emotion'] !== undefined ||
			fm['Questions'] !== undefined || fm['questions'] !== undefined ||
			fm['Shift'] !== undefined || fm['shift'] !== undefined;

		return Boolean(hasActOrChapter && hasSceneKeys);
	}

	/**
	 * Parsuje obiekt frontmatter do modelu Scene.
	 */
	parseScene(filePath: string, basename: string, fm: Record<string, unknown>): Scene {
		const id = this.getString(fm, ['id', 'ID', 'sceneId', 'scene_id']);
		const rawAct = this.getValue(fm, ['act', 'Act']);
		const rawChapter = this.getValue(fm, ['chapter', 'Chapter', 'Rozdział', 'rozdział']);

		let sequence = this.getNumber(fm, ['sequence', 'Sequence', 'scenenumber', 'Scene Number', 'order']);
		if (sequence === undefined && id !== undefined && !isNaN(Number(id))) {
			sequence = Number(id);
		}
		if (sequence === undefined) {
			const prefixMatch = basename.match(/^(\d+)(?:[.\s_-]|$)/);
			if (prefixMatch && prefixMatch[1]) {
				sequence = parseInt(prefixMatch[1], 10);
			}
		}

		const rawStatus = this.getString(fm, ['status', 'Status']) ?? 'idea';
		const pov = this.getString(fm, ['pov', 'POV']);
		const characters = this.getStringArray(fm, ['characters', 'Characters', 'character', 'Character', 'Postacie', 'postacie']);
		const location = this.getString(fm, ['location', 'Location', 'place', 'Place', 'Lokacja', 'lokacja', 'Miejsce', 'miejsce']);
		const conflict = this.getString(fm, ['conflict', 'Conflict', 'Konflikt', 'konflikt']);
		const shift = this.getString(fm, ['shift', 'Shift']);
		const emotion = this.getString(fm, ['emotion', 'Emotion', 'Reader Emotion', 'reader emotion', 'readerEmotion', 'Emocje', 'emocje']);
		const intensity = this.getNumber(fm, ['intensity', 'Intensity', 'intensywność', 'Intensywność']);
		const wordcount = this.getNumber(fm, ['wordcount', 'words', 'Words', 'Wordcount', 'wordCount']);
		const charcount = this.getNumber(fm, ['charcount', 'chars', 'Chars', 'znaków']);
		const targetWordcount = this.getNumber(fm, ['target_wordcount', 'target_words', 'targetWordCount', 'target']);
		const tags = this.getStringArray(fm, ['tags', 'Tags']);
		const subplots = this.getStringArray(fm, ['subplots', 'Subplots', 'subplot', 'Subplot', 'Watki', 'wątki']);
		const rawBeat = this.getString(fm, ['beat', 'Beat']);
		let beat: string | undefined;
		if (rawBeat) {
			const aliasMatch = rawBeat.match(/\[\[.*?\|(.*?)\]\]/);
			if (aliasMatch?.[1]) beat = aliasMatch[1].trim();
			else {
				const bareMatch = rawBeat.match(/\[\[(.*?)\]\]/);
				if (bareMatch?.[1]) {
					const parts = bareMatch[1].split('/');
					beat = (parts[parts.length - 1] ?? bareMatch[1]).trim();
				} else {
					beat = rawBeat.trim();
				}
			}
		}
		const synopsis = this.getString(fm, ['synopsis', 'Synopsis']);
		const summary = this.getString(fm, ['summary', 'Summary']);
		const pendingEdits = this.getString(fm, ['pending edits', 'Pending Edits', 'pendingEdits']);
		const questions = this.getStringOrArray(fm, ['questions', 'Questions', 'Pytania', 'pytania']);
		const iteration = this.getNumber(fm, ['iteration', 'Iteration', 'iterations', 'Iterations', 'revision', 'Revision']);
		const when = this.getString(fm, ['when', 'When', 'date', 'Date', 'Data', 'data', 'storyDate', 'story_date']);
		const storyTime = this.getString(fm, ['storyTime', 'story_time', 'time', 'Time']);
		const subtitle = this.getString(fm, ['subtitle', 'Subtitle', 'podtytuł', 'Podtytuł']);
		const chronologicalOrder = this.getValue(fm, ['chronological_order', 'chronologicalOrder', 'chrono', 'Chrono', 'order']);
		const timelineMode = this.getString(fm, ['timeline_mode', 'timelineMode', 'mode']);
		const timelineStrand = this.getString(fm, ['timeline_strand', 'timelineStrand', 'strand']);
		const arcAnchor = Boolean(this.getValue(fm, ['arcAnchor', 'arc_anchor', 'arcPoint', 'arc_point']));
		const inactive = Boolean(this.getValue(fm, ['inactive', 'Inactive', 'nieaktywna', 'Nieaktywna']));
		const payoffScenes = this.getStringArray(fm, ['payoff_scenes', 'payoffScenes', 'payoffs', 'sets_up', 'setsUp']);
		const setupScenes = this.getStringArray(fm, ['setup_scenes', 'setupScenes', 'setups', 'set_up_by', 'setUpBy']);
		const notes = this.getString(fm, ['notes', 'Notes', 'notatki', 'Notatki', 'comments', 'Comments']);

		return {
			filePath,
			title: this.getString(fm, ['title', 'Title']) ?? basename,
			subtitle,
			id,
			sceneClass: this.getString(fm, ['class', 'Class']),
			act: typeof rawAct === 'number' || typeof rawAct === 'string' ? rawAct : undefined,
			chapter: typeof rawChapter === 'number' || typeof rawChapter === 'string' ? rawChapter : undefined,
			sequence,
			chronologicalOrder: typeof chronologicalOrder === 'number' || typeof chronologicalOrder === 'string' ? chronologicalOrder : undefined,
			pov,
			characters,
			location,
			status: rawStatus.toLowerCase().trim(),
			conflict: conflict ?? shift,
			shift,
			emotion,
			intensity,
			wordcount,
			charcount,
			target_wordcount: targetWordcount,
			tags,
			subplots,
			beat,
			synopsis: synopsis ?? summary,
			summary,
			pendingEdits,
			questions,
			iteration,
			when,
			date: when,
			storyDate: when,
			storyTime,
			timeline_mode: timelineMode,
			timeline_strand: timelineStrand,
			arcAnchor,
			inactive,
			payoff_scenes: payoffScenes,
			setup_scenes: setupScenes,
			notes,
		};
	}

	getSceneByPath(plugin: FireflyPlugin, filePath: string): Scene | null {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return null;
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter ?? {};
		return this.parseScene(file.path, file.basename, fm);
	}

	async readSceneBody(filePath: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return '';
		const content = await this.app.vault.read(file);
		const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
		return match ? match[1] || '' : content;
	}

	async writeSceneBody(filePath: string, newBody: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return;
		await this.app.vault.process(file, (content) => {
			const match = content.match(/^(---\r?\n[\s\S]*?\r?\n---)(\r?\n?[\s\S]*)$/);
			if (match) {
				const frontmatterPart = match[1];
				return `${frontmatterPart}\n\n${newBody.trimStart()}`;
			}
			return newBody;
		});
	}

	async updateScene(filePath: string, updates: Partial<Scene>): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return;

		if (updates.body !== undefined) {
			await this.writeSceneBody(filePath, updates.body);
		}

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (updates.title !== undefined) fm['title'] = updates.title;
			if (updates.subtitle !== undefined) {
				if (updates.subtitle) fm['subtitle'] = updates.subtitle;
				else delete fm['subtitle'];
			}
			if (updates.act !== undefined) {
				if (updates.act !== undefined && updates.act !== '') fm['act'] = updates.act;
				else delete fm['act'];
			}
			if (updates.chapter !== undefined) {
				if (updates.chapter !== undefined && updates.chapter !== '') fm['chapter'] = updates.chapter;
				else delete fm['chapter'];
			}
			if (updates.sequence !== undefined) {
				if (typeof updates.sequence === 'number' && !isNaN(updates.sequence)) fm['sequence'] = updates.sequence;
				else delete fm['sequence'];
			}
			if (updates.chronologicalOrder !== undefined) {
				if (updates.chronologicalOrder !== undefined && updates.chronologicalOrder !== '') {
					fm['chronological_order'] = updates.chronologicalOrder;
				} else {
					delete fm['chronological_order'];
				}
			}
			if (updates.status !== undefined) {
				if ('Status' in fm) {
					fm['Status'] = updates.status;
				} else {
					fm['status'] = updates.status;
				}
			}
			if (updates.pov !== undefined) {
				if (updates.pov) fm['pov'] = updates.pov;
				else delete fm['pov'];
			}
			if (updates.characters !== undefined) {
				if (updates.characters && updates.characters.length > 0) fm['characters'] = updates.characters;
				else delete fm['characters'];
			}
			if (updates.location !== undefined) {
				if (updates.location) fm['location'] = updates.location;
				else delete fm['location'];
			}
			if (updates.timeline_mode !== undefined) {
				if (updates.timeline_mode) fm['timeline_mode'] = updates.timeline_mode;
				else delete fm['timeline_mode'];
			}
			if (updates.timeline_strand !== undefined) {
				if (updates.timeline_strand) fm['timeline_strand'] = updates.timeline_strand;
				else delete fm['timeline_strand'];
			}
			if (updates.arcAnchor !== undefined) {
				if (updates.arcAnchor) fm['arcAnchor'] = true;
				else delete fm['arcAnchor'];
			}
			if (updates.inactive !== undefined) {
				if (updates.inactive) fm['inactive'] = true;
				else delete fm['inactive'];
			}
			if (updates.when !== undefined || updates.storyDate !== undefined) {
				const dateVal = updates.when ?? updates.storyDate;
				if (dateVal) fm['when'] = dateVal;
				else delete fm['when'];
			}
			if (updates.storyTime !== undefined) {
				if (updates.storyTime) fm['storyTime'] = updates.storyTime;
				else delete fm['storyTime'];
			}
			if (updates.target_wordcount !== undefined) {
				if (updates.target_wordcount) fm['target_wordcount'] = updates.target_wordcount;
				else delete fm['target_wordcount'];
			}
			if (updates.tags !== undefined) {
				if (updates.tags && updates.tags.length > 0) fm['tags'] = updates.tags;
				else delete fm['tags'];
			}
			if (updates.synopsis !== undefined) {
				if (updates.synopsis) fm['synopsis'] = updates.synopsis;
				else delete fm['synopsis'];
			}
			if (updates.conflict !== undefined) {
				if (updates.conflict) fm['conflict'] = updates.conflict;
				else delete fm['conflict'];
			}
			if (updates.emotion !== undefined) {
				if (updates.emotion) fm['emotion'] = updates.emotion;
				else delete fm['emotion'];
			}
			if (updates.intensity !== undefined) {
				if (typeof updates.intensity === 'number' && !isNaN(updates.intensity)) {
					fm['intensity'] = updates.intensity;
				} else {
					delete fm['intensity'];
				}
			}
			if (updates.payoff_scenes !== undefined) {
				if (updates.payoff_scenes && updates.payoff_scenes.length > 0) {
					fm['payoff_scenes'] = updates.payoff_scenes;
				} else {
					delete fm['payoff_scenes'];
				}
			}
			if (updates.setup_scenes !== undefined) {
				if (updates.setup_scenes && updates.setup_scenes.length > 0) {
					fm['setup_scenes'] = updates.setup_scenes;
				} else {
					delete fm['setup_scenes'];
				}
			}
			if (updates.notes !== undefined) {
				if (updates.notes) fm['notes'] = updates.notes;
				else delete fm['notes'];
			}
		});
	}

	async deleteScene(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			await this.app.vault.trash(file, true);
		}
	}

	getAllCharacters(plugin: FireflyPlugin): string[] {
		const scenes = this.getAllScenes(plugin);
		const set = new Set<string>();
		for (const s of scenes) {
			if (s.pov) set.add(s.pov);
			if (s.characters) {
				for (const c of s.characters) set.add(c);
			}
		}
		return Array.from(set).sort();
	}

	getAllLocations(plugin: FireflyPlugin): string[] {
		const scenes = this.getAllScenes(plugin);
		const set = new Set<string>();
		for (const s of scenes) {
			if (s.location) set.add(s.location);
		}
		return Array.from(set).sort();
	}

	getAllTags(plugin: FireflyPlugin): string[] {
		const scenes = this.getAllScenes(plugin);
		const set = new Set<string>();
		for (const s of scenes) {
			if (s.tags) {
				for (const t of s.tags) set.add(t);
			}
		}
		return Array.from(set).sort();
	}

	// ── Pomocnicze funkcje ekstrakcji ────────────────────────────

	stripWikiLinks(val: string): string {
		if (!val) return '';
		return val.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').trim();
	}

	getValue(fm: Record<string, unknown>, keys: string[]): unknown {
		for (const key of keys) {
			if (fm[key] !== undefined && fm[key] !== null) return fm[key];
		}
		// Fallback case-insensitive / bez spacji i podkreśleń
		const lowerMap = new Map<string, unknown>();
		for (const [k, v] of Object.entries(fm)) {
			lowerMap.set(k.toLowerCase().replace(/[\s_-]/g, ''), v);
		}
		for (const key of keys) {
			const normKey = key.toLowerCase().replace(/[\s_-]/g, '');
			const val = lowerMap.get(normKey);
			if (val !== undefined && val !== null) return val;
		}
		return undefined;
	}

	getString(fm: Record<string, unknown>, keys: string[]): string | undefined {
		const raw = this.getValue(fm, keys);
		if (raw === undefined || raw === null) return undefined;
		if (typeof raw === 'string') {
			const str = this.stripWikiLinks(raw).trim();
			return str.length > 0 ? str : undefined;
		}
		if (Array.isArray(raw)) {
			const list = raw
				.map(item => this.stripWikiLinks(typeof item === 'string' ? item : String(item)).trim())
				.filter(Boolean);
			return list.length > 0 ? list.join(', ') : undefined;
		}
		const fallback = String(raw).trim();
		return fallback.length > 0 ? fallback : undefined;
	}

	getStringArray(fm: Record<string, unknown>, keys: string[]): string[] | undefined {
		const raw = this.getValue(fm, keys);
		if (!raw) return undefined;
		if (Array.isArray(raw)) {
			const list = raw
				.map(item => this.stripWikiLinks(typeof item === 'string' ? item : String(item)).trim())
				.filter(Boolean);
			return list.length > 0 ? list : undefined;
		}
		if (typeof raw === 'string') {
			const list = raw
				.split(',')
				.map(item => this.stripWikiLinks(item).trim())
				.filter(Boolean);
			return list.length > 0 ? list : undefined;
		}
		return undefined;
	}

	getStringOrArray(fm: Record<string, unknown>, keys: string[]): string | string[] | undefined {
		const raw = this.getValue(fm, keys);
		if (!raw) return undefined;
		if (Array.isArray(raw)) {
			const list = raw
				.map(item => this.stripWikiLinks(typeof item === 'string' ? item : String(item)).trim())
				.filter(Boolean);
			return list.length > 0 ? list : undefined;
		}
		if (typeof raw === 'string') {
			const trimmed = this.stripWikiLinks(raw).trim();
			return trimmed.length > 0 ? trimmed : undefined;
		}
		return undefined;
	}

	getNumber(fm: Record<string, unknown>, keys: string[]): number | undefined {
		const raw = this.getValue(fm, keys);
		if (raw === undefined || raw === null || raw === '') return undefined;
		if (typeof raw === 'number') return isNaN(raw) ? undefined : raw;
		const parsed = parseFloat(String(raw));
		return isNaN(parsed) ? undefined : parsed;
	}
}
