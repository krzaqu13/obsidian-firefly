export type BeatStan = 'zatw' | 'prop' | 'otwarte';

export interface Beat {
	/** Pełna ścieżka pliku w vaulcie. */
	filePath: string;
	/** Wyświetlana nazwa (basename lub pole title/name z FM). */
	name: string;
	/** Akt (pole Act w FM). */
	act: number;
	/** Kolejność w ramach aktu (pole Order). */
	order: number;
	/** Zakres procentowy napięcia, np. "0-8" (pole Range). */
	range?: string;
	/** Cel narracyjny beatu (pole Purpose / Opis). */
	purpose?: string;
	/** Napięcie narracyjne 1–10 (pole StoryTension). */
	tension?: number;
	/** Tempo narracyjne 1–10 (pole StoryPacing). */
	pacing?: number;
	/** Alias linka do postaci POV, np. "Merharin". */
	pov?: string;
	/** Stawka 0–5. */
	stawka?: number;
	/** Stan beatu (stary klucz polski). Domyślnie 'otwarte'. */
	stan: BeatStan;
	/** Status beatu: 'approved' | 'proposed' | 'open'. Odczyt z FM: Status lub stan. */
	status?: string;
	/**
	 * Zdarzenia sekretów — klucze `secret_seed` / `secret_partial` /
	 * `secret_reveal` / `secret_undermine` z frontmattera (lub stare polskie
	 * aliasy `sekret_zasiew` itd.). Każda tablica zawiera id sekretów
	 * (basename pliku Sekretu), wyodrębniony z linku [[Sekrety/S1|S1]] → "S1".
	 */
	sekretZasiew: string[];
	sekretCzesciowo: string[];
	sekretPelne: string[];
	sekretPodwazenie: string[];
	/**
	 * Komórki siatki z frontmattera.
	 * Klucz = `arc_<id>[_<podkolumna>]`, `subplot_<id>[_<podkolumna>]`
	 * lub `mechanic_<id>[_<podkolumna>]`.
	 * Reader normalizuje historyczne klucze `kom_*` do nowego formatu.
	 * Wartość = lista tekstów (zawsze lista per wytyczne v2).
	 */
	cells: Record<string, string[]>;
}
