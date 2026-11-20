import { App, TFile, TFolder, normalizePath } from 'obsidian';
import type FireflyPlugin from '../main';
import type { FireflyProject } from '../models/Project';
import type { BeatDefinition } from '../models/StoryBeats';
import type { SavedBeatModel } from '../settings';
import { ALL_LIBRARY_ITEMS, BLANK_CUSTOM_BEATS } from '../models/StoryBeatsPresets';

export interface CreateBookOptions {
	title: string;
	parentFolder?: string;
	includeBeats: boolean;
	beatPresetId?: string;
	beatModelName?: string;
	customBeats?: BeatDefinition[];
	includeArcs: boolean;
	includeSubplots: boolean;
	includeMechanics: boolean;
	includeSecrets: boolean;
	includeScenes: boolean;
}

export interface FolderStatus {
	folderName: string;
	expectedPath: string;
	exists: boolean;
	fileCount: number;
}

export interface ClassAnalysis {
	className: string;
	folderExists: boolean;
	detectedFiles: number;
	filesMissingClass: number;
	existingAttributes: string[];
	expectedAttributes: string[];
	missingAttributes: string[];
}

export interface FolderInspectionReport {
	folderPath: string;
	exists: boolean;
	folderStatuses: FolderStatus[];
	classesAnalysis: Record<string, ClassAnalysis>;
	allDiscoveredAttributes: string[];
	detectedBeatModel?: string;
	detectedBeatDefinitions?: BeatDefinition[];
}

export interface ImportBookOptions {
	title: string;
	folderPath: string;
	createMissingFolders: boolean;
	assignMissingClass: boolean;
	attributeMappings: Record<string, Record<string, string>>;
	fillMissingAttributes: boolean;
	detectedBeatModel?: string;
	customBeats?: BeatDefinition[];
}

export const EXPECTED_CLASS_ATTRIBUTES: Record<string, string[]> = {
	Arc: ['Nazwa', 'Owner', 'Kolor', 'ColumnOrder', 'Stan'],
	Subplot: ['Nazwa', 'Kolor', 'ColumnOrder', 'Stan'],
	Beat: ['Act', 'Order', 'Nazwa', 'Opis', 'Stan'],
	Mechanic: ['Nazwa', 'Kolor', 'ColumnOrder'],
	Secret: ['Tytul', 'Prawda', 'KtoWie', 'TargetBeat'],
	Scene: ['Title', 'Chapter', 'Act', 'Status'],
};

export class BookService {
	constructor(
		private readonly app: App,
		private readonly plugin: FireflyPlugin,
	) {}

	/**
	 * Zwraca listę wszystkich dostępnych modeli beatów: wbudowane presety oraz
	 * modele zapisane przez użytkownika w ustawieniach wtyczki.
	 */
	getAvailableBeatPresets(): { id: string; name: string; beats: BeatDefinition[] }[] {
		const list: { id: string; name: string; beats: BeatDefinition[] }[] = [];

		for (const item of ALL_LIBRARY_ITEMS) {
			list.push({
				id: item.id,
				name: item.name,
				beats: item.beats || [],
			});
		}

		const savedModels = this.plugin.settings.customBeatModels || [];
		for (const model of savedModels) {
			list.push({
				id: model.id,
				name: `${model.name} (Własny)`,
				beats: model.beats || [],
			});
		}

		return list;
	}

	/**
	 * Zapisuje model beatów globalnie do ustawień wtyczki, dzięki czemu staje się
	 * dostępny we wszystkich książkach w Firefly.
	 */
	async saveGlobalBeatModel(name: string, beats: BeatDefinition[]): Promise<SavedBeatModel> {
		const trimmedName = name.trim() || 'Własny model Beatów';
		const id = 'custom_model_' + Date.now();
		const newModel: SavedBeatModel = {
			id,
			name: trimmedName,
			beats: JSON.parse(JSON.stringify(beats)),
			createdAt: Date.now(),
		};

		if (!this.plugin.settings.customBeatModels) {
			this.plugin.settings.customBeatModels = [];
		}

		const existingIndex = this.plugin.settings.customBeatModels.findIndex(
			m => m.name.toLowerCase() === trimmedName.toLowerCase()
		);
		if (existingIndex >= 0) {
			this.plugin.settings.customBeatModels[existingIndex] = newModel;
		} else {
			this.plugin.settings.customBeatModels.push(newModel);
		}

		await this.plugin.saveSettings();
		return newModel;
	}

	/**
	 * Odczytuje istniejące pliki beatów z folderu książki, wykrywa ich atrybut 'Beat Model'
	 * oraz parsuje definicje beatów.
	 */
	readBeatsFromFolder(bookRootPath: string): { beatModelName?: string; beats: BeatDefinition[] } {
		const cleanPath = bookRootPath.replace(/\\/g, '/').trim();
		const beatFiles = this.getClassFiles(cleanPath, 'Beat');
		if (beatFiles.length === 0) {
			return { beats: [] };
		}

		let detectedModel: string | undefined;
		const parsedBeats: { beat: BeatDefinition; order: number }[] = [];

		for (const file of beatFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter || {};

			const modelKey = Object.keys(fm).find(k =>
				k.toLowerCase() === 'beat model' ||
				k.toLowerCase() === 'beatmodel' ||
				k.toLowerCase() === 'beat_model'
			);
			if (modelKey && !detectedModel && fm[modelKey]) {
				detectedModel = String(fm[modelKey]).trim();
			}

			const title = String(fm['Nazwa'] ?? fm['nazwa'] ?? fm['Name'] ?? fm['name'] ?? fm['Title'] ?? file.basename.replace(/^\d+[.\s_-]*/, '')).trim();
			const act = Number(fm['Act'] ?? fm['act'] ?? fm['Akt'] ?? 1) || 1;
			const order = Number(fm['Order'] ?? fm['order'] ?? 1) || 1;
			const purpose = String(fm['Opis'] ?? fm['opis'] ?? fm['Purpose'] ?? fm['purpose'] ?? '').trim();

			parsedBeats.push({
				beat: { name: title, act, purpose },
				order,
			});
		}

		parsedBeats.sort((a, b) => a.order - b.order || a.beat.act - b.beat.act);
		return {
			beatModelName: detectedModel,
			beats: parsedBeats.map(item => item.beat),
		};
	}

	/**
	 * Zapewnia istnienie folderu w vaulcie (tworzy rekurencyjnie jeśli brakuje).
	 */
	async ensureFolder(folderPath: string): Promise<TFolder> {
		const cleanPath = folderPath.replace(/\\/g, '/').trim();
		const normalized = normalizePath(cleanPath);
		if (!normalized || normalized === '.') {
			return this.app.vault.getRoot();
		}

		const existing = this.app.vault.getAbstractFileByPath(normalized);
		if (existing instanceof TFolder) {
			return existing;
		}

		const parts = normalized.split('/');
		let currentPath = '';

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const currentFolder = this.app.vault.getAbstractFileByPath(currentPath);
			if (!currentFolder) {
				try {
					await this.app.vault.createFolder(currentPath);
				} catch {
					// Ignoruj
				}
			}
		}

		return this.app.vault.getAbstractFileByPath(normalized) as TFolder;
	}

	/**
	 * Tworzy nową książkę: strukturę folderów, szablony oraz rejestruje projekt.
	 */
	async createBook(options: CreateBookOptions): Promise<FireflyProject> {
		const rawTitle = options.title.trim();
		const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '-').trim();
		if (!safeTitle) {
			throw new Error('Nazwa książki jest nieprawidłowa.');
		}

		const baseDir = options.parentFolder ? normalizePath(options.parentFolder.replace(/\\/g, '/').trim()) : '';
		const bookRootPath = baseDir ? `${baseDir}/${safeTitle}` : safeTitle;

		await this.ensureFolder(bookRootPath);
		const subFolders = ['Arcs', 'Beats', 'Scenes', 'Subplots', 'Mechanics', 'Secrets'];
		for (const sub of subFolders) {
			await this.ensureFolder(`${bookRootPath}/${sub}`);
		}

		if (options.includeArcs) {
			await this.createFileIfNotExists(
				`${bookRootPath}/Arcs/Arc - Protagonista.md`,
				`---\nClass: Arc\nNazwa: Wewnętrzna przemiana\nOwner: Główny Bohater\nKolor: "#6366f1"\nColumnOrder: 1\nStan: zatw\n---\n\n## Definicje\n### Cel\nOsiągnięcie celu protagonisty.\n`,
			);
		}

		if (options.includeSubplots) {
			await this.createFileIfNotExists(
				`${bookRootPath}/Subplots/Subplot - Główny.md`,
				`---\nClass: Subplot\nNazwa: Wątek poboczny\nKolor: "#ec4899"\nColumnOrder: 2\nStan: prop\n---\n`,
			);
		}

		if (options.includeMechanics) {
			await this.createFileIfNotExists(
				`${bookRootPath}/Mechanics/Mechanika - Tempo.md`,
				`---\nClass: Mechanic\nNazwa: Poziom napięcia\nKolor: "#f59e0b"\nColumnOrder: 3\n---\n`,
			);
		}

		if (options.includeSecrets) {
			await this.createFileIfNotExists(
				`${bookRootPath}/Secrets/S1 - Tajemnica.md`,
				`---\nClass: Secret\nTytul: Ukryta prawda\nPrawda: Kluczowa tajemnica fabuły.\nKtoWie:\n  - Główny Bohater\nTargetBeat: Midpoint\n---\n`,
			);
		}

		if (options.includeScenes) {
			await this.createFileIfNotExists(
				`${bookRootPath}/Scenes/Scena 01 - Początek.md`,
				`---\nClass: Scene\nTitle: Początek podróży\nAct: 1\nChapter: 1\n---\n\nTu zaczyna się Twoja historia...\n`,
			);
		}

		if (options.includeBeats && options.beatPresetId) {
			await this.syncBeats(bookRootPath, options.beatPresetId, options.customBeats, options.beatModelName);
		}

		const id = 'book-' + Date.now();
		const newProject: FireflyProject = {
			id,
			title: rawTitle,
			filePath: '',
			rootFolder: bookRootPath,
			createdAt: Date.now(),
			structureProfileId: options.beatPresetId,
			beatModelName: options.beatModelName,
			customBeats: options.customBeats,
		};

		this.plugin.projectManager.addProject(newProject);
		this.plugin.projectManager.setActiveProject(id);

		return newProject;
	}

	/**
	 * Bada i diagnozuje folder vaulta pod kątem zgodności z Firefly:
	 * sprawdza obecność podfolderów, plików, klas oraz wykrywa atrybut 'Beat Model'.
	 */
	inspectFolder(folderPath: string): FolderInspectionReport {
		const cleanPath = folderPath.replace(/\\/g, '/').trim();
		const normalized = normalizePath(cleanPath);

		let targetFile = this.app.vault.getAbstractFileByPath(normalized);
		if (!(targetFile instanceof TFolder)) {
			const allFolders = this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
			targetFile = allFolders.find(f => f.path.toLowerCase() === normalized.toLowerCase()) || null;
		}

		if (!(targetFile instanceof TFolder)) {
			return {
				folderPath: normalized,
				exists: false,
				folderStatuses: [],
				classesAnalysis: {},
				allDiscoveredAttributes: [],
			};
		}

		const actualRootPath = targetFile.path;
		const subFolderNames = ['Arcs', 'Beats', 'Scenes', 'Subplots', 'Mechanics', 'Secrets'];
		const altFolderMap: Record<string, string[]> = {
			Arcs: ['arcs', 'arcy', 'watki postaci', 'wątki postaci'],
			Beats: ['beats', 'beaty', 'rytm'],
			Scenes: ['scenes', 'sceny', 'rozdzialy', 'rozdziały'],
			Subplots: ['subplots', 'subploty', 'watki', 'wątki'],
			Mechanics: ['mechanics', 'mechaniki'],
			Secrets: ['secrets', 'sekrety', 'tajemnice'],
		};

		const directSubfolders = targetFile.children.filter((c): c is TFolder => c instanceof TFolder);
		const folderStatuses: FolderStatus[] = [];

		const allMarkdownFiles = this.app.vault.getMarkdownFiles().filter(f => {
			const p = f.path.toLowerCase();
			return p.startsWith(actualRootPath.toLowerCase() + '/') || p === actualRootPath.toLowerCase();
		});

		const allAttrSet = new Set<string>();
		let detectedBeatModel: string | undefined;
		const detectedBeatsList: { beat: BeatDefinition; order: number }[] = [];

		// 1. Sprawdzanie podfolderów
		for (const stdName of subFolderNames) {
			const expectedPath = `${actualRootPath}/${stdName}`;
			const alts = [stdName.toLowerCase(), ...(altFolderMap[stdName] || [])];

			const matchedChild = directSubfolders.find(child => {
				const lowerName = child.name.toLowerCase().trim();
				return alts.includes(lowerName);
			});

			let filesCount = 0;
			if (matchedChild) {
				const childPrefix = matchedChild.path.toLowerCase() + '/';
				filesCount = allMarkdownFiles.filter(f => f.path.toLowerCase().startsWith(childPrefix)).length;
			}

			folderStatuses.push({
				folderName: stdName,
				expectedPath: matchedChild ? matchedChild.path : expectedPath,
				exists: !!matchedChild,
				fileCount: filesCount,
			});
		}

		// 2. Skanowanie atrybutu 'Beat Model' oraz plików beatów
		for (const file of allMarkdownFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) continue;

			const beatModelKey = Object.keys(fm).find(k =>
				k.toLowerCase() === 'beat model' ||
				k.toLowerCase() === 'beatmodel' ||
				k.toLowerCase() === 'beat_model'
			);
			if (beatModelKey && !detectedBeatModel) {
				const val = fm[beatModelKey];
				if (typeof val === 'string' && val.trim()) {
					detectedBeatModel = val.trim();
				}
			}

			const classVal = String(fm['Class'] ?? fm['class'] ?? '').toLowerCase().trim();
			const isBeatFile = classVal === 'beat' || file.path.toLowerCase().includes('/beats/') || file.path.toLowerCase().includes('/beaty/');

			if (isBeatFile) {
				const title = String(fm['Nazwa'] ?? fm['nazwa'] ?? fm['Name'] ?? fm['name'] ?? fm['Title'] ?? file.basename.replace(/^\d+[.\s_-]*/, '')).trim();
				const act = Number(fm['Act'] ?? fm['act'] ?? fm['Akt'] ?? 1) || 1;
				const order = Number(fm['Order'] ?? fm['order'] ?? 1) || 1;
				const purpose = String(fm['Opis'] ?? fm['opis'] ?? fm['Purpose'] ?? fm['purpose'] ?? '').trim();

				detectedBeatsList.push({
					beat: { name: title, act, purpose },
					order,
				});
			}
		}

		detectedBeatsList.sort((a, b) => a.order - b.order || a.beat.act - b.beat.act);
		const detectedBeatDefinitions = detectedBeatsList.length > 0 ? detectedBeatsList.map(item => item.beat) : undefined;

		// 3. Analiza klas i atrybutów
		const classesAnalysis: Record<string, ClassAnalysis> = {};

		for (const [clsName, expectedAttrs] of Object.entries(EXPECTED_CLASS_ATTRIBUTES)) {
			const folderStatus = folderStatuses.find(fs =>
				fs.folderName.toLowerCase() === clsName.toLowerCase() ||
				(clsName === 'Scene' && fs.folderName === 'Scenes')
			);
			const folderPrefix = folderStatus?.exists ? folderStatus.expectedPath.toLowerCase() + '/' : null;

			const candidateFiles = allMarkdownFiles.filter(file => {
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
				const classVal = fm?.['Class'] ?? fm?.['class'];
				if (typeof classVal === 'string' && classVal.toLowerCase().trim() === clsName.toLowerCase()) {
					return true;
				}
				if (folderPrefix && file.path.toLowerCase().startsWith(folderPrefix)) {
					return true;
				}
				return false;
			});

			let filesMissingClass = 0;
			const classAttrsSet = new Set<string>();

			for (const file of candidateFiles) {
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (!fm) {
					filesMissingClass++;
					continue;
				}

				const classVal = fm['Class'] ?? fm['class'];
				if (!classVal || String(classVal).toLowerCase().trim() !== clsName.toLowerCase()) {
					filesMissingClass++;
				}

				for (const key of Object.keys(fm)) {
					const lower = key.toLowerCase();
					if (lower === 'position' || lower === 'class') continue;
					classAttrsSet.add(key);
					allAttrSet.add(key);
				}
			}

			const existingAttributes = Array.from(classAttrsSet).sort();
			const missingAttributes = expectedAttrs.filter(
				exp => !existingAttributes.some(ea => ea.toLowerCase() === exp.toLowerCase())
			);

			classesAnalysis[clsName] = {
				className: clsName,
				folderExists: !!folderStatus?.exists,
				detectedFiles: candidateFiles.length,
				filesMissingClass,
				existingAttributes,
				expectedAttributes: expectedAttrs,
				missingAttributes,
			};
		}

		return {
			folderPath: actualRootPath,
			exists: true,
			folderStatuses,
			classesAnalysis,
			allDiscoveredAttributes: Array.from(allAttrSet).sort(),
			detectedBeatModel,
			detectedBeatDefinitions,
		};
	}

	/**
	 * Importuje istniejący folder do Firefly:
	 * tworzy brakujące foldery, uzupełnia Class oraz przepisuje lub mapuje atrybuty.
	 */
	async importBook(options: ImportBookOptions): Promise<FireflyProject> {
		const cleanPath = options.folderPath.replace(/\\/g, '/').trim();
		const normalized = normalizePath(cleanPath);
		let folderFile = this.app.vault.getAbstractFileByPath(normalized);
		if (!(folderFile instanceof TFolder)) {
			const allFolders = this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
			folderFile = allFolders.find(f => f.path.toLowerCase() === normalized.toLowerCase()) || null;
		}

		if (!(folderFile instanceof TFolder)) {
			throw new Error(`Folder "${normalized}" nie istnieje w Vaulcie.`);
		}

		const actualRoot = folderFile.path;

		if (options.createMissingFolders) {
			const subFolders = ['Arcs', 'Beats', 'Scenes', 'Subplots', 'Mechanics', 'Secrets'];
			for (const sub of subFolders) {
				await this.ensureFolder(`${actualRoot}/${sub}`);
			}
		}

		const allMarkdownFiles = this.app.vault.getMarkdownFiles().filter(f => {
			return f.path.toLowerCase().startsWith(actualRoot.toLowerCase() + '/');
		});

		const folderToClassMap: Record<string, string> = {
			arcs: 'Arc',
			arcy: 'Arc',
			beats: 'Beat',
			beaty: 'Beat',
			scenes: 'Scene',
			sceny: 'Scene',
			subplots: 'Subplot',
			subploty: 'Subplot',
			mechanics: 'Mechanic',
			mechaniki: 'Mechanic',
			secrets: 'Secret',
			sekrety: 'Secret',
		};

		for (const file of allMarkdownFiles) {
			let currentClass: string | null = null;
			const cache = this.app.metadataCache.getFileCache(file);
			const fmClass = cache?.frontmatter?.['Class'] ?? cache?.frontmatter?.['class'];
			if (typeof fmClass === 'string' && fmClass.trim()) {
				currentClass = fmClass.trim();
			} else {
				const relativePath = file.path.slice(actualRoot.length + 1);
				const firstSegment = relativePath.split('/')[0]?.toLowerCase();
				if (firstSegment && folderToClassMap[firstSegment]) {
					currentClass = folderToClassMap[firstSegment]!;
				}
			}

			if (!currentClass) continue;

			const classMappings = options.attributeMappings[currentClass] || {};
			const expectedAttrs = EXPECTED_CLASS_ATTRIBUTES[currentClass] || [];

			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, any>) => {
				if (options.assignMissingClass && (!fm['Class'] && !fm['class'])) {
					fm['Class'] = currentClass;
				}

				for (const [targetAttr, sourceAttr] of Object.entries(classMappings)) {
					if (!sourceAttr || sourceAttr === targetAttr) continue;
					const matchingKey = Object.keys(fm).find(k => k.toLowerCase() === sourceAttr.toLowerCase());
					if (matchingKey && matchingKey !== targetAttr) {
						fm[targetAttr] = fm[matchingKey];
						delete fm[matchingKey];
					}
				}

				if (options.fillMissingAttributes) {
					for (const attr of expectedAttrs) {
						const hasKey = Object.keys(fm).some(k => k.toLowerCase() === attr.toLowerCase());
						if (!hasKey) {
							if (attr === 'Nazwa' || attr === 'Title' || attr === 'Tytul') {
								fm[attr] = file.basename;
							} else if (attr === 'Kolor') {
								fm[attr] = '#6366f1';
							} else if (attr === 'ColumnOrder' || attr === 'Order') {
								fm[attr] = 1;
							} else if (attr === 'Act') {
								fm[attr] = 1;
							} else if (attr === 'Stan') {
								fm[attr] = 'zatw';
							} else if (attr === 'Status') {
								fm[attr] = 'Planowane';
							} else if (attr === 'KtoWie') {
								fm[attr] = [];
							} else {
								fm[attr] = '';
							}
						}
					}
				}
			});
		}

		let matchedPresetId = 'blank';
		if (options.detectedBeatModel) {
			const found = ALL_LIBRARY_ITEMS.find(
				item => item.name.toLowerCase() === options.detectedBeatModel?.toLowerCase() || item.id === options.detectedBeatModel?.toLowerCase()
			);
			if (found) {
				matchedPresetId = found.id;
			}
		}

		const id = 'book-' + Date.now();
		const newProject: FireflyProject = {
			id,
			title: options.title.trim() || actualRoot.split('/').pop() || 'Zaimportowana książka',
			filePath: '',
			rootFolder: actualRoot,
			structureProfileId: matchedPresetId,
			beatModelName: options.detectedBeatModel,
			customBeats: options.customBeats,
			createdAt: Date.now(),
		};

		this.plugin.projectManager.addProject(newProject);
		this.plugin.projectManager.setActiveProject(id);

		return newProject;
	}

	/**
	 * Zastępuje system beatów w książce: usuwa poprzednie pliki beatów,
	 * czyści referencje do nich w innych plikach (np. Secrets/TargetBeat) i generuje nowe pliki.
	 */
	async replaceBeatSystem(
		bookRootPath: string,
		newPresetId: string,
		customBeats?: BeatDefinition[],
		beatModelName?: string,
	): Promise<{ created: number; deleted: number; referencesCleared: number }> {
		const cleanPath = bookRootPath.replace(/\\/g, '/').trim();
		const beatsFolder = `${normalizePath(cleanPath)}/Beats`;
		await this.ensureFolder(beatsFolder);

		const existingBeatFiles = this.getClassFiles(cleanPath, 'Beat');
		const oldBeatIdentifiers = new Set<string>();

		for (const file of existingBeatFiles) {
			oldBeatIdentifiers.add(file.basename.toLowerCase());
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			const nazwa = fm?.['Nazwa'] ?? fm?.['nazwa'] ?? fm?.['name'] ?? fm?.['Title'];
			if (typeof nazwa === 'string' && nazwa.trim()) {
				oldBeatIdentifiers.add(nazwa.trim().toLowerCase());
			}
		}

		let deleted = 0;
		for (const file of existingBeatFiles) {
			try {
				await this.app.vault.trash(file, true);
				deleted++;
			} catch {
				// Ignoruj
			}
		}

		let referencesCleared = 0;
		const allProjectMarkdown = this.app.vault.getMarkdownFiles().filter(f => {
			return f.path.toLowerCase().startsWith(normalizePath(cleanPath).toLowerCase() + '/');
		});

		for (const file of allProjectMarkdown) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) continue;

			const targetBeatKey = Object.keys(fm).find(k => k.toLowerCase() === 'targetbeat' || k.toLowerCase() === 'beat');
			if (!targetBeatKey) continue;

			const val = fm[targetBeatKey];
			if (!val) continue;

			const valStr = String(val).toLowerCase().trim();
			const isMatch = Array.from(oldBeatIdentifiers).some(id => valStr.includes(id));

			if (isMatch) {
				await this.app.fileManager.processFrontMatter(file, (matter: Record<string, any>) => {
					delete matter[targetBeatKey];
				});
				referencesCleared++;
			}
		}

		const syncRes = await this.syncBeats(cleanPath, newPresetId, customBeats, beatModelName);

		return {
			created: syncRes.created,
			deleted,
			referencesCleared,
		};
	}

	/**
	 * Synchronizuje/tworzy pliki beatów z presetu w folderze Beats danej książki.
	 */
	async syncBeats(
		bookRootPath: string,
		presetId: string,
		customBeats?: BeatDefinition[],
		beatModelName?: string,
	): Promise<{ created: number; skipped: number }> {
		const cleanPath = bookRootPath.replace(/\\/g, '/').trim();
		const beatsFolder = `${normalizePath(cleanPath)}/Beats`;
		await this.ensureFolder(beatsFolder);

		let beatsToCreate: BeatDefinition[] = [];
		let modelName = beatModelName;

		if (presetId === 'blank') {
			beatsToCreate = customBeats && customBeats.length > 0 ? customBeats : BLANK_CUSTOM_BEATS;
			modelName = modelName || 'Blank custom';
		} else if (presetId.startsWith('custom_model_')) {
			const saved = (this.plugin.settings.customBeatModels || []).find(m => m.id === presetId);
			if (saved) {
				beatsToCreate = saved.beats;
				modelName = modelName || saved.name;
			}
		} else {
			const preset = ALL_LIBRARY_ITEMS.find(item => item.id === presetId);
			if (preset && preset.beats) {
				beatsToCreate = preset.beats;
				modelName = modelName || preset.name;
			}
		}

		if (!beatsToCreate.length) {
			return { created: 0, skipped: 0 };
		}

		let created = 0;
		let skipped = 0;

		for (let i = 0; i < beatsToCreate.length; i++) {
			const b = beatsToCreate[i]!;
			const orderNum = String(i + 1).padStart(2, '0');
			const safeBeatName = b.name.replace(/[\\/:*?"<>|]/g, '-').trim();
			const filePath = `${beatsFolder}/${orderNum} - ${safeBeatName}.md`;

			const exists = this.app.vault.getAbstractFileByPath(filePath);
			if (exists) {
				skipped++;
				continue;
			}

			const frontmatterLines = [
				'---',
				'Class: Beat',
				`Beat Model: "${(modelName || 'Story Beat').replace(/"/g, '\\"')}"`,
				`Act: ${b.act}`,
				`Order: ${i + 1}`,
				`Nazwa: ${b.name}`,
				`Opis: "${(b.purpose || '').replace(/"/g, '\\"')}"`,
				'Stan: otwarte',
				'---',
				'',
			];

			await this.app.vault.create(filePath, frontmatterLines.join('\n'));
			created++;
		}

		return { created, skipped };
	}

	/**
	 * Zwraca pliki markdown należące do danej klasy w danej książce.
	 */
	getClassFiles(bookRootPath: string, className: string): TFile[] {
		const cleanPath = bookRootPath.replace(/\\/g, '/').trim();
		const normalizedRoot = normalizePath(cleanPath).toLowerCase();
		const files = this.app.vault.getMarkdownFiles();
		const normExpected = className.toLowerCase();

		return files.filter(file => {
			const filePath = file.path.toLowerCase();
			if (!filePath.startsWith(normalizedRoot + '/') && filePath !== normalizedRoot) {
				return false;
			}
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) return false;

			const classVal = fm['Class'] ?? fm['class'];
			if (typeof classVal !== 'string') return false;
			const normVal = classVal.toLowerCase().trim();

			if (normVal === normExpected) return true;

			if (normVal === 'thread' || normVal === 'wątek' || normVal === 'watek') {
				const subtype = (fm['podtyp'] ?? fm['subtype'] ?? fm['subType'] ?? fm['typ'] ?? fm['type']) as string | undefined;
				if (typeof subtype === 'string' && subtype.toLowerCase().trim() === normExpected) {
					return true;
				}
			}

			return false;
		});
	}

	/**
	 * Pobiera wszystkie unikalne klucze atrybutów obecne w plikach danej klasy w książce.
	 */
	getAllAttributesForClass(bookRootPath: string, className: string): string[] {
		const files = this.getClassFiles(bookRootPath, className);
		const keySet = new Set<string>();

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) continue;

			for (const key of Object.keys(fm)) {
				const lower = key.toLowerCase();
				if (lower === 'class' || lower === 'position') continue;
				keySet.add(key);
			}
		}

		return Array.from(keySet).sort();
	}

	/**
	 * Przepisuje nazwę atrybutu (stary klucz -> nowy klucz) we wszystkich plikach danej klasy,
	 * zachowując w pełni ich istniejące wartości.
	 */
	async renameAttribute(
		bookRootPath: string,
		className: string,
		oldKey: string,
		newKey: string,
	): Promise<{ success: boolean; filesModified: number }> {
		const rawOld = oldKey.trim();
		const rawNew = newKey.trim();
		if (!rawOld || !rawNew || rawOld === rawNew) {
			return { success: false, filesModified: 0 };
		}

		const files = this.getClassFiles(bookRootPath, className);
		let filesModified = 0;

		for (const file of files) {
			let didModify = false;
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, any>) => {
				const targetKey = Object.keys(fm).find(k => k.toLowerCase() === rawOld.toLowerCase());
				if (targetKey !== undefined) {
					const existingValue = fm[targetKey];
					fm[rawNew] = existingValue;
					delete fm[targetKey];
					didModify = true;
				}
			});

			if (didModify) {
				filesModified++;
			}
		}

		return { success: true, filesModified };
	}

	/**
	 * Aktualizuje frontmatter w konkretnym pliku.
	 */
	async updateFrontmatter(file: TFile, updates: Record<string, any>): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, any>) => {
			for (const [k, v] of Object.entries(updates)) {
				if (v === undefined || v === null || v === '') {
					delete fm[k];
				} else {
					fm[k] = v;
				}
			}
		});
	}

	/**
	 * Tworzy nowy plik danej klasy w odpowiednim folderze.
	 */
	async createClassFile(
		bookRootPath: string,
		className: string,
		displayName: string,
		initialFrontmatter: Record<string, any> = {},
	): Promise<TFile> {
		const folderMap: Record<string, string> = {
			arc: 'Arcs',
			subplot: 'Subplots',
			beat: 'Beats',
			mechanic: 'Mechanics',
			secret: 'Secrets',
			scene: 'Scenes',
		};

		const subFolder = folderMap[className.toLowerCase()] || className;
		const targetFolder = `${normalizePath(bookRootPath)}/${subFolder}`;
		await this.ensureFolder(targetFolder);

		const safeName = displayName.replace(/[\\/:*?"<>|]/g, '-').trim() || `Nowy ${className}`;
		let filePath = `${targetFolder}/${safeName}.md`;
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(filePath)) {
			filePath = `${targetFolder}/${safeName} ${counter++}.md`;
		}

		const fm: Record<string, any> = {
			Class: className,
			...initialFrontmatter,
		};

		const lines = ['---'];
		for (const [k, v] of Object.entries(fm)) {
			if (Array.isArray(v)) {
				lines.push(`${k}:`);
				for (const item of v) lines.push(`  - ${item}`);
			} else if (typeof v === 'string' && (v.includes(':') || v.includes('#') || v.includes('"'))) {
				lines.push(`${k}: "${v.replace(/"/g, '\\"')}"`);
			} else {
				lines.push(`${k}: ${v}`);
			}
		}
		lines.push('---', '');

		return await this.app.vault.create(filePath, lines.join('\n'));
	}

	private async createFileIfNotExists(filePath: string, content: string): Promise<void> {
		const normalized = normalizePath(filePath);
		if (!this.app.vault.getAbstractFileByPath(normalized)) {
			await this.app.vault.create(normalized, content);
		}
	}
}
