# Plan layoutu 3-strefowego — Firefly Plugin

> **Typ dokumentu:** instrukcja implementacyjna dla agenta AI
> **Plik docelowy:** `firefly/views/FireflyMainView.ts` + `styles.css`
> **Zależności:** przeczytaj `FIREFLY-NAVIGATION-PLAN.md` i `AGENTS.md` zanim zaczniesz

---

## Zasady pracy obowiązujące w tej sesji

Zanim wykonasz jakikolwiek krok, przeczytaj i zapamiętaj:

1. **Nigdy nie używaj `write_file` na `styles.css`.** Ten plik ma ~4000 linii istniejącego kodu który musisz zachować. Użyj wyłącznie `edit_file` lub `str_replace` — tylko operacji które DOPISUJĄ na końcu lub zastępują konkretny fragment.
2. **Przed edycją każdego pliku — odczytaj go w całości.** Nie modyfikuj pliku którego nie przeczytałeś w tej sesji.
3. **Nie usuwaj żadnych istniejących metod ani CSS** chyba że krok jawnie mówi "usuń X".
4. **Po każdym kroku** sprawdź czy plik wygląda tak jak powinien zanim przejdziesz dalej.

---

## Co ma powstać

Trzy strefy layoutu wewnątrz `firefly-right-panel` — czysty HTML/CSS, bez logiki kliknięć:

```
┌──────────────────────────────────────────────────────────┐
│  TOPBAR: [List] [Tree] [Kanban] [Calendar]   [🔍][🔔][⚙]│
├────────────────────┬─────────────────────────────────────┤
│  INNER SIDEBAR     │  MAIN SECTION                       │
│  • Rozdziały ←     │                                     │
│  • Oś czasu        │   (ikona + "Brak elementów")        │
│  • Manuskrypt      │                                     │
│  • Statystyki      │                                     │
│  ─────────────     │                                     │
│  PROJECTS          │                                     │
│  • Add Project     │                                     │
│  ─────────────     │                                     │
│  OTHER VIEWS       │                                     │
│  • Porównanie      │                                     │
│  • Łuki postaci    │                                     │
└────────────────────┴─────────────────────────────────────┘
```

---

## Krok 1 — Odczytaj FireflyMainView.ts

Odczytaj plik `firefly/views/FireflyMainView.ts` w całości. Potwierdź że widzisz:
- pola klasy: `sidebarEl`, `topbarEl`, `innerSidebarEl`, `mainSectionEl`
- metodę `renderAreaSidebar()`
- metodę `onAreaChanged()`
- metody `buildTopbar()`, `buildInnerSidebar()`, `buildMainSection()` (szkielety już istnieją)

Jeśli widzisz inną strukturę — zatrzymaj się i zgłoś rozbieżność zamiast kontynuować.

---

## Krok 2 — Odczytaj styles.css

Odczytaj ostatnie 100 linii `styles.css`. Potwierdź że plik istnieje i ma więcej niż 200 linii. Jeśli plik ma mniej niż 200 linii — zatrzymaj się i zgłoś to.

---

## Krok 3 — Zaktualizuj FireflyMainView.ts

Użyj `str_replace` lub `edit_file`. Nie używaj `write_file`.

Wprowadź dokładnie te zmiany — nic więcej:

### 3a. Upewnij się że `onOpen()` buduje właściwą strukturę

Fragment `onOpen()` po `renderAreaSidebar()` powinien wyglądać dokładnie tak:

```typescript
this.renderAreaSidebar();
this.buildTopbar(this.topbarEl!);
this.buildInnerSidebar(this.innerSidebarEl!);
this.buildMainSection(this.mainSectionEl!);
```

### 3b. Metoda `buildTopbar(el: HTMLElement)`

Zastąp istniejący szkielet tą implementacją:

```typescript
private buildTopbar(el: HTMLElement): void {
    const left = el.createDiv('firefly-topbar-left');

    const viewConfigs = [
        { label: 'List',     icon: 'list',       isActive: true  },
        { label: 'Tree',     icon: 'git-branch',  isActive: false },
        { label: 'Kanban',   icon: 'columns-2',   isActive: false },
        { label: 'Calendar', icon: 'calendar',    isActive: false },
    ];

    for (const cfg of viewConfigs) {
        const btn = left.createEl('button', {
            cls: `firefly-view-btn${cfg.isActive ? ' is-active' : ''}`,
        });
        setIcon(btn.createSpan({ cls: 'firefly-view-btn-icon' }), cfg.icon);
        btn.createSpan({ cls: 'firefly-view-btn-label', text: cfg.label });
    }

    const right = el.createDiv('firefly-topbar-right');
    for (const icon of ['search', 'bell', 'settings']) {
        const btn = right.createEl('button', { cls: 'firefly-topbar-icon-btn' });
        setIcon(btn.createSpan(), icon);
    }
}
```

### 3c. Metoda `buildInnerSidebar(el: HTMLElement)`

Zastąp istniejący szkielet tą implementacją:

```typescript
private buildInnerSidebar(el: HTMLElement): void {
    // Sekcja 1 — bez nagłówka
    const section1 = el.createDiv('firefly-sidebar-section');
    for (const item of [
        { icon: 'list',        label: 'Rozdziały',  isActive: true  },
        { icon: 'clock',       label: 'Oś czasu',   isActive: false },
        { icon: 'book-open',   label: 'Manuskrypt',  isActive: false },
        { icon: 'bar-chart-2', label: 'Statystyki',  isActive: false },
    ]) {
        const div = section1.createDiv({
            cls: `firefly-sidebar-item${item.isActive ? ' is-active' : ''}`,
        });
        setIcon(div.createSpan({ cls: 'firefly-sidebar-item-icon' }), item.icon);
        div.createSpan({ cls: 'firefly-sidebar-item-label', text: item.label });
    }

    el.createDiv('firefly-sidebar-separator');

    // Sekcja 2 — PROJECTS
    const section2 = el.createDiv('firefly-sidebar-section');
    section2.createDiv({ cls: 'firefly-sidebar-section-header', text: 'PROJECTS' });
    const addProject = section2.createDiv('firefly-sidebar-item');
    setIcon(addProject.createSpan({ cls: 'firefly-sidebar-item-icon' }), 'circle-dashed');
    addProject.createSpan({ cls: 'firefly-sidebar-item-label', text: 'Add Project' });

    el.createDiv('firefly-sidebar-separator');

    // Sekcja 3 — OTHER VIEWS
    const section3 = el.createDiv('firefly-sidebar-section');
    section3.createDiv({ cls: 'firefly-sidebar-section-header', text: 'OTHER VIEWS' });
    for (const item of [
        { icon: 'columns-2',   label: 'Porównanie'   },
        { icon: 'trending-up', label: 'Łuki postaci' },
    ]) {
        const div = section3.createDiv('firefly-sidebar-item');
        setIcon(div.createSpan({ cls: 'firefly-sidebar-item-icon' }), item.icon);
        div.createSpan({ cls: 'firefly-sidebar-item-label', text: item.label });
    }
}
```

### 3d. Metoda `buildMainSection(el: HTMLElement)`

Zastąp istniejący szkielet tą implementacją:

```typescript
private buildMainSection(el: HTMLElement): void {
    const empty = el.createDiv('firefly-empty-state');
    setIcon(empty.createSpan({ cls: 'firefly-empty-icon' }), 'inbox');
    empty.createEl('p', { cls: 'firefly-empty-title',    text: 'Brak elementów' });
    empty.createEl('p', { cls: 'firefly-empty-subtitle', text: 'Wybierz zakładkę po lewej, aby zacząć.' });
}
```

---

## Krok 4 — Dopisz CSS na końcu styles.css

Użyj `edit_file` lub `str_replace` żeby DOPISAĆ na sam koniec `styles.css` poniższy blok. Nie zastępuj żadnej istniejącej zawartości.

```css
/* ─── Firefly: layout 3-strefowy ───────────────────────── */

.firefly-right-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
}

.firefly-body {
    display: flex;
    flex-direction: row;
    flex: 1;
    overflow: hidden;
}

/* Topbar */
.firefly-topbar {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    height: 44px;
    flex-shrink: 0;
    padding: 0 12px;
    background-color: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
}

.firefly-topbar-left {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 2px;
}

.firefly-topbar-right {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
}

.firefly-view-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    height: 32px;
    border: none;
    border-radius: var(--radius-s);
    background: none;
    cursor: pointer;
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    white-space: nowrap;
    transition: background-color 100ms ease, color 100ms ease;
}

.firefly-view-btn:hover {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
}

.firefly-view-btn.is-active {
    color: var(--text-normal);
    background-color: var(--background-modifier-active-hover);
}

.firefly-view-btn svg {
    width: 14px;
    height: 14px;
    stroke-width: 1.4;
}

.firefly-topbar-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: var(--radius-s);
    background: none;
    cursor: pointer;
    color: var(--text-muted);
    transition: background-color 100ms ease, color 100ms ease;
}

.firefly-topbar-icon-btn:hover {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
}

.firefly-topbar-icon-btn svg {
    width: 16px;
    height: 16px;
    stroke-width: 1.4;
}

/* Inner Sidebar */
.firefly-inner-sidebar {
    display: flex;
    flex-direction: column;
    width: 220px;
    flex-shrink: 0;
    overflow-y: auto;
    background-color: var(--background-secondary);
    border-right: 1px solid var(--background-modifier-border);
    padding: 8px 0;
}

.firefly-sidebar-section {
    display: flex;
    flex-direction: column;
}

.firefly-sidebar-section-header {
    padding: 8px 12px 4px 12px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
    user-select: none;
}

.firefly-sidebar-separator {
    height: 1px;
    background-color: var(--background-modifier-border);
    margin: 6px 0;
}

.firefly-sidebar-item {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: var(--radius-s);
    cursor: pointer;
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    transition: background-color 80ms ease, color 80ms ease;
    user-select: none;
}

.firefly-sidebar-item:hover {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
}

.firefly-sidebar-item.is-active {
    background-color: var(--background-modifier-active-hover);
    color: var(--text-accent);
}

.firefly-sidebar-item svg {
    width: 16px;
    height: 16px;
    stroke-width: 1.4;
    flex-shrink: 0;
}

.firefly-sidebar-item-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Main Section */
.firefly-main-section {
    flex: 1;
    overflow: auto;
    background-color: var(--background-primary);
}

.firefly-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    padding: 32px;
    text-align: center;
}

.firefly-empty-icon svg {
    width: 40px;
    height: 40px;
    stroke-width: 1;
    color: var(--text-faint);
}

.firefly-empty-title {
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
    margin: 0;
}

.firefly-empty-subtitle {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    margin: 0;
}
```

---

## Krok 5 — Weryfikacja

1. Uruchom `npm run dev` — musi zakończyć się bez błędów TypeScript
2. Sprawdź `styles.css` — upewnij się że ma więcej linii niż przed Twoją edycją (nie mniej)
3. Sprawdź `FireflyMainView.ts` — upewnij się że metody `renderAreaSidebar()` i `onAreaChanged()` są niezmienione

Jeśli którykolwiek punkt nie przechodzi — cofnij zmiany przez `git checkout <plik>` i zgłoś co poszło nie tak.

---

## Czego NIE robić

- `write_file` na `styles.css` — nigdy
- usuwanie istniejących metod bez jawnego polecenia w tym dokumencie
- dodawanie logiki kliknięć — to następna sesja
- hardcodowane kolory hex — tylko zmienne CSS Obsidiana
- nowe zależności npm
