import type { ColumnStan } from './Arc';

/**
 * Subplot — wątek fabularny bez właściciela-postaci.
 * Plik w folderze Subploty/ z Class: Subplot.
 */
export interface Subplot {
	/** Pełna ścieżka pliku w vaulcie. */
	filePath: string;
	/** Unikalny id (małe litery ASCII, bez _, wielowyrazowe łączone myślnikiem). */
	id: string;
	/** Wyświetlana nazwa i dopasowanie do pola Subplot w scenach. */
	nazwa: string;
	/** Kolor kolumny w formacie #rrggbb. */
	kolor: string;
	/** Kolejność kolumny w siatce. */
	columnOrder: number;
	/**
	 * Lista nazw podkolumn (opcjonalna).
	 * Pusta lista = jedna komórka `subplot_<id>`.
	 */
	podkolumny: string[];
	stan: ColumnStan;
	/** Status wątku: 'approved' | 'proposed' | 'open'. */
	status?: string;
	/** Krótki opis wątku z treści notatki (pierwszy akapit pod frontmatterem). */
	description: string;
}
