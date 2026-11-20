import { App, TFile } from 'obsidian';
import type { Beat, BeatStan } from '../models/Beat';
import type { Arc } from '../models/Arc';
import type { Subplot } from '../models/Subplot';
import type { Mechanic } from '../models/Mechanic';
import type { Secret } from '../models/Secret';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wyciąga string z wartości frontmattera (string lub array[0]). */
function fmString(
	fm: Record<string, unknown>,
	keys: string[],
): string | undefined {
	for (const key of keys) {
		const v = fm[key];
		if (typeof v === 'string' && v.trim()) return v.trim();
		if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim();
	}
	return undefined;
}

/** Wyciąga number z wartości frontmattera. */
function fmNumber(
	fm: Record<string, unknown>,
	keys: string[],
): number | undefined {
	for (const key of keys) {
		const v = fm[key];
		if (typeof v === 'number' && Number.isFinite(v)) return v;
		if (typeof v === 'string') {
			const n = parseFloat(v);
			if (Number.isFinite(n)) return n;
		}
	}
	return undefined;
}

/** Wyciąga string[] z wartości frontmattera (lista lub pojedynczy string). */
function fmStringList(
	fm: Record<string, unknown>,
	key: string,
): string[] {
	const v = fm[key];
	if (!v) return [];
	if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
	if (typeof v === 'string' && v.trim()) return [v.trim()];
	return [];
}

/**
 * Wyciąga alias z linku YAML: "[[Sekrety/S1|S1]]" → "S1".
 * Jeśli brak aliasu, zwraca ostatni segment ścieżki ("[[Sekrety/S1]]" → "S1").
 */
function extractAlias(link: string): string {
	const withAlias = link.match(/\[\[.*?\|(.*?)\]\]/);
	if (withAlias?.[1]) return withAlias[1].trim();
	const bare = link.match(/\[\[(.*?)\]\]/);
	if (bare?.[1]) {
		const parts = bare[1].split('/');
		return (parts[parts.length - 1] ?? bare[1]).trim();
	}
	return link.trim();
}

/**
 * Parsuje listę linków YAML i zwraca aliasy sekretów.
 */
function extractSecretIds(fm: Record<string, unknown>, key: string): string[] {
	const raw = fm[key];
	if (!raw) return [];
	const arr: string[] = Array.isArray(raw)
		? raw.map(v => String(v))
		: [String(raw)];
	return arr.map(extractAlias).filter(Boolean);
}

/**
 * Parsuje sekcję ## Definicje z treści pliku arcu.
 * Zwraca mapę nagłówek-### → tekst-akapitu.
 */
function parseDefinitions(content: string): Record<string, string> {
	const defs: Record<string, string> = {};
	const defsMatch = content.match(/^##\s+Definicje\s*$/im);
	if (!defsMatch) return defs;
	const afterDefs = content.slice(content.indexOf(defsMatch[0]) + defsMatch[0].length);
	const subSections = afterDefs.split(/^###\s+/m);
	for (const section of subSections.slice(1)) {
		const lines = section.split('\n');
		const heading = (lines[0] ?? '').trim();
		if (!heading) continue;
		const bodyLines: string[] = [];
		for (let i = 1; i < lines.length; i++) {
			if (/^##/.test(lines[i] ?? '')) break;
			bodyLines.push(lines[i] ?? '');
		}
		const body = bodyLines.join('\n').trim();
		if (heading) defs[heading] = body;
	}
	return defs;
}

/** Sprawdza wartość Class w FM (uwzględnia Class: Thread z podtyp: arc/subplot/mechanic). */
function matchClass(fm: Record<string, unknown>, expected: string): boolean {
	const v = fmString(fm, ['Class', 'class']);
	if (!v) return false;
	const norm = v.toLowerCase();
	// Zasada 4: plik z Class: Test jest ignorowany
	if (norm === 'test') return false;

	if (norm === expected.toLowerCase()) return true;

	// Wariant z Class: Thread i podtyp: arc / subplot / mechanic
	if (norm === 'thread' || norm === 'wątek' || norm === 'watek') {
		const subtype = fmString(fm, ['podtyp', 'subtype', 'subType', 'typ', 'type'])?.toLowerCase();
		if (subtype === expected.toLowerCase()) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Prefiksy kluczy komórek
// ---------------------------------------------------------------------------

/** Prefiksy nowego formatu kluczy komórek. */
const CELL_PREFIXES = ['arc_', 'subplot_', 'mechanic_'] as const;
/** Stary prefiks dla wstecznej kompatybilności (dual-read). */
const LEGACY_PREFIX = 'kom_';

/**
 * Rozpoznaje typ kolumny z klucza komórki.
 * Zwraca typ ('arc' | 'subplot' | 'mechanic') i resztę klucza, lub null.
 */
function parseCellKeyType(key: string): { type: 'arc' | 'subplot' | 'mechanic'; rest: string } | null {
	for (const prefix of CELL_PREFIXES) {
		if (key.startsWith(prefix)) {
			return { type: prefix.slice(0, -1) as 'arc' | 'subplot' | 'mechanic', rest: key.slice(prefix.length) };
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// PlotGridReader
// ---------------------------------------------------------------------------

/**
 * Serwis odczytu danych PlotGrid z vaultu Obsidian.
 * Czyta pliki Beat, Arc, Subplot, Mechanic, Secret z podanego rootFolder.
 * Nie używa Node.js fs — wyłącznie Obsidian API.
 *
 * Dual-Read: odczytuje nowe klucze (arc_, subplot_, mechanic_, secret_seed/partial/reveal/undermine)
 * z fallbackiem na stare klucze (kom_*, sekret_zasiew/czesciowo/pelne/podwazenie).
 */
export class PlotGridReader {
	constructor(
		private readonly app: App,
		/** Ścieżka główna projektu (bez trailing slash). */
		private readonly rootFolder: string,
	) {}

	// -------------------------------------------------------------------------
	// Publiczne metody synchroniczne
	// -------------------------------------------------------------------------

	/** Wczytuje wszystkie beaty projektu posortowane po Act, Order. */
	readBeats(): Beat[] {
		const beats: Beat[] = [];
		const files = this.candidateFiles(['Beaty', 'Beats']);
		for (const file of files) {
			const fm = this.fm(file);
			if (!matchClass(fm, 'beat')) continue;
			beats.push(this.parseBeat(file, fm));
		}
		beats.sort((a, b) => a.act - b.act || a.order - b.order);
		return beats;
	}

	/** Wczytuje wszystkie subploty posortowane po columnOrder. */
	readSubplots(): Subplot[] {
		const result: Subplot[] = [];
		const files = this.candidateFiles(['Subploty', 'Subplots', 'Wątki', 'Watki', 'Threads']);
		for (const file of files) {
			const fm = this.fm(file);
			if (!matchClass(fm, 'subplot')) continue;
			result.push(this.parseSubplot(file, fm));
		}
		return result.sort((a, b) => a.columnOrder - b.columnOrder);
	}

	/** Wczytuje wszystkie mechaniki posortowane po columnOrder. */
	readMechanics(): Mechanic[] {
		const result: Mechanic[] = [];
		const files = this.candidateFiles(['Mechaniki', 'Mechanics', 'Wątki', 'Watki', 'Threads']);
		for (const file of files) {
			const fm = this.fm(file);
			if (!matchClass(fm, 'mechanic')) continue;
			result.push(this.parseMechanic(file, fm));
		}
		return result.sort((a, b) => a.columnOrder - b.columnOrder);
	}

	/** Wczytuje wszystkie sekrety. */
	readSecrets(): Secret[] {
		const result: Secret[] = [];
		const files = this.candidateFiles(['Sekrety', 'Secrets']);
		for (const file of files) {
			const fm = this.fm(file);
			if (!matchClass(fm, 'secret')) continue;
			result.push(this.parseSecret(file, fm));
		}
		return result.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
	}

	// -------------------------------------------------------------------------
	// Asynchroniczne (wymagają odczytu treści pliku dla definicji)
	// -------------------------------------------------------------------------

	/**
	 * Wczytuje wszystkie arce z definicjami podkolumn.
	 * Async bo wymaga app.vault.read() dla sekcji ## Definicje.
	 */
	async readArcs(): Promise<Arc[]> {
		const result: Arc[] = [];
		const files = this.candidateFiles(['Arcy', 'Arci', 'Arcs', 'Wątki', 'Watki', 'Threads']);
		for (const file of files) {
			const fm = this.fm(file);
			if (!matchClass(fm, 'arc')) continue;
			const content = await this.app.vault.read(file);
			result.push(this.parseArc(file, fm, content));
		}
		return result.sort((a, b) => a.columnOrder - b.columnOrder);
	}

	// -------------------------------------------------------------------------
	// Wzbogacanie kolumn z treści beatów
	// -------------------------------------------------------------------------

	/**
	 * Uzupełnia podkolumny w arcach i subplotach na podstawie kluczy
	 * arc_* / subplot_* (oraz legacy kom_*) znalezionych w beatach.
	 */
	enrichSubcolumnsFromBeats(cols: (Arc | Subplot)[], beats: Beat[]): void {
		for (const col of cols) {
			const subSet = new Set(col.podkolumny);
			const colType = 'owner' in col ? 'arc' : 'subplot';
			const newPrefix = `${colType}_${col.id.toLowerCase()}_`;
			const legacyPrefix = `${LEGACY_PREFIX}${col.id.toLowerCase()}_`;

			for (const beat of beats) {
				for (const key of Object.keys(beat.cells)) {
					const lower = key.toLowerCase();
					let subName: string | undefined;

					if (lower.startsWith(newPrefix)) {
						subName = key.slice(newPrefix.length).trim();
					} else if (lower.startsWith(legacyPrefix)) {
						subName = key.slice(legacyPrefix.length).trim();
					}

					if (subName && !subSet.has(subName)) {
						col.podkolumny.push(subName);
						subSet.add(subName);
					}
				}
			}
		}
	}

	/**
	 * Tworzy syntetyczne kolumny (np. Mechaniki jak 'dawkowanie') dla kluczy
	 * mechanic_* / kom_* które nie mają odpowiadającego pliku Arc/Subplot/Mechanic.
	 */
	synthesizeMissingColumns(
		beats: Beat[],
		existingColIds: Set<string>,
	): Mechanic[] {
		const newMechs: Mechanic[] = [];
		const seen = new Set<string>();

		for (const beat of beats) {
			for (const key of Object.keys(beat.cells)) {
				let colId: string | undefined;

				// Tylko klucze mechanik (mechanic_*) lub legacy 'dawkowanie'/'stawka' mogą być syntetycznymi mechanikami.
				// Nigdy nie zamieniaj arc_* ani subplot_* na mechaniki!
				const parsed = parseCellKeyType(key);
				if (parsed) {
					if (parsed.type !== 'mechanic') continue;
					const underscoreIdx = parsed.rest.indexOf('_');
					colId = (underscoreIdx >= 0 ? parsed.rest.slice(0, underscoreIdx) : parsed.rest).toLowerCase();
				} else {
					// Legacy: kom_<id>[_<sub>] — syntetyzuj tylko znane mechaniki legacy
					const match = key.match(/^kom_([^_]+)(?:_(.+))?$/i);
					if (match) {
						const candidate = (match[1] ?? '').toLowerCase();
						if (candidate === 'dawkowanie' || candidate === 'stawka' || candidate === 'dosing') {
							colId = candidate;
						}
					}
				}

				if (!colId) continue;
				if (!existingColIds.has(colId) && !seen.has(colId)) {
					seen.add(colId);
					let nazwa = colId.charAt(0).toUpperCase() + colId.slice(1).replace(/-/g, ' ');
					let kolor = '#8a8a8a';
					if (colId === 'dawkowanie' || colId === 'dosing') {
						nazwa = 'POV, dawkowanie, telling';
						kolor = '#8a8a8a';
					} else if (colId === 'stawka') {
						nazwa = 'Stawka';
						kolor = '#7a7a7a';
					}
					newMechs.push({
						filePath: '',
						id: colId,
						nazwa,
						kolor,
						columnOrder: 980 + newMechs.length,
					});
				}
			}
		}
		return newMechs;
	}

	// -------------------------------------------------------------------------
	// Parsery prywatne
	// -------------------------------------------------------------------------

	private parseBeat(file: TFile, fm: Record<string, unknown>): Beat {
		const cells: Record<string, string[]> = {};

		// Zbierz klucze komórek z frontmattera:
		// 1. Nowy format: arc_*, subplot_*, mechanic_*
		// 2. Legacy (dual-read): kom_* → normalizuj do nowego formatu
		for (const [key, val] of Object.entries(fm)) {
			let normalizedKey: string | null = null;

			if (CELL_PREFIXES.some(p => key.toLowerCase().startsWith(p))) {
				// Nowy format — użyj jak jest
				normalizedKey = key;
			} else if (key.toLowerCase().startsWith(LEGACY_PREFIX)) {
				// Legacy: kom_<id>[_<sub>] → potrzebujemy kontekstu kolumny
				// Na razie zachowujemy klucz legacy — enrichSubcolumnsFromBeats
				// i cellValue obsługują oba formaty
				normalizedKey = key;
			}

			if (!normalizedKey) continue;
			if (val === null || val === undefined) continue;

			if (Array.isArray(val)) {
				const list = val.map(String).map(s => s.trim()).filter(Boolean);
				if (list.length > 0) cells[normalizedKey] = list;
			} else if (typeof val === 'string' && val.trim()) {
				cells[normalizedKey] = [val.trim()];
			} else if (typeof val === 'number' || typeof val === 'boolean') {
				cells[normalizedKey] = [String(val)];
			}
		}

		// Parsuj pov — wyciągnij alias z linku
		const povRaw = fmString(fm, ['pov', 'POV']);
		const pov = povRaw ? extractAlias(povRaw) : undefined;

		// Parsuj stan (legacy)
		const stanRaw = fmString(fm, ['stan'])?.toLowerCase();
		const stan: BeatStan =
			stanRaw === 'zatw' ? 'zatw'
			: stanRaw === 'prop' ? 'prop'
			: 'otwarte';

		// Parsuj status (nowy) — mapujemy stan na angielski jeśli brak Status
		const statusRaw = fmString(fm, ['Status', 'status']);
		let status: string | undefined;
		if (statusRaw) {
			status = statusRaw.toLowerCase();
		} else {
			// Fallback: mapuj stary stan na angielski status
			const stanMap: Record<BeatStan, string> = {
				'zatw': 'approved',
				'prop': 'proposed',
				'otwarte': 'open',
			};
			status = stanMap[stan];
		}

		return {
			filePath: file.path,
			name: fmString(fm, ['title', 'Title', 'name', 'Name']) ?? file.basename,
			act: fmNumber(fm, ['Act', 'act', 'Akt', 'akt']) ?? 1,
			order: fmNumber(fm, ['Order', 'order', 'Sequence', 'sequence']) ?? 999,
			range: fmString(fm, ['Range', 'range']),
			purpose: fmString(fm, ['Purpose', 'purpose', 'Opis', 'opis']),
			tension: fmNumber(fm, ['StoryTension', 'storyTension', 'tension']),
			pacing: fmNumber(fm, ['StoryPacing', 'storyPacing', 'pacing']),
			pov,
			stawka: fmNumber(fm, ['stawka']),
			stan,
			status,
			// Zdarzenia sekretów: dual-read (nowe angielskie + stare polskie)
			sekretZasiew:     [
				...extractSecretIds(fm, 'secret_seed'),
				...extractSecretIds(fm, 'sekret_zasiew'),
			].filter((v, i, a) => a.indexOf(v) === i),
			sekretCzesciowo:  [
				...extractSecretIds(fm, 'secret_partial'),
				...extractSecretIds(fm, 'sekret_czesciowo'),
			].filter((v, i, a) => a.indexOf(v) === i),
			sekretPelne:      [
				...extractSecretIds(fm, 'secret_reveal'),
				...extractSecretIds(fm, 'sekret_pelne'),
			].filter((v, i, a) => a.indexOf(v) === i),
			sekretPodwazenie: [
				...extractSecretIds(fm, 'secret_undermine'),
				...extractSecretIds(fm, 'sekret_podwazenie'),
			].filter((v, i, a) => a.indexOf(v) === i),
			cells,
		};
	}

	private parseArc(file: TFile, fm: Record<string, unknown>, content: string): Arc {
		const ownerRaw = fmString(fm, ['owner', 'Owner']);
		const defs = parseDefinitions(content);
		let podkolumny = fmStringList(fm, 'podkolumny');
		if (podkolumny.length === 0) podkolumny = fmStringList(fm, 'subcolumns');
		if (podkolumny.length === 0) {
			// Jeśli brak listy w YAML, użyj nagłówków z sekcji ## Definicje
			podkolumny = Object.keys(defs);
		}

		const rawTitle = fmString(fm, ['nazwa', 'name', 'title', 'Title']) ?? file.basename;
		const nazwa = rawTitle.replace(/^w[aą]tek\s*-\s*/i, '');

		return {
			filePath: file.path,
			id: fmString(fm, ['id']) ?? this.toId(file.basename),
			nazwa,
			owner: ownerRaw ? extractAlias(ownerRaw) : undefined,
			kolor: fmString(fm, ['kolor', 'color']) ?? '#c9a24a',
			columnOrder: fmNumber(fm, ['column_order', 'columnOrder', 'order']) ?? 999,
			podkolumny,
			stan: this.parseStan(fm),
			definitions: defs,
			// Atrybuty fundamentu postaci (z frontmattera)
			ghost: fmString(fm, ['ghost', 'Ghost', 'duch']),
			lie: fmString(fm, ['lie', 'Lie', 'kłamstwo', 'klamstwo']),
			truth: fmString(fm, ['truth', 'Truth', 'prawda']),
			want: fmString(fm, ['want', 'Want', 'pragnienie']),
			need: fmString(fm, ['need', 'Need', 'potrzeba']),
			flaws: fmString(fm, ['flaws', 'Flaws', 'wady']),
			handicaps: fmString(fm, ['handicaps', 'Handicaps', 'ograniczenia_fizyczne']),
			limitations: fmString(fm, ['limitations', 'Limitations', 'ograniczenia']),
		};
	}

	private parseSubplot(file: TFile, fm: Record<string, unknown>): Subplot {
		const rawTitle = fmString(fm, ['nazwa', 'name', 'title', 'Title']) ?? file.basename;
		const nazwa = rawTitle.replace(/^w[aą]tek\s*-\s*/i, '');

		let podkolumny = fmStringList(fm, 'podkolumny');
		if (podkolumny.length === 0) podkolumny = fmStringList(fm, 'subcolumns');

		return {
			filePath: file.path,
			id: fmString(fm, ['id']) ?? this.toId(file.basename),
			nazwa,
			kolor: fmString(fm, ['kolor', 'color']) ?? '#3f6e8c',
			columnOrder: fmNumber(fm, ['column_order', 'columnOrder', 'order']) ?? 999,
			podkolumny,
			stan: this.parseStan(fm),
			status: fmString(fm, ['Status', 'status', 'stan']),
			description: fmString(fm, ['opis', 'description']) ?? '',
		};
	}

	private parseMechanic(file: TFile, fm: Record<string, unknown>): Mechanic {
		const rawTitle = fmString(fm, ['nazwa', 'name', 'title', 'Title']) ?? file.basename;
		const nazwa = rawTitle.replace(/^w[aą]tek\s*-\s*/i, '');

		let podkolumny = fmStringList(fm, 'podkolumny');
		if (podkolumny.length === 0) podkolumny = fmStringList(fm, 'subcolumns');

		return {
			filePath: file.path,
			id: fmString(fm, ['id']) ?? this.toId(file.basename),
			nazwa,
			kolor: fmString(fm, ['kolor', 'color']) ?? '#8a8a8a',
			columnOrder: fmNumber(fm, ['column_order', 'columnOrder', 'order']) ?? 999,
			podkolumny: podkolumny.length > 0 ? podkolumny : undefined,
		};
	}

	private parseSecret(file: TFile, fm: Record<string, unknown>): Secret {
		const ktoWieRaw = fmStringList(fm, 'kto_wie').length > 0
			? fmStringList(fm, 'kto_wie')
			: fmStringList(fm, 'known_by');
		const revealRaw = fmString(fm, ['reveal_target', 'revealTarget']);
		return {
			filePath: file.path,
			id: file.basename,
			tytul: fmString(fm, ['tytul', 'title']) ?? file.basename,
			prawda: fmString(fm, ['prawda', 'truth', 'fact']) ?? '',
			ktoWie: ktoWieRaw.map(extractAlias).filter(Boolean),
			revealTarget: revealRaw ? extractAlias(revealRaw) : undefined,
			twist: fmString(fm, ['twist'])?.toLowerCase() === 'tak'
				|| fmString(fm, ['twist'])?.toLowerCase() === 'true',
			zasiewWymagany: fmString(fm, ['zasiew_wymagany', 'seed_required'])?.toLowerCase() !== 'nie'
				&& fmString(fm, ['zasiew_wymagany', 'seed_required'])?.toLowerCase() !== 'false',
			status: fmString(fm, ['Status', 'status', 'stan']),
		};
	}

	// -------------------------------------------------------------------------
	// Narzędzia prywatne
	// -------------------------------------------------------------------------

	/** Zwraca kandydatów plików markdown z podanych podfolderów lub całego rootFolder. */
	private candidateFiles(folderNames: string[]): TFile[] {
		const normalizedRoot = this.rootFolder.toLowerCase();
		const allProjectFiles = this.app.vault
			.getMarkdownFiles()
			.filter(f => f.path.toLowerCase().startsWith(normalizedRoot));

		const folderPrefixes = folderNames.map(f => `${normalizedRoot}/${f.toLowerCase()}/`);
		const inFolders = allProjectFiles.filter(f => {
			const p = f.path.toLowerCase();
			return folderPrefixes.some(prefix => p.startsWith(prefix));
		});

		if (inFolders.length > 0) return inFolders;
		return allProjectFiles;
	}

	/** Wczytuje frontmatter pliku z metadataCache. */
	private fm(file: TFile): Record<string, unknown> {
		return (
			(this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>
		);
	}

	private parseStan(fm: Record<string, unknown>): 'zatw' | 'prop' | 'otwarte' {
		const v = fmString(fm, ['stan', 'Status', 'status'])?.toLowerCase();
		if (v === 'zatw' || v === 'approved') return 'zatw';
		if (v === 'prop' || v === 'proposed') return 'prop';
		return 'otwarte';
	}

	/**
	 * Konwertuje basename na id: małe litery, bez _, wielowyrazowe → myślnik.
	 * Usuwa prefiksy typu "Wątek - ".
	 */
	private toId(basename: string): string {
		const clean = basename.replace(/^w[aą]tek\s*-\s*/i, '');
		return clean
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/_/g, '-')
			.replace(/[^a-z0-9-]/g, '');
	}
}

// ---------------------------------------------------------------------------
// Eksporty pomocnicze: klucz i wartość komórki
// ---------------------------------------------------------------------------

/**
 * Buduje klucz frontmattera komórki.
 * Nowy format: `<type>_<id>[_<subcolumn>]` (np. arc_merharin_lie).
 * @param columnType - Typ kolumny: 'arc', 'subplot' lub 'mechanic'.
 * @param columnId - Id kolumny.
 * @param sub - Opcjonalna nazwa podkolumny.
 */
export function cellKey(columnId: string, sub: string | null, columnType?: string): string {
	const prefix = columnType ? `${columnType}_` : '';
	return sub ? `${prefix}${columnId}_${sub}` : `${prefix}${columnId}`;
}

/**
 * Zwraca wartość komórki z beatu lub pustą listę.
 * Obsługuje:
 * 1. Nowy format: arc_<id>[_<sub>], subplot_<id>[_<sub>], mechanic_<id>[_<sub>]
 * 2. Legacy: kom_<id>[_<sub>]
 * 3. Znormalizowane dopasowanie (odporne na spacje, myślniki i wielkość liter)
 */
export function cellValue(
	beat: Beat,
	columnId: string,
	sub: string | null,
	columnType?: string,
): string[] {
	if (!beat?.cells) return [];

	// Próba 1: nowy format z podanym typem
	if (columnType) {
		const newKey = cellKey(columnId, sub, columnType);
		if (beat.cells[newKey] && beat.cells[newKey].length > 0) {
			return beat.cells[newKey];
		}
	}

	// Próba 2: nowy format ze wszystkimi typami
	for (const prefix of CELL_PREFIXES) {
		const key = sub ? `${prefix}${columnId}_${sub}` : `${prefix}${columnId}`;
		if (beat.cells[key] && beat.cells[key].length > 0) {
			return beat.cells[key];
		}
	}

	// Próba 3: legacy kom_
	const legacyKey = sub ? `${LEGACY_PREFIX}${columnId}_${sub}` : `${LEGACY_PREFIX}${columnId}`;
	if (beat.cells[legacyKey] && beat.cells[legacyKey].length > 0) {
		return beat.cells[legacyKey];
	}

	// Próba 4: klucz bez prefiksu (obecny format w starym kodzie)
	const bareKey = sub ? `${columnId}_${sub}` : columnId;
	if (beat.cells[bareKey] && beat.cells[bareKey].length > 0) {
		return beat.cells[bareKey];
	}

	// Próba 5: normalizacja jako fallback (usuwa spacje, podkreślenia, myślniki)
	const norm = (s: string) => s.toLowerCase().replace(/[\s_\-–—]+/g, '');

	// Szukaj w nowym formacie
	for (const prefix of CELL_PREFIXES) {
		const key = sub ? `${prefix}${columnId}_${sub}` : `${prefix}${columnId}`;
		const targetNorm = norm(key);
		for (const [k, v] of Object.entries(beat.cells)) {
			if (norm(k) === targetNorm && Array.isArray(v) && v.length > 0) {
				return v;
			}
		}
	}

	// Szukaj w legacy formacie
	const legacyNorm = norm(legacyKey);
	for (const [k, v] of Object.entries(beat.cells)) {
		if (norm(k) === legacyNorm && Array.isArray(v) && v.length > 0) {
			return v;
		}
	}

	return [];
}
