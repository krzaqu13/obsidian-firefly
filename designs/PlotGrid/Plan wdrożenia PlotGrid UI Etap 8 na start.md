# Plan wdrożenia PlotGrid UI: Etap 8 na start

Nov 13, 2026 · @Krzysztof

## Zakres i kolejność

Plan dotyczy wyłącznie warstwy UI w `src/features/writing/plot-grid/` i zaczyna się od Etapu 8 (kolumny tworzone w siatce), bo to on ustala model kolumn, na którym stoją pozostałe widoki.

**Zasady stałe:** tokeny z `index.css` zamiast kolorów na sztywno, ikony Lucide `strokeWidth` 1.4, stan w `usePlotGrid`, bez nowych zależności, polskie napisy, testy na testowym vaultcie, nie na prawdziwych notatkach.

**Kolejność prac:**

1. Etap 8: kolumny tworzone w siatce (sekcja 2), razem z minimalnymi porządkami w plikach, których dotyka.
2. Etap 0: tokeny, polskie napisy i drobne błędy (sekcja 6).
3. Etap 2: drawer z edycją, który zastępuje stary panel edytora.
4. Krok D w loaderze, potem Etapy 4–6: Beats, Scenes, Arcs/Subplots/Mechanics, Secrets.
5. Etap 7: walidacja, klawiatura, dokumentacja.

**Co blokuje start Etapu 8:** dwie decyzje (jak zapisać nową zakładkę i jak nazwać klucz podkolumny, sekcja 8), funkcja zapisu frontmattera pliku właściciela oraz klikalne komórki w widokach Arcs, Subplots i Mechanics. Nie blokują go drawer, Beats, Scenes ani Secrets.

## Etap 8: kolumny tworzone w siatce

Autor zaczyna od pustej tabeli i sam dokłada kolumny („Etap testu Kłamstwa”, „Izolacja 0–4”, „Do wymyślenia”), a dopiero potem okazuje się, które z nich są czymś stałym (punkt wyjścia: arkusz PlotGrid\_v.3.2.xlsx). Aplikacja nie narzuca szablonu kolumn.

### Zasady

- **Kolumna w istniejącej zakładce to podkolumna, nie plik.** W Arcs, Subplots i Mechanics „+ Kolumna” dopisuje nazwę do `subcolumns` pliku właściciela. Komórki zapisują się w beatach jako atrybuty (`arc_<id>_<podkolumna>`), jak dziś. To jedna linia, więc zapis jest od razu, bez stanu szkicu.
- **Nowy plik powstaje tylko dla nowego właściciela:** „+ Nowy Arc”, „+ Nowy Subplot”, „+ Nowy Mechanic” to osobne przyciski z makiety.
- **Nowy folder pojawia się tylko przy nowej zakładce** (np. „Świat”).
- **Bez wymaganych pól.** Do dodania podkolumny wystarczy nazwa.
- **Kolejność** zmienia listę `subcolumns` (dla właścicieli: `column_order`).
- **Usuwanie ostrożnie.** Domyślnie „Ukryj”. „Usuń” pokazuje liczbę beatów z wpisami w tej podkolumnie i robi kopię zapasową w `.firefly/backups/`.
- **Pusty start.** Książka bez szablonu beatów otwiera PlotGrid z pustą siatką, a beaty dodaje się z siatki („+ Beat”).

### Kroki

| Krok | Zakres | Pliki | Zależy od |
| --- | --- | --- | --- |
| 8.1 Zapis | Funkcje `addSubcolumn`, `renameSubcolumn`, `reorderSubcolumns`, `hideSubcolumn`, `removeSubcolumn` w `usePlotGrid`. Nowy `plotGridWriter.ts` podmienia jedną linię frontmattera właściciela i zachowuje resztę pliku. Po zapisie dane przeładowują się. | `usePlotGrid.ts`, `plotGridWriter.ts` | decyzje 1 i 2 |
| 8.2 Klikalne komórki | W widokach Arcs, Subplots i Mechanics klik w komórkę woła `selectCell`. Naprawić auto-otwieranie drawera po wejściu w zakładkę. | `PlotGridColumnView.tsx` | brak |
| 8.3 „+ Kolumna” | Popover z nazwą (w widoku Plot dodatkowo wybór właściciela). Walidacja: niepusta, unikalna u właściciela, bez znaku `\|` i znaków łamiących YAML. | `PlotGridAddColumnPopover.tsx` | 8.1 |
| 8.4 Menu podkolumny | W nagłówku: zmień nazwę, kolejność, ukryj, usuń (z liczbą beatów i kopią zapasową). | `PlotGridColumnMenu.tsx` | 8.1, decyzja 2 |
| 8.5 Pusty start | `PlotGridEmptyState` dla `no-data` zastąpić pustą siatką z „+ Beat” i „+ Kolumna”. Nowy beat to nowy plik w folderze Beats. | `PlotGrid.tsx`, `PlotGridEmptyState.tsx` | 8.1 |
| 8.6 „+ Zakładka” | Popover (nazwa, kolor) tworzy folder i wpis w pliku Book. `TabId` rośnie ze stałej unii do stałych wartości plus `area:<id>`. | `PlotGridTabs.tsx`, `plotGridTypes.ts` | decyzja 1, widok kolumn z Etapu 5 |
| 8.7 „+ Atrybut” | Własne atrybuty łuku jako `attr_<slug>` z etykietą, w bloku atrybutów Arcs (np. Granica, Pokusa w finale). | `PlotGridColumnView.tsx` | blok atrybutów z Etapu 5 |

Opcjonalna akcja „Przypisz znaczenie…” (zapis `maps_to` w pliku właściciela, np. podkolumna „Napięcie” to `StoryTension`) jest wycięta z pierwszej wersji. Wraca, gdy pojawi się realna potrzeba, razem z podglądem zmian i kopią zapasową.

### Styl i obsługa

- Popovery i menu na istniejących tokenach i klasach, ikony Lucide (`Plus`, `MoreHorizontal`) o `strokeWidth` 1.4, napisy po polsku.
- Enter zatwierdza, Esc zamyka, fokus wraca na przycisk, który otworzył popover.
- Zapis jest widoczny od razu: nowa podkolumna pojawia się w Arcs i w Plot bez ręcznego przeładowania.

### Kryteria akceptacji

- „+ Kolumna” w Arcs nie tworzy żadnego pliku, zmienia tylko `subcolumns` właściciela.
- Nowa podkolumna jest widoczna w Arcs i w Plot, a wpis w komórce zapisuje się w beacie jako atrybut.
- Zmiana nazwy podkolumny nie gubi wpisów w beatach.
- Usunięcie podkolumny pokazuje liczbę dotkniętych beatów i zostawia kopię w `.firefly/backups/`.
- Nowa zakładka tworzy folder i wpis w pliku Book, a jej usunięcie nie kasuje plików.
- Loader i walidator czytają dodane kolumny bez dodatkowych zmian.
- Z pustej książki da się dodać beat i kolumnę wyłącznie z siatki.

## Zależności od warstwy danych

Etap 8 potrzebuje tylko wąskiego wycinka warstwy danych, a widoki z Etapów 4–6 potrzebują całego nowego modelu pól (krok D, poza zakresem UI). Loader czyta dziś stare klucze: `cell_*` i `kom_*`, `secret_zasiew/czesciowo/pelne/podwazenie`, `nazwa`, `tytul`.

### Wymagane przez Etap 8

- Odczyt `subcolumns` z pliku właściciela (działa) oraz, po decyzji 2, odczyt par „id → Nazwa”.
- Zapis jednej linii frontmattera właściciela bez ruszania reszty pliku (nowy `plotGridWriter.ts`).
- Klucze komórek nowego modelu `arc_/subplot_/mechanic_<id>[_<podkolumna>]` z odczytem starych kluczy jako rezerwą (dual-read), zapis tylko w nowym.
- Dla „+ Zakładka”: wpis w pliku Book (`custom_areas`, `folder_area_<id>`) i klucze `area_<obszar>_<właściciel>[_<podkolumna>]`. `BookConfig` ma dziś tylko sześć stałych folderów.

### Wymagane przez Etapy 3–6

| Pole | Potrzebne w | Czyta loader |
| --- | --- | --- |
| `Range`, `Purpose` | Plot, Beats | nie |
| `StoryTension`, `StoryPacing` | Plot, Beats | nie |
| `Status`, `POV`, `Act`, `Order`, `Subplot` | Scenes | częściowo (brak POV, Subplot, Status sceny) |
| `arc_`, `subplot_`, `mechanic_` | Plot, Arcs, Subplots, Mechanics | nie |
| `ghost`, `lie`, `truth`, `want`, `need`, `flaws`, `handicaps`, `limitations` | Arcs | nie |
| `secret_seed/partial/reveal/undermine` | Plot, Secrets | nie (czyta stare nazwy) |
| `title`, `color`, `fact`, `known_by`, `seed_required`, `reveal_target` | Secrets, drawer | częściowo (stare nazwy) |

Krok D powinien być gotowy przed Etapem 3. Dla Etapu 8 wystarczy jego wycinek z pierwszej listy.

## Stan obecny względem makiety

Szkielet 7 widoków i model zaznaczenia już działają, ale większość zawartości z makiety „PlotGrid: przykład” jeszcze nie istnieje. Przegląd obejmuje 22 pliki z `plot-grid/`; aplikacji nie uruchamiałem.

| Etap | Stan | Uwagi |
| --- | --- | --- |
| 0. Porządki (tokeny, napisy) | prawie nic | Zmienne spoza `index.css`, kolory hex i angielskie napisy zostały. |
| 1. Szkielet 7 widoków | zrobiony | Brak nagłówka strony z makiety. |
| 2. Drawer | połowicznie | `PlotGridDrawer` istnieje, ale jest tylko do odczytu. |
| 3. Plot | połowicznie | Są nagłówki pasmowe i orientacja `rows`. Brak chipów S/P/R/U, Range i napięcia, separatorów aktów. |
| 4. Beats, Scenes | szkielet | Większość kolumn to na sztywno „—”. |
| 5. Arcs, Subplots, Mechanics | szkielet | Lista i siatka są, reszta z makiety nie. |
| 6. Secrets | niewykonany | Brak bloku walidacji, układu po `Order` i ramki celu odsłony. |
| 7. Walidacja, dostępność | nie ruszony | Panel nie zamyka się, brak klawiatury. |
| 8. Kolumny w siatce | nie ruszony | Treść tego planu. |

## Braki w UI per widok

Największy brak to drawer, który nie pozwala edytować, a dopiero po nim widoki Beats, Scenes i Secrets.

**Wspólne**

- Brak nagłówka „KSIĄŻKA · nazwa”, tytułu, podtytułu „N plików w folderze …” i przycisków „+ Nowy …”.
- Ósma zakładka „Validation” nie występuje w makiecie. Etykiety „Plot” i „Sekrety” zamiast „PlotGrid” i „Secrets”.
- `TabId` zawiera jeszcze stare wartości `plotgrid` i `arc`.

**Plot**

- Toolbar to zestaw checkboxów, bez legendy S/P/R/U i liczników „6 kolumn · 3 sekrety · 0 ostrzeżeń”. „Skanuj ponownie” to goła ikona.
- Kolumna beatu pokazuje nazwę, akt i status. Makieta ma numer, Range oraz napięcie i tempo.
- Brak wierszy-separatorów „Akt 1/2/3”.
- Sekrety to jedna zbiorcza kolumna. Makieta ma podkolumny S1, S3, S4 z chipami.

**Drawer**

- Tylko do odczytu, z jednym przyciskiem „Zamknij”.
- Brak przełącznika Komórka / Kolumna, edycji wpisów („+ Dodaj wpis”), definicji kolumny (lie, truth, want, need), sąsiednich beatów i frontmattera.
- Brak przycisków „Otwórz plik beatu”, „Otwórz Arc”, „Pokaż w PlotGrid”, skrótu Esc i ostrzeżenia o niezapisanej edycji.
- Edycję przejmuje stary `PlotGridEditorPanel` (320 px, angielskie napisy, jasne kolory), więc po kliknięciu komórki otwierają się dwa panele naraz.

**Beats**

- Range, Napięcie i Tempo to „—”, kolumny Purpose nie ma.
- „Komórki” to suma wpisów zamiast „4/6”, „Sekrety” to liczba zamiast chipów.
- Brak paska „Szablon: …”, „+ Nowy beat” i podświetlenia zaznaczonego wiersza.

**Scenes**

- Akt, Subplot, POV i Status to „—”, bo typ `SceneFile` nie ma tych pól.

**Arcs, Subplots, Mechanics**

- Komórki nie reagują na klik, więc nie da się otworzyć drawera ani edytować.
- Orientacja jest odwrotna niż w makiecie: beaty w kolumnach, a makieta ma beaty w wierszach.
- Lewa lista nie pokazuje koloru, `column_order` ani „N z M komórek wypełnionych”.
- Arcs bez bloku ghost, lie, truth, want, need, flaws, handicaps, limitations. Subplots bez opisu kolumny.
- Układ stoi na stylach inline. `PlotGridArcView.tsx` jest nieużywany i ma TODO przy `getDefinition`.

**Secrets**

- Kolumny to nazwy beatów, a makieta ma numery `Order` z chipami S/P/R/U w komórkach.
- Brak czerwonej ramki na beacie docelowym, wiersza „cel odsłony: beat N” i legendy u góry.
- Brak bloku „Walidacje” pod macierzą. Walidator już liczy wyniki, ale widok ich nie pokazuje. Są za to kolumny „Cel odsłony” i „Stan”, a notatka nadal mówi o `sekret_*`.
- Id sekretu pokazuje się dwa razy.

**Walidacja**

- Panel jest `position: fixed`, otwiera się sam i ma `onClose={() => {}}`, więc nie da się go zamknąć.
- Badge w toolbarze nie jest klikalny, a kliknięcie problemu nie przenosi do komórki.

## Błędy znalezione w kodzie

Trzy z nich widać od razu na ekranie (chipy, „+ dodaj”, drawer), reszta to dług w stylach i napisach.

- **Chipy sekretów powtarzają się w każdej komórce wiersza.** `PlotGridTable` przekazuje `secretEvents` beatu do każdego `PlotGridCell`.
- **Chipy nie mają stylów.** CSS dotyczy `.secret-chip.z/.o/.O/.p`, a komponent nadaje klasy `zasiew`, `czesciowo` i tak dalej. `charAt(0)` daje to samo „P” dla pełnej odsłony i podważenia. Makieta rozwiązuje to przez S/P/R/U.
- **Pusta komórka pokazuje „+ dodaj” dwa razy:** tekst jest i w `<span>`, i w `::before`.
- **Drawer otwiera się sam po wejściu w Arcs, Subplots lub Mechanics.** Efekt w `PlotGridColumnView` wywołuje `onSelectId` dla pierwszej kolumny, a to ustawia zaznaczenie.
- **Zmienne CSS spoza `index.css`.** `--bg-primary`, `--bg-secondary`, `--border-color`, `--accent-color`, `--bg-hover` mają jasne wartości zapasowe, więc toolbar, panele i walidacja wychodzą jasne na ciemnej aplikacji. Do potwierdzenia w `index.css`.
- **Kolory na sztywno:** `#dc2626`, `#fef2f2`, `#991b1b`, `#e0a24a`, `#7fa8d1`, `#6fbf86` oraz `--k-*` w `:root`.
- **Angielskie napisy:** „Loading…”, „No Active Book”, „Save Changes”, „+ Add Item”, „Validation Issues”, „Reload data”.
- **Martwy kod:** `PlotGridArcView.tsx`, `PlotGridViewValidation.tsx`, nieużywane `openEditor`, `onClose={() => {}}` w panelu walidacji.
- **Dostępność:** komórki mają `tabIndex`, ale brak obsługi strzałek, Enter i Esc, a chipy nie mają `aria-label`.
- **Instrukcje projektu** wskazują `src/styles/tokens.css`, który nie jest importowany. Aktywny system to Earthy Ink w `src/styles/index.css`.

Parser YAML w `plotGridLoader.ts` (`parseSimpleYAML`) używa osobnej tablicy na klucz, więc opisany wcześniej błąd współdzielonych list nie występuje. Nie sprawdzałem `plotGridYaml.ts`; test na pliku z dwiema listami potwierdzi to w Etapie 0.

## Pozostałe etapy 0–7

Kolejność wykonania po Etapie 8: 0, 2, krok D, 3–6, 7. Numeracja zostaje taka jak w makiecie.

### Etap 0. Porządki bez zmiany układu

- Wszystkie zmienne i kolory w `plot-grid.css` i `PlotGridTable.tsx` na tokeny z `index.css` (`--bg-panel/surface/raised/active`, `--text-*`, `--accent`, rodziny `--teal/--sage/--clay/--danger`, `--border-*`, `--radius-*`, `--space-*`, `--font-*`, `--duration-*`).
- Polskie napisy w całym UI, ikony Lucide `strokeWidth` 1.4.
- Naprawa podwójnego „+ dodaj”, auto-otwierania drawera, chipów powtarzanych w każdej komórce.
- Usunięcie martwego kodu, poprawa wzmianek o `tokens.css` w `docs/`.
- Test parsera YAML na pliku z dwiema listami.

**Kryteria:** w `plot-grid*.css` i plikach `.tsx` brak kolorów hex i zmiennych spoza `index.css`; widoki wyglądają poprawnie w Earthy Ink i Slate Pro; parser zachowuje dwie różne listy w jednym frontmatterze.

### Etap 2. Drawer

- `PlotGridDrawer` z przełącznikiem Komórka / Kolumna i zawartością zależną od `selection.kind`.
- **Komórka:** tytuł „beat · kolumna”, lista wpisów z edycją inline (dodaj, usuń, zapisz), „Zapis w pliku” (ścieżka i klucz), definicja kolumny, sąsiednie beaty, przyciski „Otwórz plik beatu” i „Otwórz Arc”.
- **Kolumna:** ścieżka pliku, frontmatter, wypełnienie (X z Y komórek, pierwszy i ostatni wpis), sceny powiązane z kolumną.
- **Scena, beat, sekret:** powiązania, frontmatter, uwagi, przyciski akcji.
- Styl na klasach `.drawer`, `.drawer-title`, `.drawer-label`, `.drawer-field`; nowe klasy tylko tam, gdzie ich brak.
- Usunięcie `PlotGridDetailPanel` i `PlotGridEditorPanel` po przeniesieniu funkcji.

**Kryteria:** klik w komórkę otwiera jeden drawer; zmiana wpisu i zapis aktualizują plik beatu i siatkę; Esc zamyka; niezapisana edycja nie ginie bez ostrzeżenia.

### Etap 3. Widok Plot

- Nagłówek tabeli i kolumna beatów w innych odcieniach, z linią `--accent` pod nagłówkiem.
- Kolumna beatu: numer, nazwa, akt i Range, napięcie i tempo, status.
- Chipy S/P/R/U z nowego `plotGridEvents.ts` (kod, etykieta, token koloru). „Pełna” jest wypełniona, pozostałe w obrysie, żeby nie polegać wyłącznie na kolorze.
- Wiersze-separatory „Akt 1/2/3”, legenda i liczniki w toolbarze.
- Klik w nagłówek kolumny otwiera drawer w trybie Kolumna.

**Kryteria:** układ jak plansza Plot, każda komórka klika się i otwiera drawer, bez przeskoków przy sticky nagłówku (zachować `--header-height`, `z-index` 3 i 5).

### Etap 4. Beats i Scenes

- **Beats:** tabela `#, Beat, Akt, Range, Purpose, Napięcie tempo, Komórki, Sekrety, Status`, pasek z nazwą szablonu, „+ Nowy beat”.
- **Scenes:** tabela `#, Scene, Beat, Akt, Subplot, POV, Status`, powiązanie z beatem po wikilinku.
- Zaznaczony wiersz otwiera drawer, „Pokaż beat” przełącza na Plot i zaznacza wiersz.

**Kryteria:** liczby wierszy zgodne z plikami w `Beats/` i `Scenes/`, sortowanie po `Order`, brakujące pola jako „—”, nie jako błąd.

### Etap 5. Arcs, Subplots, Mechanics

- `PlotGridColumnView` z lewą listą (kolor, nazwa, owner lub `column_order`, „N z M komórek wypełnionych”) i siatką beaty × podkolumny.
- Arcs: blok ghost, lie, truth, want, need, flaws, handicaps, limitations nad siatką. Subplots: opis kolumny. Mechanics: podkolumny typu Wolno / Nie wolno / Notatka.
- Uzupełnienie `getDefinition` wartościami z pliku kolumny.

**Kryteria:** trzy typy z jednego komponentu, wybór kolumny zapamiętany na zakładkę, licznik „X z Y” zgodny z siatką, edycja komórki działa też stąd.

### Etap 6. Secrets

- Macierz sekret × beat (kolumny to `Order`), legenda S/P/R/U, wiersz z ID, tytułem i „cel odsłony: beat N”, czerwona ramka na beacie docelowym.
- Blok „Walidacje” z wynikami `plotGridValidator`: pełna odsłona ma wcześniejszy zasiew, odsłona wypada w beacie docelowym, najwyżej jedna pełna odsłona w beacie.
- Podpięcie `onSelectSecret` do drawera.

**Kryteria:** wynik walidacji zmienia się po edycji beatu; klik w sekret lub zdarzenie otwiera drawer ze zdarzeniami i frontmatterem.

### Etap 7. Walidacja, dostępność, dokumentacja

- Badge walidacji w toolbarze otwiera `PlotGridValidationPanel` (z działającym zamykaniem), kliknięcie problemu przenosi do komórki lub pliku.
- Nawigacja klawiaturą w siatce (strzałki, Enter otwiera drawer, Esc zamyka), widoczny fokus, `aria-label` dla chipów.
- Aktualizacja `feature-status-matrix.md`, dokumentu modułu Writing/PlotGrid i vision; do tego służy skill „aktualizator-dokumentacji”.
- Weryfikacja końcowa: porównanie z planszami makiety, uruchomienie na testowym vaultcie, kontrola obu motywów.

## Decyzje do podjęcia i ryzyka

Decyzje 1 i 2 blokują start Etapu 8, pozostałe można podjąć w trakcie prac. Przy każdej jest rekomendacja, którą trzeba potwierdzić.

### Dla Etapu 8

1. **Jak zapisać nową zakładkę.** Rekomendacja: folder z plikami właścicieli (`Class: Column`, `area: <id>`), zarejestrowany w pliku Book (`custom_areas: [świat]`, `folder_area_świat`), komórki w beatach jako `area_<obszar>_<właściciel>[_<podkolumna>]`. Pasuje do reszty modelu i do płaskiego parsera YAML. Alternatywa: jeden plik definicji zakładki, ale wymaga zagnieżdżonego YAML, a parser ma dziś tylko płaski.
2. **Klucz podkolumny.** Dziś klucz komórki zawiera nazwę, więc jej zmiana musiałaby przepisać wszystkie beaty. Rekomendacja: zapisywać w `subcolumns` pary „id → Nazwa” (jak `field_aliases`), a w kluczu używać id.
3. **Gdzie trzymać „Ukryj”.** Rekomendacja: pole `hidden_subcolumns` w pliku właściciela (płaska lista), żeby ukrycie nie zależało od urządzenia. Alternatywa: `localStorage` z prefiksem `story-spine-`.
4. **Przyciski „+ Nowy Arc / Subplot / Mechanic / Secret / Scene”.** Rekomendacja: poza Etapem 8, jako osobny krok po 8.5. Etap 8 obejmuje podkolumny, „+ Beat” i „+ Zakładka”.
5. **Typ wartości kolumny.** Na start wszystko to lista tekstów. Czy później dodać liczbę i wybór z listy (przydatne dla „Izolacja 0–4” i statusów)?
6. **Import z arkusza.** Wklejenie tabeli z Excela jako sposób na utworzenie kolumn i beatów jednym ruchem. Poza zakresem Etapu 8.

### Dla pozostałych etapów

1. **Drawer lokalny czy globalny.** Instrukcje projektu opisują prawy drawer jako element układu (`RightSidebarContext`), a edycja jest związana ze stanem `usePlotGrid`. Rekomendacja: panel lokalny w `PlotGrid` na klasach `.drawer*`, z możliwością podpięcia do globalnego później.
2. **Migracja kluczy.** Rekomendacja: dual-read na czas przejścia, zapis tylko w nowym modelu.
3. **Widok Walidacja.** Rekomendacja: badge w toolbarze i panel, bez ósmej zakładki, usunąć `PlotGridViewValidation`.
4. **Orientacja `rows`.** Jest już zaimplementowana i występuje w makiecie jako „Układ”, więc zostaje (zmiana względem wcześniejszej wersji planu).
5. **Przełącznik „Pokaż klucze”.** Makieta pokazuje klucz w drawerze („Zapis w pliku”). Rekomendacja: usunąć z siatki.
6. **Kolory S/P/R/U.** Rekomendacja: cztery zmienne w `plot-grid.css` wskazujące na istniejące tokeny (zasiew `--teal-light`, częściowo `--sage-light`, pełna `--sage`, podważenie `--clay-light`) i sprawdzenie czytelności w obu motywach.

### Ryzyka

- **Zapis do plików otwartych jednocześnie w Obsidianie.** Czytać plik tuż przed zapisem, podmieniać tylko jedną linię, po zapisie przeładować dane.
- **Zmiana nazwy podkolumny** przy kluczu z nazwą przepisuje wszystkie beaty; stąd decyzja 2 i obowiązkowy podgląd z kopią zapasową.
- **Dynamiczne zakładki** zmieniają `TabId` i odtwarzanie zapamiętanej zakładki: usunięty obszar musi wracać do Plot.
- **Sticky nagłówek** z dwoma wierszami i kolumną beatów w jednym kontenerze przewijania wymaga zachowania `z-index` 3 i 5 także po dodaniu „+ Kolumna” w nagłówku.
- **Duże vaulty:** ładowanie plików jest sekwencyjne (pętla `await`); sprawdzić czas dla kilkuset beatów i scen.
- **Dwa miejsca prawdy dla zaznaczenia:** trzymać wyłącznie `selection` w `usePlotGrid`.
