/**
 * Mechanic — kolumna techniczna (nie fabularna).
 * Plik w folderze Mechaniki/ z Class: Mechanic.
 * Klucze komórek: `mechanic_<id>[_<podkolumna>]`.
 */
export interface Mechanic {
	/** Pełna ścieżka pliku w vaulcie. */
	filePath: string;
	/** Unikalny id (małe litery ASCII, bez _, wielowyrazowe łączone myślnikiem). */
	id: string;
	/** Wyświetlana nazwa kolumny. */
	nazwa: string;
	/** Kolor kolumny w formacie #rrggbb. */
	kolor: string;
	/** Kolejność kolumny w siatce. */
	columnOrder: number;
	/**
	 * Lista nazw podkolumn (opcjonalna).
	 * Np. ["Wolno", "Nie wolno", "Notatka"] dla mechaniki dawkowania.
	 * Pusta lista = jedna komórka `mechanic_<id>`.
	 */
	podkolumny?: string[];
}
