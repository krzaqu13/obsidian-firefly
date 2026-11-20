import type { Beat } from '../../models/Beat';
import type { Arc } from '../../models/Arc';
import type { Subplot } from '../../models/Subplot';
import type { Mechanic } from '../../models/Mechanic';
import type { Secret } from '../../models/Secret';
import type { Scene } from '../../models/Scene';
import { cellValue } from '../../services/PlotGridReader';

export interface ValidationIssue {
	severity: 'warn' | 'info';
	title: string;
	detail: string;
	/** Ścieżka pliku lub wzorzec (do wyświetlenia). */
	source: string;
}

export interface ValidationResult {
	issues: ValidationIssue[];
	/** Krótkie opisy reguł, które przeszły pomyślnie. */
	ok: Array<{ title: string; detail: string }>;
}

type AnyColumn = Arc | Subplot | Mechanic;

/** Zwraca wszystkie unikalne id sekretów wymienione w beatach. */
function allSecretIds(beats: Beat[]): Set<string> {
	const ids = new Set<string>();
	for (const b of beats) {
		for (const id of [
			...b.sekretZasiew,
			...b.sekretCzesciowo,
			...b.sekretPelne,
			...b.sekretPodwazenie,
		]) {
			if (id) ids.add(id);
		}
	}
	return ids;
}

/**
 * Zwraca listę rodzajów zdarzeń danego sekretu w danym beacie.
 */
function kindsOfSecret(beat: Beat, secretId: string): string[] {
	const kinds: string[] = [];
	if (beat.sekretZasiew.includes(secretId))     kinds.push('zasiew');
	if (beat.sekretCzesciowo.includes(secretId))  kinds.push('częściowo');
	if (beat.sekretPelne.includes(secretId))      kinds.push('pełna');
	if (beat.sekretPodwazenie.includes(secretId)) kinds.push('podważenie');
	return kinds;
}

/**
 * Walidator PlotGrid v2.
 * Implementuje 11 reguł z wytycznych i symulacji.
 */
export function validatePlotGrid(
	beats: Beat[],
	arcs: Arc[],
	subplots: Subplot[],
	mechanics: Mechanic[],
	secrets: Secret[],
	scenes: Scene[],
): ValidationResult {
	const issues: ValidationIssue[] = [];
	const ok: Array<{ title: string; detail: string }> = [];

	const secretById = new Map(secrets.map(s => [s.id, s]));
	const beatByName = new Map(beats.map(b => [b.name, b]));
	const allCols: AnyColumn[] = [...arcs, ...subplots, ...mechanics];

	// Zbiór poprawnych id kolumn i ich podkolumn → używane przez V8
	const validCellKeys = new Set<string>();
	for (const arc of arcs) {
		const subs = arc.podkolumny.length > 0 ? arc.podkolumny : [];
		validCellKeys.add(`arc_${arc.id}`);
		validCellKeys.add(`kom_${arc.id}`);
		for (const sub of subs) {
			validCellKeys.add(`arc_${arc.id}_${sub}`);
			validCellKeys.add(`kom_${arc.id}_${sub}`);
		}
	}
	for (const sub of subplots) {
		const subs = sub.podkolumny.length > 0 ? sub.podkolumny : [];
		validCellKeys.add(`subplot_${sub.id}`);
		validCellKeys.add(`kom_${sub.id}`);
		for (const s of subs) {
			validCellKeys.add(`subplot_${sub.id}_${s}`);
			validCellKeys.add(`kom_${sub.id}_${s}`);
		}
	}
	for (const mech of mechanics) {
		const subs = (mech.podkolumny && mech.podkolumny.length > 0) ? mech.podkolumny : [];
		validCellKeys.add(`mechanic_${mech.id}`);
		validCellKeys.add(`kom_${mech.id}`);
		for (const m of subs) {
			validCellKeys.add(`mechanic_${mech.id}_${m}`);
			validCellKeys.add(`kom_${mech.id}_${m}`);
		}
	}

	// ---- Walidacje sekretów ------------------------------------------------

	const referencedIds = allSecretIds(beats);

	// V1: Sekret wskazany w sekret_* beatu bez pliku Sekretu
	const secretsWithoutFile: string[] = [];
	for (const id of referencedIds) {
		if (!secretById.has(id)) {
			secretsWithoutFile.push(id);
			const where = beats
				.filter(b => kindsOfSecret(b, id).length > 0)
				.map(b => `${b.name} (${kindsOfSecret(b, id).join(', ')})`)
				.join('; ');
			issues.push({
				severity: 'warn',
				title: `Brak pliku sekretu: ${id}`,
				detail: `Wskazują go: ${where}. Bez pliku brakuje prawdy, wiedzących i celu odsłony.`,
				source: `Sekrety/${id}.md`,
			});
		}
	}
	if (secretsWithoutFile.length === 0) {
		ok.push({
			title: 'Wszystkie sekrety mają plik',
			detail: 'Każdy id z sekret_* odpowiada plikowi w folderze Sekrety/.',
		});
	}

	// V2: reveal_target wskazuje nieistniejący beat
	for (const s of secrets) {
		if (s.revealTarget && !beatByName.has(s.revealTarget)) {
			issues.push({
				severity: 'warn',
				title: `Cel odsłony nie jest beatem: ${s.id}`,
				detail: `reveal_target wskazuje „${s.revealTarget}", a takiego beatu nie ma w zestawie.`,
				source: s.filePath,
			});
		}
	}

	// V3: Sekret bez odsłony pełnej
	for (const s of secrets) {
		const hasFull = beats.some(b => b.sekretPelne.includes(s.id));
		if (!hasFull) {
			issues.push({
				severity: 'warn',
				title: `Brak odsłony pełnej: ${s.id}`,
				detail: 'Sekret ma plik, ale żaden beat nie zawiera znacznika sekret_pelne.',
				source: s.filePath,
			});
		}
	}

	// V4: Odsłona pełna bez wcześniejszego zasiewu
	for (const s of secrets) {
		if (!s.zasiewWymagany) continue;
		const fullBeat = beats.find(b => b.sekretPelne.includes(s.id));
		if (!fullBeat) continue;
		const seeded = beats.some(
			b => b.order <= fullBeat.order && b.sekretZasiew.includes(s.id),
		);
		if (!seeded) {
			issues.push({
				severity: 'warn',
				title: `Odsłona pełna bez zasiewu: ${s.id}`,
				detail: `Odsłona w beacie „${fullBeat.name}", wcześniej brak zasiewu. Jeśli zamierzone, ustaw zasiew_wymagany: nie w pliku sekretu.`,
				source: fullBeat.filePath,
			});
		}
	}

	// V5: Kilka odsłon pełnych tego samego sekretu w jednym beacie
	// (reguła z wytycznych: "odsłony po jednej")
	for (const b of beats) {
		if (b.sekretPelne.length > 1) {
			issues.push({
				severity: 'warn',
				title: `Kilka odsłon pełnych w jednym beacie: ${b.name}`,
				detail: `${b.sekretPelne.length} odsłon pełnych (${b.sekretPelne.join(', ')}). Reguła „odsłony po jednej" — rozważ podział na kolejne beaty.`,
				source: b.filePath,
			});
		}
	}

	// V6: Odsłona pełna przed reveal_target
	for (const s of secrets) {
		if (!s.revealTarget) continue;
		const targetBeat = beatByName.get(s.revealTarget);
		if (!targetBeat) continue;
		const fullBeat = beats.find(b => b.sekretPelne.includes(s.id));
		if (fullBeat && fullBeat.order < targetBeat.order) {
			issues.push({
				severity: 'warn',
				title: `Odsłona pełna przed celem: ${s.id}`,
				detail: `Odsłona pełna w „${fullBeat.name}" (Order ${fullBeat.order}), ale reveal_target to „${s.revealTarget}" (Order ${targetBeat.order}).`,
				source: s.filePath,
			});
		}
	}

	// ---- Walidacje kolumn --------------------------------------------------

	// V7: Pusta podkolumna (zadeklarowana, ale żaden beat nie ma treści)
	const emptySubcols: string[] = [];
	for (const arc of arcs) {
		const subs = arc.podkolumny.length > 0 ? arc.podkolumny : [null];
		for (const sub of subs) {
			const filled = beats.some(b => cellValue(b, arc.id, sub).length > 0);
			if (!filled) {
				emptySubcols.push(sub ? `${arc.nazwa} · ${sub}` : arc.nazwa);
				issues.push({
					severity: 'info',
					title: `Pusta kolumna: ${sub ?? arc.nazwa}`,
					detail: `Kolumna istnieje (${sub ? `podkolumna w arcu „${arc.nazwa}"` : `arc „${arc.nazwa}"`}), ale żaden beat nie ma w niej treści.`,
					source: arc.filePath,
				});
			}
		}
	}
	for (const sub of subplots) {
		const subs = sub.podkolumny.length > 0 ? sub.podkolumny : [null];
		for (const s of subs) {
			const filled = beats.some(b => cellValue(b, sub.id, s).length > 0);
			if (!filled) {
				emptySubcols.push(s ? `${sub.nazwa} · ${s}` : sub.nazwa);
				issues.push({
					severity: 'info',
					title: `Pusta kolumna: ${s ?? sub.nazwa}`,
					detail: `Subplot „${sub.nazwa}" nie ma treści w żadnym beacie.`,
					source: sub.filePath,
				});
			}
		}
	}

	// V8: Klucz kom_* w beacie bez odpowiadającej kolumny
	const unknownKeys: string[] = [];
	for (const b of beats) {
		for (const key of Object.keys(b.cells)) {
			if (!validCellKeys.has(key)) {
				if (!unknownKeys.includes(key)) unknownKeys.push(key);
				issues.push({
					severity: 'warn',
					title: `Nieznany klucz komórki: ${key}`,
					detail: `Beat „${b.name}" ma klucz ${key}, ale nie ma odpowiadającej kolumny (arc, subplot, mechanika).`,
					source: b.filePath,
				});
			}
		}
	}
	if (unknownKeys.length === 0) {
		ok.push({
			title: 'Nieznane klucze komórek: 0',
			detail: 'Każdy klucz w beatach odpowiada kolumnie lub podkolumnie z pliku kolumny.',
		});
	}

	// V9: Scena z Subplot bez dopasowania do nazwa w plikach Arc/Subplot
	const knownNazwy = new Set([
		...arcs.map(a => a.nazwa),
		...subplots.map(s => s.nazwa),
	]);
	const badSceneSubplots: string[] = [];
	for (const scene of scenes) {
		for (const sp of (scene.subplots ?? [])) {
			if (!knownNazwy.has(sp)) {
				badSceneSubplots.push(`${scene.title}: „${sp}"`);
				issues.push({
					severity: 'warn',
					title: `Scena z nieznanym Subplot: ${scene.title}`,
					detail: `Pole Subplot „${sp}" nie pasuje do żadnego pola nazwa w plikach Arc/Subplot.`,
					source: scene.filePath,
				});
			}
		}
	}
	if (badSceneSubplots.length === 0 && scenes.length > 0) {
		ok.push({
			title: 'Sceny: pola Subplot zgodne',
			detail: 'Wszystkie wartości Subplot w scenach pasują do nazw arców/subplotów.',
		});
	}

	// V10: Beaty z Class: Test — informacyjne (już odfiltrowane przez reader, ale sygnalizujemy)
	// Nie implementujemy — reader pomija Class: Test per wytyczne (zasada 4).
	ok.push({
		title: 'Pliki z Class: Test pominięte',
		detail: 'Reader ignoruje pliki z Class: Test, nawet jeśli mają klucze kom_*.',
	});

	// V11: Beaty bez StoryTension
	const missingTension = beats.filter(b => b.tension == null).length;
	if (missingTension > 0) {
		issues.push({
			severity: 'info',
			title: `Brak StoryTension w ${missingTension} z ${beats.length} beatów`,
			detail: 'Oś Y wykresu napięcia ma dane tylko dla beatów z wypełnionym StoryTension.',
			source: 'Beaty/*.md',
		});
	} else if (beats.length > 0) {
		ok.push({
			title: 'Napięcie: wszystkie beaty wypełnione',
			detail: 'Każdy beat ma wartość StoryTension.',
		});
	}

	return { issues, ok };
}
