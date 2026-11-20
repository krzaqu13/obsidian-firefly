import { App, TFile } from 'obsidian';
import type FireflyPlugin from '../main';
import {
	SUBPLOT_COLORS,
	SUBPLOT_DASH_STYLES,
	type StoryBeat,
	type GraphScene,
	type BeatSegment,
	type StoryGraphData,
	type SubplotLine,
	type SubplotPoint,
	type GraphYMode,
} from '../models/StoryGraph';

// ── Stałe układu osi X ───────────────────────────────────────────────
const MIN_SCENE_GAP = 30; // minimalna odległość (px) między środkami sąsiednich scen
const MIN_BEAT_WIDTH = 64; // minimalna szerokość beata (px)
const BEAT_SIDE_PADDING = 16; // boczny margines wewnątrz segmentu (px)

/**
 * Czyta i przetwarza pliki projektu (StoryBeat + Scene) do formatu StoryGraphData.
 * Wyjątkowo odporny na częściowy frontmatter, braki pól, różne konwencje nazewnictwa i formaty wikilinków.
 */
export class StoryGraphReader {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	// ── Główne wejście ────────────────────────────────────────────

	buildGraphData(plugin: FireflyPlugin, yMode: GraphYMode, containerPlotWidth?: number): StoryGraphData {
		const project = plugin.projectManager.getActiveProject();
		if (!project?.rootFolder) {
			return this.emptyData();
		}

		const root = project.rootFolder.replace(/\\/g, '/').replace(/\/$/, '');
		const files = this.app.vault.getMarkdownFiles()
			.filter(f => f.path.startsWith(root + '/'));

		const rawBeats: Array<{ file: TFile; fm: Record<string, unknown> }> = [];
		const rawScenes: Array<{ file: TFile; fm: Record<string, unknown> }> = [];

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;

			if (this.isBeatFile(file, fm)) {
				rawBeats.push({ file, fm });
			} else if (this.isSceneFile(file, fm)) {
				rawScenes.push({ file, fm });
			}
		}

		// Parsuj beaty
		const beats: StoryBeat[] = rawBeats.map(({ file, fm }) => this.parseBeat(file, fm));

		// Sortuj beaty: wg aktu, potem wg Order
		beats.sort((a, b) => (a.act !== b.act ? a.act - b.act : a.order - b.order));

		// Zbuduj indeks beatów do szybkiego i elastycznego linkowania ze scen
		const beatIndex = this.buildBeatIndex(beats);

		// Parsuj sceny i powiąż z beatami
		const scenes: GraphScene[] = [];
		const orphanedScenes: GraphScene[] = [];

		for (const { file, fm } of rawScenes) {
			const scene = this.parseScene(file, fm, beatIndex);
			if (scene.beat) {
				scenes.push(scene);
			} else {
				orphanedScenes.push(scene);
			}
		}

		// Sortuj sceny przypisane do beatów
		scenes.sort((a, b) => {
			const ba = a.beat!, bb = b.beat!;
			if (ba.act !== bb.act) return ba.act - bb.act;
			if (ba.order !== bb.order) return ba.order - bb.order;
			return a.order - b.order;
		});

		// Sortuj sceny bez beata wg aktu (jeśli mają) i orderu
		orphanedScenes.sort((a, b) => {
			const actA = a.act ?? 1;
			const actB = b.act ?? 1;
			if (actA !== actB) return actA - actB;
			return a.order - b.order;
		});

		// Jeśli brak beatów w ogóle, a są sceny: stwórz wirtualne segmenty, aby wykres nadal działał
		let segments: BeatSegment[] = [];
		let totalPlotWidth = containerPlotWidth ?? 800;

		if (beats.length === 0 && (scenes.length > 0 || orphanedScenes.length > 0)) {
			const fallback = this.buildFallbackSegments(orphanedScenes, yMode, containerPlotWidth);
			segments = fallback.segments;
			totalPlotWidth = fallback.plotWidth;
		} else {
			segments = this.buildSegments(beats, scenes, orphanedScenes);
			totalPlotWidth = this.assignPositions(segments, beats, yMode, containerPlotWidth);
		}

		// Połącz sceny do wyznaczenia linii subplotów
		const allScenesForSubplots = [...scenes, ...orphanedScenes];
		const subplotLines = this.buildSubplotLines(allScenesForSubplots, yMode);

		const acts = [
			...new Set([
				...beats.map(b => b.act),
				...scenes.map(s => s.act ?? s.beat?.act ?? 1),
				...orphanedScenes.map(s => s.act ?? 1),
			]),
		].sort((a, b) => a - b);

		if (acts.length === 0) acts.push(1);

		return {
			beats,
			scenes,
			orphanedScenes,
			segments,
			subplotLines,
			acts,
			totalPlotWidth,
		};
	}

	// ── Wykrywanie typu pliku (Beat vs Scene) ──────────────────────

	private isBeatFile(file: TFile, fm: Record<string, unknown>): boolean {
		const classVal = this.getStr(fm, ['Class', 'class', 'Type', 'type', 'Role', 'role'])?.toLowerCase() ?? '';
		if (
			classVal === 'storybeat' ||
			classVal === 'story beat' ||
			classVal === 'story-beat' ||
			classVal === 'story_beat' ||
			classVal === 'beat' ||
			classVal === 'beaty'
		) {
			return true;
		}

		// Obsługa tablic (np. Class: [StoryBeat])
		const rawClass = fm['Class'] ?? fm['class'] ?? fm['Type'] ?? fm['type'];
		if (Array.isArray(rawClass)) {
			if (rawClass.some(c => typeof c === 'string' && /^(story[-_ ]?beat|beat)$/i.test(c.trim()))) {
				return true;
			}
		}

		// Ścieżka pliku wskazuje na folder beatów
		const lowerPath = file.path.toLowerCase();
		if (
			lowerPath.includes('/beats/') ||
			lowerPath.includes('/storybeats/') ||
			lowerPath.includes('/story beats/') ||
			lowerPath.includes('/beaty/')
		) {
			return true;
		}

		// Heurystyka cech beata (np. ma StoryTension lub StoryPacing, ale nie ma Beat/Subplot)
		const hasBeatFields =
			fm['StoryTension'] !== undefined ||
			fm['storytension'] !== undefined ||
			fm['Story Tension'] !== undefined ||
			fm['StoryPacing'] !== undefined ||
			fm['storypacing'] !== undefined ||
			fm['Story Pacing'] !== undefined ||
			fm['Range'] !== undefined ||
			fm['Model'] !== undefined;

		const hasSceneFields =
			fm['Beat'] !== undefined ||
			fm['beat'] !== undefined ||
			fm['ScenePacing'] !== undefined ||
			fm['SubplotTension'] !== undefined;

		return Boolean(hasBeatFields && !hasSceneFields);
	}

	private isSceneFile(file: TFile, fm: Record<string, unknown>): boolean {
		// Jeśli to beat, to nie scena
		if (this.isBeatFile(file, fm)) return false;

		const classVal = this.getStr(fm, ['Class', 'class', 'Type', 'type'])?.toLowerCase() ?? '';
		if (
			classVal === 'scene' ||
			classVal === 'scena' ||
			classVal === 'draft' ||
			classVal === 'chapter' ||
			classVal === 'rozdział' ||
			classVal === 'rozdzial'
		) {
			return true;
		}

		const rawClass = fm['Class'] ?? fm['class'] ?? fm['Type'] ?? fm['type'];
		if (Array.isArray(rawClass)) {
			if (rawClass.some(c => typeof c === 'string' && /^(scene|scena|draft)$/i.test(c.trim()))) {
				return true;
			}
		}

		// Wyraźne pola sceny w frontmatterze
		const hasSceneKeys =
			fm['Beat'] !== undefined ||
			fm['beat'] !== undefined ||
			fm['Subplot'] !== undefined ||
			fm['subplot'] !== undefined ||
			fm['ScenePacing'] !== undefined ||
			fm['scenepacing'] !== undefined ||
			fm['SubplotTension'] !== undefined ||
			fm['subplottension'] !== undefined ||
			fm['SubplotPacing'] !== undefined ||
			fm['POV'] !== undefined ||
			fm['pov'] !== undefined ||
			fm['Chapter'] !== undefined ||
			fm['chapter'] !== undefined ||
			fm['Words'] !== undefined ||
			fm['words'] !== undefined ||
			fm['Sequence'] !== undefined ||
			fm['sequence'] !== undefined;

		if (hasSceneKeys) return true;

		// Ścieżka pliku
		const lowerPath = file.path.toLowerCase();
		if (
			lowerPath.includes('/scenes/') ||
			lowerPath.includes('/sceny/') ||
			lowerPath.includes('/manuscript/') ||
			lowerPath.includes('/manuskrypt/') ||
			lowerPath.includes('/chapters/') ||
			lowerPath.includes('/rozdzialy/')
		) {
			return true;
		}

		// Jeśli plik nie jest niczym innym i ma cokolwiek w frontmatterze
		const isExcluded =
			classVal.includes('character') ||
			classVal.includes('location') ||
			classVal.includes('place') ||
			classVal.includes('world') ||
			classVal.includes('backdrop') ||
			classVal.includes('note') ||
			classVal.includes('database');

		return !isExcluded && Object.keys(fm).length > 0;
	}

	// ── Parsowanie beata ──────────────────────────────────────────

	private parseBeat(file: TFile, fm: Record<string, unknown>): StoryBeat {
		const title = this.getStr(fm, ['Title', 'title', 'Name', 'name']) ?? file.basename;
		const act = this.parseAct(fm) ?? this.extractActFromPath(file.path) ?? 1;
		const order = this.getNum(fm, ['Order', 'order', 'Sequence', 'sequence']) ?? this.extractOrderFromBasename(file.basename);
		const storyTension = this.getNum(fm, ['StoryTension', 'storytension', 'Story Tension', 'tension', 'Tension', 'Napięcie', 'napięcie']) ?? 5;
		const storyPacing = this.getNum(fm, ['StoryPacing', 'storypacing', 'Story Pacing', 'pacing', 'Pacing', 'Tempo', 'tempo']) ?? 5;

		return {
			filePath: file.path,
			title,
			act,
			order,
			storyTension: Math.min(10, Math.max(1, storyTension)),
			storyPacing: Math.min(10, Math.max(1, storyPacing)),
			range: this.getStr(fm, ['Range', 'range', 'Zakres', 'zakres']),
			model: this.getStr(fm, ['Model', 'model']),
			synopsis: this.getStr(fm, ['Synopsis', 'synopsis', 'Summary', 'summary', 'Opis', 'opis']),
			status: this.getStr(fm, ['Status', 'status']),
		};
	}

	// ── Indeksowanie beatów do linkowania ─────────────────────────

	private buildBeatIndex(beats: StoryBeat[]): BeatIndex {
		const byPath = new Map<string, StoryBeat>();
		const byBasename = new Map<string, StoryBeat>();
		const byTitle = new Map<string, StoryBeat>();
		const byCleanName = new Map<string, StoryBeat>();
		const bySlug = new Map<string, StoryBeat>();

		for (const b of beats) {
			const lowerPath = b.filePath.toLowerCase().replace(/\\/g, '/');
			byPath.set(lowerPath, b);
			byPath.set(lowerPath.replace(/\.md$/, ''), b);

			const basename = (b.filePath.split('/').pop() ?? '').replace(/\.md$/, '').toLowerCase().trim();
			if (basename) {
				byBasename.set(basename, b);
				const cleanBase = this.stripNumberPrefix(basename);
				if (cleanBase) byCleanName.set(cleanBase, b);
				bySlug.set(this.toSlug(basename), b);
			}

			const titleLower = b.title.toLowerCase().trim();
			if (titleLower) {
				byTitle.set(titleLower, b);
				const cleanTitle = this.stripNumberPrefix(titleLower);
				if (cleanTitle) byCleanName.set(cleanTitle, b);
				bySlug.set(this.toSlug(titleLower), b);
			}
		}

		return { byPath, byBasename, byTitle, byCleanName, bySlug, allBeats: beats };
	}

	// ── Parsowanie sceny ──────────────────────────────────────────

	private parseScene(
		file: TFile,
		fm: Record<string, unknown>,
		beatIndex: BeatIndex,
	): GraphScene {
		const title = this.getStr(fm, ['Title', 'title', 'Name', 'name']) ?? file.basename;
		const order = this.getNum(fm, ['Order', 'order', 'sequence', 'Sequence', 'Numer', 'numer']) ?? this.extractOrderFromBasename(file.basename);

		// Linkowanie beata
		const { beat, beatTitle } = this.resolveBeat(file, fm, beatIndex);

		const subplot = this.extractSubplots(fm);
		const actVal = this.parseAct(fm) ?? beat?.act;
		const chapter = this.getStr(fm, ['Chapter', 'chapter', 'Rozdział', 'rozdział', 'Rozdzial', 'rozdzial']) ??
			this.getNum(fm, ['Chapter', 'chapter', 'Rozdział', 'rozdział']);

		const subplotTension = this.getNum(fm, ['SubplotTension', 'subplottension', 'Subplot Tension']);
		const subplotPacing = this.getNum(fm, ['SubplotPacing', 'subplotpacing', 'Subplot Pacing']);
		const scenePacing = this.getNum(fm, ['ScenePacing', 'scenepacing', 'Scene Pacing', 'Pacing', 'pacing']);

		return {
			filePath: file.path,
			title,
			beatTitle: beatTitle ?? beat?.title,
			beat,
			act: actVal,
			chapter,
			order,
			pov: this.getStr(fm, ['POV', 'pov', 'Narrator', 'narrator']),
			status: this.getStr(fm, ['Status', 'status']),
			subplot: subplot.length > 0 ? subplot : undefined,
			subplotTension: subplotTension !== undefined ? Math.min(10, Math.max(1, subplotTension)) : undefined,
			subplotPacing: subplotPacing !== undefined ? Math.min(10, Math.max(1, subplotPacing)) : undefined,
			scenePacing: scenePacing !== undefined ? Math.min(10, Math.max(1, scenePacing)) : undefined,
			synopsis: this.getStr(fm, ['Synopsis', 'synopsis', 'Summary', 'summary', 'Opis', 'opis']),
			words: this.getNum(fm, ['Words', 'words', 'wordcount', 'Wordcount', 'Słowa', 'słowa']),
		};
	}

	// ── Rozwiązywanie linku beata ──────────────────────────────────

	private resolveBeat(
		file: TFile,
		fm: Record<string, unknown>,
		beatIndex: BeatIndex,
	): { beat?: StoryBeat; beatTitle?: string } {
		const rawVal = fm['Beat'] ?? fm['beat'] ?? fm['StoryBeat'] ?? fm['storybeat'] ?? fm['story_beat'];
		const linkCandidates = this.extractLinkStrings(rawVal);

		for (const rawCandidate of linkCandidates) {
			const candidate = rawCandidate.trim();
			if (!candidate) continue;

			// 1. Sprawdź metadataCache czy link wskazuje na fizyczny plik
			const dest = this.app.metadataCache.getFirstLinkpathDest(candidate, file.path);
			if (dest) {
				const destPath = dest.path.toLowerCase().replace(/\\/g, '/');
				if (beatIndex.byPath.has(destPath)) {
					const b = beatIndex.byPath.get(destPath)!;
					return { beat: b, beatTitle: b.title };
				}
				const destBase = dest.basename.toLowerCase().trim();
				if (beatIndex.byBasename.has(destBase)) {
					const b = beatIndex.byBasename.get(destBase)!;
					return { beat: b, beatTitle: b.title };
				}
				const cleanDestBase = this.stripNumberPrefix(destBase);
				if (beatIndex.byCleanName.has(cleanDestBase)) {
					const b = beatIndex.byCleanName.get(cleanDestBase)!;
					return { beat: b, beatTitle: b.title };
				}
			}

			// 2. Bezpośrednie dopasowanie po nazwie / tytule
			const candLower = candidate.toLowerCase();
			if (beatIndex.byTitle.has(candLower)) {
				const b = beatIndex.byTitle.get(candLower)!;
				return { beat: b, beatTitle: b.title };
			}
			if (beatIndex.byBasename.has(candLower)) {
				const b = beatIndex.byBasename.get(candLower)!;
				return { beat: b, beatTitle: b.title };
			}

			// 3. Po usunięciu prefiksu numerycznego (np. "1.02 The Hook" → "The Hook")
			const cleanCand = this.stripNumberPrefix(candLower);
			if (cleanCand && beatIndex.byCleanName.has(cleanCand)) {
				const b = beatIndex.byCleanName.get(cleanCand)!;
				return { beat: b, beatTitle: b.title };
			}

			// 4. Slug (tylko litery i cyfry)
			const slug = this.toSlug(candidate);
			if (slug && beatIndex.bySlug.has(slug)) {
				const b = beatIndex.bySlug.get(slug)!;
				return { beat: b, beatTitle: b.title };
			}

			// 5. Dopasowanie częściowe (substring)
			for (const b of beatIndex.allBeats) {
				const bTitleClean = this.stripNumberPrefix(b.title.toLowerCase());
				if (cleanCand.length >= 3 && (bTitleClean.includes(cleanCand) || cleanCand.includes(bTitleClean))) {
					return { beat: b, beatTitle: b.title };
				}
			}

			// Jeśli beat ma tytuł, ale nie znaleziono dopasowania w bazie
			return { beatTitle: candidate };
		}

		return {};
	}

	// ── Segmenty i układ osi X ───────────────────────────────────

	private buildSegments(
		beats: StoryBeat[],
		scenes: GraphScene[],
		orphanedScenes: GraphScene[],
	): BeatSegment[] {
		const scenesByBeat = new Map<string, GraphScene[]>();
		for (const scene of scenes) {
			const key = scene.beat!.filePath;
			if (!scenesByBeat.has(key)) scenesByBeat.set(key, []);
			scenesByBeat.get(key)!.push(scene);
		}

		const segments: BeatSegment[] = [];
		for (const beat of beats) {
			segments.push({
				beat,
				scenes: scenesByBeat.get(beat.filePath) ?? [],
				xStart: 0,
				xEnd: 0,
				act: beat.act,
			});
		}

		// Przypisz osierocone sceny do dedykowanych segmentów na końcu każdego aktu,
		// dzięki czemu dostają one gwarantowany minimalny odstęp (min gap) i nie kolidują ze scenami beatów.
		if (orphanedScenes.length > 0) {
			const orphanedByAct = new Map<number, GraphScene[]>();
			for (const sc of orphanedScenes) {
				const actNum = sc.act ?? 1;
				if (!orphanedByAct.has(actNum)) orphanedByAct.set(actNum, []);
				orphanedByAct.get(actNum)!.push(sc);
			}

			for (const [actNum, actOrphaned] of orphanedByAct) {
				const virtualBeat: StoryBeat = {
					filePath: `__orphaned_act_${actNum}`,
					title: 'Bez beata',
					act: actNum,
					order: 99999,
					storyTension: 5,
					storyPacing: 5,
				};
				segments.push({
					beat: virtualBeat,
					scenes: actOrphaned,
					xStart: 0,
					xEnd: 0,
					act: actNum,
					isOrphaned: true,
				});
			}
		}

		segments.sort((a, b) => {
			if (a.act !== b.act) return a.act - b.act;
			return a.beat.order - b.beat.order;
		});

		return segments;
	}

	/**
	 * Buduje wirtualne segmenty gdy użytkownik nie stworzył jeszcze żadnych plików StoryBeat,
	 * ale ma już pliki scen. Zapobiega to pustemu stanowi i pozwala od razu oglądać sceny na osi czasu.
	 */
	private buildFallbackSegments(
		scenes: GraphScene[],
		yMode: GraphYMode,
		containerPlotWidth?: number,
	): { segments: BeatSegment[]; plotWidth: number } {
		if (scenes.length === 0) return { segments: [], plotWidth: containerPlotWidth ?? 800 };

		const acts = [...new Set(scenes.map(s => s.act ?? 1))].sort((a, b) => a - b);
		if (acts.length === 0) acts.push(1);

		const segments: BeatSegment[] = [];
		for (const actNum of acts) {
			const actScenes = scenes.filter(s => (s.act ?? 1) === actNum);
			const virtualBeat: StoryBeat = {
				filePath: `__virtual_act_${actNum}`,
				title: `Akt ${actNum}`,
				act: actNum,
				order: 1,
				storyTension: 5,
				storyPacing: 5,
			};
			segments.push({
				beat: virtualBeat,
				scenes: actScenes,
				xStart: 0,
				xEnd: 0,
				act: actNum,
			});
		}

		const plotWidth = Math.max(containerPlotWidth ?? 800, 300);
		const weights = segments.map(seg => (seg.scenes.length > 0 ? seg.scenes.length : 0.6));
		const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

		let cursorPx = 0;
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i]!;
			const w = (weights[i]! / totalWeight) * plotWidth;
			const segStartPx = cursorPx;
			cursorPx += w;

			seg.xStart = segStartPx / plotWidth;
			seg.xEnd = cursorPx / plotWidth;

			const n = seg.scenes.length;
			if (n === 1) {
				const sc = seg.scenes[0]!;
				sc.xNorm = (segStartPx + w / 2) / plotWidth;
				const val = yMode === 'tension' ? (sc.subplotTension ?? 5) : (sc.scenePacing ?? sc.subplotPacing ?? 5);
				sc.yInterp = val;
			} else if (n > 1) {
				const padding = Math.min(14, w / (n * 2 + 2));
				const step = (w - 2 * padding) / (n - 1);
				for (let j = 0; j < n; j++) {
					const sc = seg.scenes[j]!;
					sc.xNorm = (segStartPx + padding + j * step) / plotWidth;
					const val = yMode === 'tension' ? (sc.subplotTension ?? 5) : (sc.scenePacing ?? sc.subplotPacing ?? 5);
					sc.yInterp = val;
				}
			}
		}

		return { segments, plotWidth };
	}

	// ── Pozycje X/Y z proporcjonalnym układem (fit-to-screen) ─────

	private assignPositions(
		segments: BeatSegment[],
		beats: StoryBeat[],
		yMode: GraphYMode,
		containerPlotWidth?: number,
	): number {
		const plotWidth = Math.max(containerPlotWidth ?? 800, 300);
		if (segments.length === 0) return plotWidth;

		const weights = segments.map(seg => (seg.scenes.length > 0 ? seg.scenes.length : 0.6));
		const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

		let cursorPx = 0;
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i]!;
			const w = (weights[i]! / totalWeight) * plotWidth;
			const segStartPx = cursorPx;
			cursorPx += w;

			seg.xStart = segStartPx / plotWidth;
			seg.xEnd = cursorPx / plotWidth;

			const n = seg.scenes.length;
			if (n === 1) {
				const sc = seg.scenes[0]!;
				sc.xNorm = (segStartPx + w / 2) / plotWidth;
			} else if (n > 1) {
				const padding = Math.min(14, w / (n * 2 + 2));
				const step = (w - 2 * padding) / (n - 1);
				for (let j = 0; j < n; j++) {
					const sc = seg.scenes[j]!;
					sc.xNorm = (segStartPx + padding + j * step) / plotWidth;
				}
			}
		}

		// Interpoluj wartości Y na linii fabularnej dla scen w każdym segmencie
		for (const seg of segments) {
			const beatIdx = beats.indexOf(seg.beat);
			const prevBeat = beatIdx > 0 ? beats[beatIdx - 1]! : null;
			const nextBeat = (beatIdx >= 0 && beatIdx < beats.length - 1) ? beats[beatIdx + 1]! : null;

			for (const sc of seg.scenes) {
				const fraction = (seg.xEnd > seg.xStart) ? (sc.xNorm! - seg.xStart) / (seg.xEnd - seg.xStart) : 0.5;
				const currY = yMode === 'tension' ? seg.beat.storyTension : seg.beat.storyPacing;
				const prevY = prevBeat ? (yMode === 'tension' ? prevBeat.storyTension : prevBeat.storyPacing) : currY;
				const nextY = nextBeat ? (yMode === 'tension' ? nextBeat.storyTension : nextBeat.storyPacing) : currY;

				let yInterp: number;
				if (fraction <= 0.5) {
					yInterp = prevY + (currY - prevY) * (0.5 + fraction);
				} else {
					yInterp = currY + (nextY - currY) * (fraction - 0.5);
				}
				sc.yInterp = Math.min(10, Math.max(1, yInterp));
			}
		}

		return plotWidth;
	}

	// ── Subplot lines ─────────────────────────────────────────────

	private buildSubplotLines(scenes: GraphScene[], yMode: GraphYMode): SubplotLine[] {
		const subplotOrder: string[] = [];
		const subplotSet = new Set<string>();

		for (const scene of scenes) {
			for (const sp of scene.subplot ?? []) {
				if (!subplotSet.has(sp)) {
					subplotSet.add(sp);
					subplotOrder.push(sp);
				}
			}
		}

		return subplotOrder.map((name, idx) => {
			const color = SUBPLOT_COLORS[idx % SUBPLOT_COLORS.length]!;
			const dash = SUBPLOT_DASH_STYLES[idx % SUBPLOT_DASH_STYLES.length]!;

			const points: SubplotPoint[] = [];
			for (const scene of scenes) {
				if (!scene.subplot?.includes(name)) continue;
				const yRaw = yMode === 'tension' ? scene.subplotTension : scene.subplotPacing;
				// Używaj wartości fabularnej beata jako fallback, nie interpolowanej yInterp
				const beatValue = scene.beat ? (yMode === 'tension' ? scene.beat.storyTension : scene.beat.storyPacing) : 5;
				const yValue = yRaw ?? beatValue;
				points.push({
					scene,
					xNorm: scene.xNorm ?? 0.5,
					yValue: Math.min(10, Math.max(1, yValue)),
				});
			}

			// Sortuj punkty wg X
			points.sort((a, b) => a.xNorm - b.xNorm);

			return { name, color, dashStyle: dash, points };
		});
	}

	// ── Pomocnicze parsowania frontmatteru ─────────────────────────

	/**
	 * Rekurencyjnie wyciąga teksty linków / nazw z pól frontmatteru.
	 * Obsługuje stringi, wikilinki "[[Title]]", linki w cudzysłowach,
	 * oraz unquoted YAML np. Beat: [[Title]] który YAML parsuje jako [['Title']].
	 */
	private extractLinkStrings(val: unknown): string[] {
		if (!val) return [];
		const results: string[] = [];

		if (typeof val === 'string') {
			const trimmed = val.trim();
			if (!trimmed) return [];

			// Czy to wikilink [[...]]
			const wikiRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
			let match: RegExpExecArray | null;
			let foundWiki = false;
			while ((match = wikiRegex.exec(trimmed)) !== null) {
				foundWiki = true;
				if (match[1]?.trim()) results.push(match[1].trim());
			}

			if (!foundWiki) {
				// Czysty string bez nawiasów kwadratowych
				const clean = trimmed.replace(/^["']|["']$/g, '').trim();
				if (clean) results.push(clean);
			}
			return results;
		}

		if (Array.isArray(val)) {
			for (const item of val) {
				results.push(...this.extractLinkStrings(item));
			}
			return results;
		}

		if (typeof val === 'object' && val !== null) {
			const obj = val as Record<string, unknown>;
			if (obj['path'] && typeof obj['path'] === 'string') {
				results.push(...this.extractLinkStrings(obj['path']));
			} else if (obj['link'] && typeof obj['link'] === 'string') {
				results.push(...this.extractLinkStrings(obj['link']));
			}
		}

		return results;
	}

	private extractSubplots(fm: Record<string, unknown>): string[] {
		const raw = fm['Subplot'] ?? fm['subplot'] ?? fm['Subplots'] ?? fm['subplots'] ?? fm['Wątek'] ?? fm['wątek'] ?? fm['Wątki'] ?? fm['wątki'];
		if (!raw) return [];

		const items = this.extractLinkStrings(raw);
		const result: string[] = [];
		for (const it of items) {
			// Może być rozdzielone przecinkami np. "Romans, Kryminał"
			const parts = it.split(',').map(s => s.trim()).filter(Boolean);
			for (const p of parts) {
				if (!result.includes(p)) result.push(p);
			}
		}
		return result;
	}

	private parseAct(fm: Record<string, unknown>): number | undefined {
		const val = fm['Act'] ?? fm['act'] ?? fm['Akt'] ?? fm['akt'];
		if (typeof val === 'number' && !isNaN(val)) return val;
		if (typeof val === 'string') {
			const trimmed = val.trim();
			const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
			if (roman[trimmed.toLowerCase()]) return roman[trimmed.toLowerCase()];
			const m = trimmed.match(/\d+/);
			if (m) return parseInt(m[0]!, 10);
		}
		return undefined;
	}

	private extractActFromPath(path: string): number | undefined {
		const m = path.match(/(?:act|akt)[-_ ]?(\d+)/i);
		if (m) return parseInt(m[1]!, 10);
		return undefined;
	}

	private extractOrderFromBasename(basename: string): number {
		// "1.03 Title" → 3, "2.12 Title" → 12
		const m = basename.match(/^\d+\.(\d+)/);
		if (m) return parseFloat(m[1]!);
		// "03 Title" → 3
		const m2 = basename.match(/^(\d+)/);
		if (m2) return parseFloat(m2[1]!);
		return 1;
	}

	private stripNumberPrefix(str: string): string {
		return str.replace(/^\d+(\.\d+)?\s*[-–—:.]*\s*/, '').trim();
	}

	private toSlug(str: string): string {
		return str.toLowerCase().replace(/[^a-z0-9]/g, '');
	}

	private getStr(fm: Record<string, unknown>, keys: string[]): string | undefined {
		for (const k of keys) {
			const v = fm[k];
			if (typeof v === 'string' && v.trim()) return v.trim();
			if (typeof v === 'number' && !isNaN(v)) return String(v);
		}
		return undefined;
	}

	private getNum(fm: Record<string, unknown>, keys: string[]): number | undefined {
		for (const k of keys) {
			const v = fm[k];
			if (typeof v === 'number' && !isNaN(v)) return v;
			if (typeof v === 'string') {
				const n = parseFloat(v.replace(/,/g, '.'));
				if (!isNaN(n)) return n;
			}
		}
		return undefined;
	}

	private emptyData(): StoryGraphData {
		return { beats: [], scenes: [], orphanedScenes: [], segments: [], subplotLines: [], acts: [] };
	}
}

interface BeatIndex {
	byPath: Map<string, StoryBeat>;
	byBasename: Map<string, StoryBeat>;
	byTitle: Map<string, StoryBeat>;
	byCleanName: Map<string, StoryBeat>;
	bySlug: Map<string, StoryBeat>;
	allBeats: StoryBeat[];
}
