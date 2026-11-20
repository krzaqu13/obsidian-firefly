# Plan wdrożenia: PlotGrid UI

Zakres: wyłącznie warstwa UI w `src/features/writing/plot-grid/`, tak aby odpowiadała makiecie „PlotGrid: przykład” (7 widoków + prawy drawer). Plan uwzględnia kod, który już jest w folderze (18 plików, wersja wcześniejsza niż makieta), oraz zasady z instrukcji projektu: tokeny zamiast wartości na sztywno, Lucide `strokeWidth` 1.4, stan w `usePlotGrid`/`App.tsx`, bez nowych zależności.

## 1. Co wynika z przeglądu kodu

**Stan wyjściowy.** Działa kontener `PlotGrid.tsx` z 4 zakładkami (Plotgrid, Tajemnice, Arc, Walidacja), tabela z nagłówkami pasmowymi, komórki z listą wpisów, edycja listy w panelu bocznym i zapis frontmattera przez `vaultAPI.writeFile`. Makieta ma 7 widoków i jeden wspólny drawer, więc większość pracy to przebudowa układu i dodanie 3 widoków list, a nie pisanie od zera.

**Problemy do naprawy przy okazji (znalezione w kodzie):**

- **Klucze komórek.** Loader i zapis używają `cell_<kolumna>[_<podkolumna>]`, ale `PlotGridCell` i `PlotGridDetailPanel` pokazują `kom_…`. Użytkownik widzi inny klucz niż ten, który trafia do pliku. Docelowo klucze to `arc_/subplot_/mechanic_` (model z dokumentu frontmattera).
- **Parser YAML w `plotGridLoader.ts` (`parseSimpleYAML`).** Zapisuje do wyniku tę samą tablicę `arrayValues`, a potem czyści ją przez `arrayValues.length = 0`. Zapisane wcześniej listy mogą więc wychodzić puste lub współdzielone. Do potwierdzenia testem na pliku z dwoma listami; jeśli się potwierdzi, trzeba to naprawić przed Etapem 2, bo drawer edytuje właśnie listy.
- **CSS używa nieistniejących zmiennych.** `plot-grid.css` odwołuje się do `--bg-primary`, `--bg-secondary`, `--bg-hover`, `--border-color`, `--accent-color`, `--accent-bg-light` z jasnymi wartościami zapasowymi (`#fff`, `#f9f9f9`, `#e5e5e5`). Zmiennych nie ma w `index.css`, więc widoki Arc, Walidacja, panel szczegółów i edytora wychodzą jasne na ciemnej aplikacji.
- **Kolory na sztywno:** chipy sekretów (`#dbeafe`, `#fef3c7` …), błędy (`#fef2f2`, `#991b1b`), `#dc2626`, `#e0a24a`, `#7fa8d1`, `#6fbf86`, `--k-*` w `:root`, `#6c9ccc` w `PlotGridTable.tsx`.
- **Martwy plik tokenów.** `src/styles/tokens.css` jest oznaczony jako historyczny artefakt i nie jest importowany. Aktywny system to Earthy Ink w `src/styles/index.css` (Slate Pro jako opcjonalny motyw). Instrukcje projektu nadal wskazują `tokens.css`, więc warto je poprawić.
- **Szczątki:** orientacja `rows` kończy komunikatem „not yet implemented”, `selectedSecretId={null}` i `onSelectSecret={() => {}}` w widoku sekretów, `onClose={() => {}}` w panelu walidacji, nieużywany import `DetailPanel` w tabeli, `okItems` w widoku walidacji na sztywno, mieszanka polskich i angielskich napisów („Save Changes”, „+ Add Item”).
- **Skróty chipów.** `eventType.charAt(0)` daje to samo `P` dla `pelne` i `podwazenie`. Makieta rozwiązuje to przez S/P/R/U (zasiew, częściowo, pełna, podważenie).

## 2. Mapowanie makiety na komponenty

| Element makiety | Komponent | Decyzja |
| --- | --- | --- |
| Pasek zakładek: Plot, Beats, Scenes, Arcs, Subplots, Mechanics, Secrets | `PlotGridToolbar` → wydzielić `PlotGridTabs` | przebudować, `TabId` rozszerzyć o 7 wartości |
| Plot (siatka beaty × kolumny) | `PlotGridTable`, `PlotGridCell`, `PlotGridSecretChips` | przebudować |
| Beats (lista) | `PlotGridBeatsView` | nowy |
| Scenes (lista) | `PlotGridScenesView` | nowy |
| Arcs, Subplots, Mechanics (lista po lewej + siatka wybranej kolumny) | `PlotGridColumnView` (parametr `type`) | uogólnić `PlotGridArcView` |
| Secrets (macierz zdarzeń + walidacje) | `PlotGridSecretsView` | przebudować |
| Prawy drawer, przełącznik Komórka / Kolumna | `PlotGridDrawer` | nowy, zastępuje `PlotGridDetailPanel` i `PlotGridEditorPanel` |
| Walidacje | `PlotGridValidationPanel` (przez badge w toolbarze) | zostaje, `PlotGridViewValidation` do usunięcia po decyzji 3 |
| Pusty stan, błędy ładowania | `PlotGridEmptyState`, kolaps błędów w toolbarze | zostają, tylko tokeny i polskie napisy |

Nowe pliki pomocnicze: `plotGridEvents.ts` (stałe S/P/R/U: kod, etykieta, token koloru) oraz podział CSS na `plot-grid.css` (układ, tabela), `plot-grid-drawer.css` i `plot-grid-views.css`. Nazwy komponentów PascalCase, CSS kebab-case, zgodnie z konwencją projektu.

## 3. Zmiany w stanie (`usePlotGrid`)

- `activeTab: TabId` obejmuje `plot | beats | scenes | arcs | subplots | mechanics | secrets`.
- Jedno pole `selection` zamiast `selectedCell` + `editorOpen`:
  - `{ kind: 'cell', beat, columnKey }`
  - `{ kind: 'column', id }`
  - `{ kind: 'beat', name }`
  - `{ kind: 'scene', name }`
  - `{ kind: 'secret', id }`
  - `null` (drawer zamknięty)
- Drawer ma tryb `cell | column` (przełącznik z makiety). Zaznaczenie komórki otwiera tryb Komórka, kliknięcie nagłówka kolumny tryb Kolumna.
- `selectedArcId` zostaje jako wybrana kolumna w widokach Arcs/Subplots/Mechanics (zamiast selecta w toolbarze).
- `orientation` i `showKeys`: patrz decyzje 4 i 5.
- Zapis nadal przez `saveChanges`; zmienić tylko mapowanie klucza na nowy model.

## 4. Etapy

### Etap 0. Porządki bez zmiany wyglądu układu

- Zamiana wszystkich zmiennych i kolorów w `plot-grid.css` i `PlotGridTable.tsx` na tokeny z `index.css` (`--bg-panel/surface/raised/active`, `--text-*`, `--accent`, `--accent-fg`, rodziny `--teal/--sage/--clay/--danger`, `--border-*`, `--radius-*`, `--space-*`, `--font-*`, `--duration-*`). Zakres w `docs/`: poprawić wzmianki o `tokens.css`.
- Polskie napisy w całym UI, ikony Lucide `strokeWidth` 1.4.
- Naprawa wyświetlania klucza (`kom_` → rzeczywisty klucz) oraz test parsera YAML z dwiema listami.
- Usunięcie martwych fragmentów (nieużywany import, puste handlery podpiąć w Etapach 1 i 6).

**Kryteria akceptacji:** w `plot-grid*.css` i plikach `.tsx` brak kolorów hex i brak zmiennych spoza `index.css`; wszystkie widoki wyglądają poprawnie w Earthy Ink i Slate Pro; klucz pokazany w UI jest identyczny z zapisanym w pliku; parser zachowuje dwie różne listy w jednym frontmatterze.

### Etap 1. Szkielet 7 widoków

- `PlotGridTabs` z 7 zakładkami, nagłówek „KSIĄŻKA · \<nazwa>” i podtytuł „N plików w folderze …” z makiety.
- Układ: toolbar, widok (flex 1), drawer po prawej (stała szerokość ok. 400 px z makiety, z `min-width: 0` dla widoku).
- Puste widoki-placeholdery dla Beats, Scenes, Subplots, Mechanics, żeby nawigacja działała od razu.

**Kryteria:** przełączanie 7 zakładek bez błędów w konsoli; wybrana zakładka zapamiętana między przeładowaniami (localStorage, prefiks `story-spine-`); brak aktywnej książki nadal pokazuje `PlotGridEmptyState`.

### Etap 2. Drawer

- `PlotGridDrawer` z przełącznikiem Komórka / Kolumna i zawartością zależną od `selection.kind`:
  - **Komórka:** tytuł „beat · kolumna”, lista wpisów z edycją inline (logika z `PlotGridEditorPanel`: dodaj, usuń, zapisz), „Zapis w pliku” (ścieżka beatu i klucz YAML), link do pliku kolumny.
  - **Kolumna:** ścieżka pliku, frontmatter, wypełnienie (X z Y komórek, pierwszy i ostatni wpis), sceny powiązane z kolumną.
  - **Scena / Beat / Sekret:** powiązania, frontmatter, uwagi, przyciski „Otwórz plik”, „Pokaż beat”, „Pokaż w PlotGrid”.
- Styl na bazie istniejących klas `.drawer`, `.drawer-title`, `.drawer-label`, `.drawer-field` z `drawer.css`; nowe klasy tylko dla elementów, których tam nie ma.
- Usunięcie `PlotGridDetailPanel` i `PlotGridEditorPanel` po przeniesieniu funkcji.

**Kryteria:** klik w komórkę otwiera drawer, zmiana wpisu i zapis aktualizują plik beatu i siatkę; Esc zamyka drawer; zaznaczenie zostaje po przełączeniu zakładek, jeśli dotyczy tej samej kolumny; brak utraty niezapisanej edycji bez ostrzeżenia.

### Etap 3. Widok Plot (siatka)

- Nagłówek tabeli i kolumna beatów w innych odcieniach niż reszta (komentarz z makiety), z akcentową linią pod nagłówkiem; mapowanie na `--bg-raised` i `--bg-panel` z `--accent` jako linią.
- Kolumna beatu: numer, nazwa, akt/Range, **Napięcie, tempo** (`StoryTension` i `StoryPacing` jako „4, 5”), status.
- Chipy S/P/R/U z `plotGridEvents.ts` (osobny kolor tokenowy i litera; „pełna” wypełniony, pozostałe obrys, żeby nie polegać wyłącznie na kolorze).
- Klik w nagłówek kolumny otwiera drawer w trybie Kolumna.

**Kryteria:** ten sam układ co plansza Plot; każda z 12 komórek przykładowych klika się i otwiera drawer; brak przeskoków układu przy sticky nagłówku (zachować efekt `--header-height`).

### Etap 4. Beats i Scenes

- **Beats:** tabela `#, Beat, Akt, Range, Purpose, Napięcie tempo, Komórki, Sekrety, Status`, pasek z nazwą szablonu, przycisk „+ Nowy beat” (decyzja 6).
- **Scenes:** tabela `#, Scene, Beat, Akt, Subplot, POV, Status`; powiązanie z beatem po wikilinku `Beat`.
- Wiersz zaznaczony otwiera drawer; „Pokaż beat” przełącza zakładkę na Plot i zaznacza wiersz.

**Kryteria:** liczby kolumn i wierszy zgodne z plikami w folderach `Beats/` i `Scenes/`; sortowanie po `Order`; brakujące pola jako „—”, nie jako błąd.

### Etap 5. Arcs, Subplots, Mechanics

- `PlotGridColumnView` z lewą listą (nazwa, owner lub column\_order, „N z M komórek wypełnionych”) i siatką beaty × podkolumny wybranej kolumny.
- **Arcs:** blok atrybutów ghost, lie, truth, want, need, flaws, handicaps, limitations („jeszcze niezdefiniowane” i „brak” jako wartości puste) nad siatką.
- **Subplots:** opis kolumny nad siatką.
- **Mechanics:** siatka z podkolumnami (np. Wolno / Nie wolno / Notatka).
- Uzupełnienie `getDefinition` (obecnie TODO) wartościami z pliku kolumny.

**Kryteria:** wszystkie trzy typy z jednego komponentu; wybór kolumny zapamiętany na zakładkę; licznik „X z Y” zgadza się z siatką; edycja komórki działa też z tych widoków.

### Etap 6. Secrets

- Macierz sekret × beat (kolumny to `Order` beatu), legenda S/P/R/U, wiersz sekretu z ID, tytułem i „cel odsłony: beat N”, czerwona ramka na beacie docelowym (`reveal_target`).
- Blok „Walidacje” pod macierzą z realnymi wynikami `plotGridValidator` (koniec z `okItems` na sztywno): pełna odsłona ma wcześniejszy zasiew, odsłona w beacie docelowym, nie więcej niż jedna pełna odsłona w beacie.
- Podpięcie `onSelectSecret` do drawera.

**Kryteria:** wynik walidacji zmienia się po edycji beatu; klik w sekret lub w komórkę zdarzenia otwiera drawer ze zdarzeniami i frontmatterem.

### Etap 7. Walidacja, dostępność, dokumentacja

- Badge walidacji w toolbarze otwiera `PlotGridValidationPanel`, z działającym zamykaniem; kliknięcie problemu przenosi do komórki lub pliku.
- Nawigacja klawiaturą w siatce (strzałki, Enter otwiera drawer, Esc zamyka), widoczny fokus, `aria-label` dla chipów S/P/R/U.
- Aktualizacja `feature-status-matrix.md`, dokumentu modułu Writing/PlotGrid oraz vision (7 widoków, drawer); do tego nadaje się skill „aktualizator-dokumentacji”.
- Weryfikacja końcowa: porównanie z planszami makiety, uruchomienie na **testowym** vaultcie (nie na prawdziwych notatkach), kontrola obu motywów.

## 5. Zależność od warstwy danych

Widoki z Etapów 3 do 6 potrzebują pól nowego modelu: `Range`, `Purpose`, `StoryTension`, `StoryPacing`, `Status`, `POV`, `arc_/subplot_/mechanic_`, `secret_seed/partial/reveal/undermine`, `title`, `color`, `fact`, `known_by`, `seed_required`, `ghost/lie/truth`. Obecny loader czyta stare klucze (`stan`, `nazwa`, `kolor`, `podkolumny`, `tytul`, `secret_zasiew` …). Plan zakłada **równoległy, wąski krok D** (poza zakresem UI): loader czyta klucze nowe, a w razie ich braku stare, zapis tylko w nowym modelu. Krok D powinien być gotowy przed Etapem 3.

## 6. Decyzje do podjęcia

1. **Drawer: lokalny czy globalny.** Instrukcje projektu opisują prawy drawer jako element układu (`RightSidebarContext`). Edycja komórki jest jednak mocno związana ze stanem `usePlotGrid`, a makieta pokazuje drawer wewnątrz widoku. Rekomendacja: panel lokalny w `PlotGrid` na klasach `.drawer*`, z możliwością podpięcia do globalnego później. Wymaga potwierdzenia, bo to decyzja architektoniczna.
2. **Migracja kluczy.** Czy dopuszczamy odczyt starych kluczy (dual-read) na czas przejścia? Rekomendacja: tak, zapis tylko nowy.
3. **Widok Walidacja.** Makieta nie ma ósmej zakładki. Rekomendacja: badge w toolbarze + panel, usunąć `PlotGridViewValidation`.
4. **Orientacja `rows`.** Niezaimplementowana i nieobecna w makiecie. Rekomendacja: usunąć przełącznik, wrócić do tematu przy realnej potrzebie.
5. **Przełącznik „pokaż klucze”.** Makieta pokazuje klucz w drawerze („Zapis w pliku”). Rekomendacja: usunąć z siatki.
6. **Przyciski „+ Nowy …”.** Makieta zaznacza, że widok nie zmienia plików. Rekomendacja: w tym planie wyłączone lub ukryte, tworzenie plików jako osobny krok.
7. **Kolory S/P/R/U.** Rekomendacja: zdefiniować w `plot-grid.css` cztery zmienne wskazujące na istniejące tokeny (seed = `--teal-light`, partial = `--sage-light`, reveal = `--sage`, undermine = `--clay-light`) i ocenić czytelność na obu motywach.

## 7. Ryzyka

- Wysokość sticky nagłówka z dwoma wierszami i kolumna beatów sticky-left w jednym kontenerze przewijania wymagają zachowania obecnych `z-index` (3 i 5).
- Duże vaulty: ładowanie plików sekwencyjne (pętla `await`). Nie blokuje planu, ale warto sprawdzić czas dla kilkuset beatów i scen.
- Dwa miejsca prawdy dla zaznaczenia po rozbiciu na widoki: trzymać wyłącznie `selection` w `usePlotGrid`.

## 8. Etap 8: kolumny tworzone w siatce (od pustego arkusza)

Punkt wyjścia: arkusz PlotGrid\_v.3.2.xlsx. Autor zaczyna od pustej tabeli i sam dokłada kolumny („Etap testu Kłamstwa", „Izolacja 0–4", „Do wymyślenia"), a dopiero potem okazuje się, które z nich są czymś stałym. Aplikacja nie narzuca szablonu kolumn. Nowa kolumna w istniejącej zakładce **nie tworzy pliku**: to wpis w pliku właściciela, a jej komórki są atrybutami beatów, jak wszystkie pozostałe. Nowy folder pojawia się dopiero przy nowej zakładce.

### Zasady

- **Kolumna w istniejącej zakładce to podkolumna, nie plik.** W Arcs, Subplots i Mechanics „+ Kolumna" dopisuje nazwę do `subcolumns` pliku właściciela (np. Arc Merharina dostaje podkolumnę „Rana"). Komórki zapisują się w beatach jako atrybuty (`arc_<id>_<podkolumna>`), czyli dokładnie tak jak dziś. Zapis do pliku właściciela to jedna linia, więc robi się go od razu, bez stanu szkicu.
- **Nowy plik powstaje tylko dla nowego właściciela:** „+ Nowy Arc" (nowa postać), „+ Nowy Subplot", „+ Nowy Mechanic". To osobne przyciski, już obecne w makiecie, a nie to samo co „+ Kolumna".
- **Nowy folder tylko przy nowej zakładce.** Zakładka własna (np. „Świat") to nowy obszar z własnymi właścicielami i kolumnami; szczegóły w decyzji 1.
- **Bez wymaganych pól.** Do dodania podkolumny wystarczy nazwa. Pozostałe pola pliku (ghost, lie…) są opcjonalne i uzupełnia się je później.
- **Przestawianie kolejności** zmienia kolejność na liście `subcolumns` (dla właścicieli: `column_order`).
- **Usuwanie ostrożnie.** Domyślnie „Ukryj". „Usuń" pokazuje liczbę beatów z wpisami w tej podkolumnie i robi kopię zapasową w `.firefly/backups/`.

### Pusty start

Książka bez szablonu beatów (opcja „Własny / pusty") otwiera PlotGrid z pustą siatką: wiersze beatów też dodaje się z poziomu siatki („+ Beat"), bez wcześniejszego wybierania szablonu.

### Mapowanie na atrybuty

Komórki nowej kolumny są już atrybutami beatu, więc osobne mapowanie nie jest potrzebne, żeby dane były użyteczne. Zostaje tylko opcjonalna akcja „Przypisz znaczenie…" w menu kolumny, która pozwala powiedzieć, że np. podkolumna „Napięcie" to `StoryTension` beatu albo „Rana" to `ghost` łuku. W pliku właściciela zapisuje się `maps_to`, a przepisanie wartości poprzedza podgląd zmian i kopia zapasowa (mechanizm z etapu 2 dla książek). Rekomendacja: wyciąć to z pierwszej wersji etapu 8 i wrócić, gdy faktycznie pojawi się potrzeba.

### Zakres UI

- „+ Kolumna" w widokach Arcs, Subplots i Mechanics (popover: nazwa; w widoku Plot dodatkowo wybór właściciela).
- Menu podkolumny w nagłówku: zmień nazwę, kolejność, ukryj, usuń.
- „+ Zakładka" na pasku zakładek (popover: nazwa, kolor), tworzy folder i wpis w pliku Book.
- „+ Atrybut" w bloku atrybutów Arcs (własne atrybuty łuku jako `attr_<slug>` z etykietą), dla aspektów takich jak Granica czy Pokusa w finale.
- Opcjonalnie: „Przypisz znaczenie…" i podgląd w drawerze (patrz wyżej).

### Kryteria akceptacji

- „+ Kolumna" w Arcs nie tworzy żadnego pliku, zmienia tylko `subcolumns` właściciela.
- Nowa podkolumna jest widoczna w Arcs i w Plot, a wpis w komórce zapisuje się w beacie jako atrybut.
- Nowa zakładka tworzy folder i wpis w pliku Book; jej usunięcie nie kasuje plików.
- Zmiana nazwy podkolumny nie gubi wpisów w beatach.
- Loader i walidator czytają dodane kolumny bez dodatkowych zmian.
- Z pustej książki da się dodać beat i kolumnę wyłącznie z siatki.

### Decyzje do podjęcia

1. **Jak zapisać nową zakładkę.** Rekomendacja: folder z plikami właścicieli (`Class: Column`, `area: <id>`), zarejestrowany w pliku Book (`custom_areas: [świat]`, `folder_area_świat`), komórki w beatach jako `area_<obszar>_<właściciel>[_<podkolumna>]`. To zgodne z resztą modelu i z płaskim parserem YAML. Alternatywa: jeden plik definicji zakładki, ale wymaga zagnieżdżonego YAML, a parser ma dziś tylko płaskie.
2. **Klucz podkolumny.** Dziś klucz komórki zawiera nazwę podkolumny, więc jej zmiana nazwy musiałaby przepisać wszystkie beaty (z podglądem i kopią). Rekomendacja: zapisywać w `subcolumns` pary „id -> Nazwa" (jak `field_aliases`), a w kluczu używać id.
3. **Typ wartości kolumny.** Na start wszystko to lista tekstów. Czy w kolejnej wersji dodajemy liczbę i wybór z listy (przydatne dla „Izolacja 0–4" i statusów).
4. **Import z arkusza.** Wklejenie tabeli z Excela jako sposób na utworzenie kolumn i beatów jednym ruchem. Poza zakresem etapu 8.
