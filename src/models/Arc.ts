export type ColumnStan = 'zatw' | 'prop' | 'otwarte';

/**
 * Arc — kolumna siatki powiązana z postacią.
 * Plik w folderze Arcy/ z Class: Arc.
 */
export interface Arc {
	/** Pełna ścieżka pliku w vaulcie. */
	filePath: string;
	/** Unikalny id (małe litery ASCII, bez _, wielowyrazowe łączone myślnikiem). */
	id: string;
	/** Wyświetlana nazwa kolumny i dopasowanie do pola Subplot w scenach. */
	nazwa: string;
	/** Alias linka do postaci właściciela, np. "Merharin". */
	owner?: string;
	/** Kolor kolumny w formacie #rrggbb. */
	kolor: string;
	/** Kolejność kolumny w siatce. */
	columnOrder: number;
	/**
	 * Lista nazw podkolumn w kolejności wyświetlania.
	 * Pusta lista = jedna komórka `arc_<id>` bez podkolumny.
	 */
	podkolumny: string[];
	stan: ColumnStan;
	/**
	 * Definicje podkolumn z sekcji ## Definicje pliku arcu.
	 * Klucz = nazwa podkolumny, wartość = tekst definicji.
	 */
	definitions: Record<string, string>;

	// ── Atrybuty fundamentu postaci (z frontmattera pliku arcu) ──────────

	/** Duch — przeszłość kształtująca przekonania bohatera. */
	ghost?: string;
	/** Kłamstwo — fałszywe przekonanie bohatera o sobie/świecie. */
	lie?: string;
	/** Prawda — prawda, którą bohater musi odkryć. */
	truth?: string;
	/** Pragnienie — zewnętrzny cel bohatera. */
	want?: string;
	/** Potrzeba — wewnętrzna potrzeba, której bohater nie jest świadomy. */
	need?: string;
	/** Wady — cechy charakteru utrudniające osiągnięcie celu. */
	flaws?: string;
	/** Ograniczenia fizyczne/sytuacyjne — handicapy zewnętrzne. */
	handicaps?: string;
	/** Ograniczenia — granice, których bohater nie może przekroczyć. */
	limitations?: string;
}
