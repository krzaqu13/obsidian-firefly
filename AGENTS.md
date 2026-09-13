# Firefly Plugin — Instrukcja dla agentów AI

Przeczytaj ten plik w całości przed wykonaniem jakiegokolwiek zadania.

---

## Czym jest ten projekt

Wtyczka do Obsidiana o nazwie **Firefly** — narzędzie narracyjne dla pisarzy. Zbudowana w czystym TypeScript + Obsidian API, bez żadnych zewnętrznych frameworków UI. Kompilowana przez `esbuild`.

Repozytorium zawiera dwa systemy które współistnieją:
- **StoryLine** — oryginalna wtyczka (pliki w `views/`, `components/`, `services/`, `models/`, `utils/` w korzeniu)
- **Firefly** — nowy system nawigacyjny w trakcie budowy (pliki w `firefly/`)

Nie mieszaj tych dwóch systemów. Jeśli zadanie dotyczy Firefly, pracuj wyłącznie w `firefly/` i `styles.css`.

---

## Mapa plików Firefly

```
firefly/
├── constants.ts                  — stałe: VIEW_TYPE, EVENT_AREA_CHANGED, AREA_ORDER, AreaId
├── models/
│   └── Area.ts                   — interfejs AreaConfig (id, label, icon)
├── services/
│   └── AreaManager.ts            — getCurrentAreaId(), setCurrentArea(), getActiveTabForArea(), setActiveTab()
└── views/
    ├── FireflyMainView.ts        — główny ItemView: area-sidebar + topbar + inner-sidebar + main-section
    ├── FireflyFileBrowserView.ts — drzewo plików w lewym panelu Obsidiana (osobny ItemView)
    └── areas/
        └── WritingChapterList.ts — komponent listy rozdziałów (renderuje się w main-section)

styles.css                        — JEDEN plik CSS dla całej wtyczki (~4000+ linii)
main.ts                           — Plugin class: onload(), openFireflyFileBrowser(), areaManager
```

### Pliki krytyczne — szczególna ostrożność

| Plik | Ryzyko |
|------|--------|
| `styles.css` | Jeden plik dla całej wtyczki. Usunięcie istniejących reguł psuje StoryLine. |
| `firefly/services/AreaManager.ts` | Centralny stan obszarów. Zmiana API psuje cały system nawigacji. |
| `main.ts` | Punkt wejścia wtyczki. Błąd tu = wtyczka nie ładuje się w ogóle. |

---

## Zasady operacyjne — stosuj zawsze

### Przed edycją każdego pliku

1. **Odczytaj plik w całości** zanim go zmodyfikujesz. Nigdy nie edytuj pliku którego nie przeczytałeś w tej sesji.
2. **Sprawdź ile ma linii.** Jeśli po edycji plik ma mniej linii niż przed — coś usunąłeś czego nie powinieneś.

### Przy wyborze narzędzia do edycji

- `str_replace` lub `edit_file` — do modyfikacji konkretnego fragmentu istniejącego pliku
- `write_file` — **tylko do tworzenia nowych plików które jeszcze nie istnieją**
- **Nigdy nie używaj `write_file` na `styles.css`** — ten plik ma 4000+ linii których nie możesz stracić
- **Nigdy nie używaj `write_file` na plik który już istnieje** chyba że zadanie jawnie mówi "zastąp cały plik"

### Przy edycji styles.css

- Nowe reguły CSS zawsze **dopisuj na końcu pliku**
- Nie usuwaj ani nie zmieniaj istniejących reguł chyba że zadanie tego wprost wymaga
- Używaj wyłącznie zmiennych CSS Obsidiana — lista poniżej
- Przed dopisaniem sprawdź czy klasa którą chcesz dodać już nie istnieje w pliku

### Przy edycji TypeScript

- Nie usuwaj istniejących metod chyba że zadanie tego wprost wymaga
- Nie zmieniaj sygnatur metod w `AreaManager.ts` — to publiczne API
- Nie dodawaj importów których nie potrzebujesz
- Nie dodawaj zależności `npm` — najpierw sprawdź czy Obsidian API nie ma tego wbudowanego

### Po każdej zmianie

- Uruchom `npm run dev` i potwierdź 0 błędów TypeScript
- Jeśli są błędy — napraw je przed przejściem dalej, nie ignoruj

---

## Zasady UI — stosuj zawsze

### CSS: tylko zmienne Obsidiana

Nigdy nie używaj kolorów hex, rgb() ani nazwanych kolorów. Tylko:

```
Tła:        var(--background-primary)
            var(--background-secondary)
            var(--background-modifier-hover)
            var(--background-modifier-active-hover)
            var(--background-modifier-border)

Tekst:      var(--text-normal)
            var(--text-muted)
            var(--text-faint)
            var(--text-accent)
            var(--text-on-accent)
            var(--text-error)

Typografia: var(--font-ui-small)
            var(--font-ui-medium)
            var(--font-ui-larger)

Kształt:    var(--radius-s)
            var(--radius-m)
            var(--shadow-s)
```

### Ikony

Używaj wyłącznie `setIcon(element, 'nazwa-lucide')` z Obsidian API.
Stroke-width dla ikon Firefly: `1.4` — ustawiaj przez CSS na `svg` wewnątrz kontenera ikony.

### Obsidian API w TypeScript

```typescript
// Zdarzenia — zawsze przez registerEvent
this.registerEvent(this.app.workspace.on('...', handler));

// Odczyt metadanych
this.app.metadataCache.getFileCache(file);

// Zapis metadanych
this.app.fileManager.processFrontMatter(file, (fm) => { fm.pole = wartość; });

// Vault
this.app.vault.read(file);
this.app.vault.modify(file, content);
```

---

## Architektura Firefly — jak to działa

### Nawigacja obszarów

`AreaManager` przechowuje aktywny obszar (`AreaId`). Po zmianie obszaru emituje event `FIREFLY_EVENT_AREA_CHANGED`. `FireflyMainView` nasłuchuje na ten event i aktualizuje UI.

`AreaId` to jeden z: `'home' | 'writing' | 'worldbuilding' | 'databases' | 'connections' | 'dashboard'`

### Struktura DOM FireflyMainView

```
.firefly-main-view
└── .firefly-root (flex-row, height: 100%)
    ├── .firefly-area-sidebar   (48px — pionowy pasek ikon obszarów)
    └── .firefly-right-panel    (flex-col, flex: 1)
        ├── .firefly-topbar     (44px — przyciski widoku + akcje)
        └── .firefly-body       (flex-row, flex: 1)
            ├── .firefly-inner-sidebar  (220px — zakładki obszaru)
            └── .firefly-main-section   (flex: 1 — główna treść)
```

**Nie zmieniaj `.firefly-area-sidebar`** — to zewnętrzny pasek obszarów z działającą logiką.

### Dodawanie nowej treści do main-section

Nowe komponenty obszarów twórz w `firefly/views/areas/`. Wzorzec:

```typescript
export class NazwaKomponentu {
    constructor(private plugin: SceneCardsPlugin) {}

    render(container: HTMLElement): void {
        container.empty();
        // buduj DOM tutaj
    }
}
```

Importuj i wywołuj w `FireflyMainView.buildMainSection()` lub dedykowanej metodzie.

---

## Jak interpretować zlecenia

**Krótkie zlecenie = zrób minimalną zmianę.**
"Dodaj hover do `.firefly-sidebar-item`" oznacza: dopisz regułę CSS. Nie refaktoryzuj reszty pliku.

**Jeśli zlecenie jest niejednoznaczne** — zapytaj zamiast zgadywać. Lepiej jedno pytanie niż naprawienie błędu po fakcie.

**Jeśli widzisz że zmiana zepsuje coś innego** — powiedz o tym przed implementacją, nie po.

**Zakres zlecenia = tylko to co zostało powiedziane.** Nie "ulepszaj przy okazji", nie refaktoryzuj innych metod, nie zmieniaj wcięć w całym pliku.
