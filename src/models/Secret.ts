/**
 * Secret — tajemnica/sekret narracyjny.
 * Plik w folderze Sekrety/ z Class: Secret.
 * Basename pliku = id sekretu (np. "S1").
 */
export interface Secret {
	/** Pełna ścieżka pliku w vaulcie. */
	filePath: string;
	/** Id sekretu = basename pliku (np. "S1", "S3"). */
	id: string;
	/** Krótki tytuł sekretu. */
	tytul: string;
	/** Jedno zdanie — co jest prawdą. Rozwinięcie w treści pliku. */
	prawda: string;
	/** Aliasy postaci, które wiedzą o sekrecie. */
	ktoWie: string[];
	/**
	 * Alias beatu docelowej odsłony pełnej.
	 * Np. "Climax 5" z linku [[Beaty/Climax 5|Climax 5]].
	 */
	revealTarget?: string;
	/** Czy sekret to twist (nieoczekiwany zwrot)? */
	twist: boolean;
	/**
	 * Czy wymagany zasiew przed odsłoną?
	 * false = wyłącza ostrzeżenie "odsłona bez zasiewu".
	 */
	zasiewWymagany: boolean;
	/** Status sekretu: 'approved' | 'proposed' | 'open'. */
	status?: string;
}

/** Rodzaj zdarzenia sekretu w beacie. */
export type SecretEventKind = 'zasiew' | 'czesciowo' | 'pelne' | 'podwazenie';

/** Jednoliterowy kod zdarzenia na chipach PlotGridu. */
export type SecretEventCode = 'S' | 'P' | 'R' | 'U';

/** Polskie etykiety zdarzeń (pełne). */
export const SECRET_EVENT_LABELS: Record<SecretEventKind, string> = {
	zasiew:     'zasiew',
	czesciowo:  'częściowo',
	pelne:      'pełna',
	podwazenie: 'podważenie',
};

/** Kolejność wyświetlania chipów sekretów. */
export const SECRET_EVENT_ORDER: SecretEventKind[] = ['zasiew', 'czesciowo', 'pelne', 'podwazenie'];

/** Kody literowe na chipach S/P/R/U. */
export const SECRET_EVENT_CODES: Record<SecretEventKind, SecretEventCode> = {
	zasiew:     'S',
	czesciowo:  'P',
	pelne:      'R',
	podwazenie: 'U',
};

/** Wyświetlane etykiety chipów (z dużej litery). */
export const SECRET_EVENT_CHIP_LABELS: Record<SecretEventKind, string> = {
	zasiew:     'Zasiew',
	czesciowo:  'Częściowo',
	pelne:      'Pełna',
	podwazenie: 'Podważenie',
};
