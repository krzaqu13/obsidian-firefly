# Plan implementacji nawigacji obszarów — Firefly Plugin

> **Kontekst:** Ten dokument opisuje architekturę i plan implementacji systemu nawigacji obszarów dla wtyczki Firefly do Obsidiana. Firefly to narzędzie narracyjne dla pisarzy — odpowiednik aplikacji desktopowej przeniesiony do środowiska Obsidian.
>
> **Decyzje projektowe (już podjęte):**
> - Przełączanie obszarów zmienia tylko **zawartość głównego panelu** — Obsidian wygląda tak samo, nie używamy natywnych Workspaces
> - Przełącznik obszarów jest **wewnątrz głównego panelu** (pionowy pasek ikon po lewej — jak w aplikacji desktopowej)
> - Drzewo plików (przefiltrowane pod aktywny obszar) jest **osobnym ItemView w lewym sidebarze Obsidiana**
> - Dwa widoki komunikują się przez **system eventów Obsidiana** (`this.app.workspace.trigger`)

---

## 1. Architektura — big picture

```
FireflyPlugin (singleton — żyje przez cały czas działania wtyczki)
│
│  Stan współdzielony:
│  ├── currentArea: AreaId          ← aktywny obszar
│  ├── areaConfigs: AreaConfig[]    ← konfiguracja obszarów z ustawień
│  └── setArea(id) → trigger event  ← jedyny sposób zmiany obszaru
│
├── FireflyMainView extends ItemView   (główny panel — centrum UI)
│   ├── lewy pasek: ikony obszarów (Writing, Worldbuilding, Databases...)
│   ├── górny pasek: zakładki aktywnego obszaru
│   └── zawartość: aktywna zakładka aktywnego obszaru
│        └── (np. lista rozdziałów, widok bazy, oś czasu)
│
└── FireflyFileBrowserView extends ItemView   (lewy sidebar Obsidiana)
    └── drzewo plików vault przefiltrowane pod currentArea
         └── słucha eventu 'firefly:area-changed'
```

**Dlaczego klasa Plugin to singleton?**
Obsidian tworzy jedną instancję klasy `Plugin` kiedy użytkownik włącza wtyczkę i trzyma ją w pamięci do wyłączenia. Wszystkie `ItemView` dostają referencję `this.plugin` w konstruktorze — to jest ich shared state. Nie potrzebujesz Redux ani Zustand — klasa pluginu pełni tę samą rolę co `App.tsx` w aplikacji desktopowej.

---

## 2. Nowe pliki do stworzenia

```
firefly/                        ← nowy folder dla kodu wtyczki Firefly
├── constants.ts                ← stałe: ID widoków, ID obszarów, nazwy eventów
├── models/
│   └── Area.ts                 ← typy: AreaId, AreaConfig, AreaTabConfig
├── services/
│   └── AreaManager.ts          ← logika: persist/load konfiguracji obszarów
├── views/
│   ├── FireflyMainView.ts      ← główny ItemView (pasek + zakładki + zawartość)
│   └── FireflyFileBrowserView.ts ← sidebar ItemView (drzewo plików)
└── components/
    ├── AreaSidebar.ts          ← (Sesja 2+) komponent paska obszarów wydzielony osobno
    ├── AreaTabBar.ts           ← (Sesja 2+) komponent paska zakładek wydzielony osobno
    └── FileBrowserTree.ts      ← (Sesja 2+) komponent drzewa plików wydzielony osobno
```

> **Uwaga:** Folder `firefly/` jest oddzielony od istniejącego kodu StoryLine żeby nie zaburzać działającej wtyczki podczas budowania Firefly. W `main.ts` rejestrujemy oba zestawy widoków obok siebie.

---

## 3. Krok 1 — Typy i stałe

### Plik: `firefly/constants.ts`

```typescript
// ID widoków rejestrowanych w Obsidianie — muszą być globalnie unikalne
export const FIREFLY_MAIN_VIEW_TYPE = 'firefly-main';
export const FIREFLY_FILE_BROWSER_VIEW_TYPE = 'firefly-file-browser';

// Nazwy eventów — używaj TYLKO tych stałych, nigdy stringów literalnych
// żeby uniknąć literówek które są trudne do debugowania
export const FIREFLY_EVENT_AREA_CHANGED = 'firefly:area-changed';
export const FIREFLY_EVENT_TAB_CHANGED = 'firefly:tab-changed';
export const FIREFLY_EVENT_CONFIG_CHANGED = 'firefly:config-changed';

// ID obszarów — kompletna lista obszarów aplikacji
export type AreaId = 'home' | 'writing' | 'worldbuilding' | 'databases' | 'connections' | 'dashboard';

// Kolejność obszarów w pasku bocznym (od góry do dołu)
export const AREA_ORDER: AreaId[] = [
    'home',
    'writing',
    'worldbuilding',
    'databases',
    'connections',
    'dashboard',
];
```

### Plik: `firefly/models/Area.ts`

```typescript
import type { AreaId } from '../constants';

/**
 * Konfiguracja pojedynczego obszaru — co pokazuje drzewo plików
 * kiedy ten obszar jest aktywny. Przechowywana w data.json pluginu
 * i edytowalna przez ustawienia wtyczki.
 */
export interface AreaConfig {
    id: AreaId;
    label: string;              // wyświetlana nazwa, np. "Pisanie"
    icon: string;               // nazwa ikony Lucide, np. "pen-line"

    // Filtry drzewa plików dla tego obszaru
    // Jeśli wszystkie są puste — drzewo pokazuje cały vault
    rootFolder: string;         // vault-relative path, np. "Moja Powieść/Sceny"
                                // puste = cały vault
    allowedFileTypes: string[]; // wartości frontmatter pola "type", np. ["Rozdział", "Scena"]
                                // puste = wszystkie typy
    allowedTags: string[];      // tagi frontmatter, np. ["pisanie", "scena"]
                                // puste = wszystkie tagi
}

/**
 * Konfiguracja pojedynczej zakładki wewnątrz obszaru.
 */
export interface AreaTabConfig {
    id: string;             // unikalny ID zakładki, np. "chapter-list"
    label: string;          // wyświetlana nazwa, np. "Lista rozdziałów"
    icon: string;           // nazwa ikony Lucide
    areaId: AreaId;         // do którego obszaru należy ta zakładka
}

/**
 * Stan nawigacji — co jest aktualnie aktywne.
 * Przechowywany w localStorage pod kluczem 'firefly-nav-state'.
 */
export interface NavState {
    currentAreaId: AreaId;
    activeTabPerArea: Partial<Record<AreaId, string>>;  // area → ID aktywnej zakładki
}
```

---

## 4. Krok 2 — AreaManager (logika stanu i persistencji)

### Plik: `firefly/services/AreaManager.ts`

Ten serwis jest **jedynym miejscem** gdzie stan nawigacji jest czytany i zapisywany. Oba widoki (MainView i FileBrowserView) nie trzymają własnego stanu obszaru — pytają AreaManager.

```typescript
import type FireflyPlugin from '../../main';
import type { AreaConfig, NavState } from '../models/Area';
import type { AreaId } from '../constants';
import {
    AREA_ORDER,
    FIREFLY_EVENT_AREA_CHANGED,
    FIREFLY_EVENT_TAB_CHANGED,
} from '../constants';

const NAV_STATE_KEY = 'firefly-nav-state';

/**
 * Domyślne konfiguracje obszarów — używane przy pierwszym uruchomieniu
 * zanim użytkownik skonfiguruje własne foldery w ustawieniach.
 */
const DEFAULT_AREA_CONFIGS: AreaConfig[] = [
    {
        id: 'home',
        label: 'Strona główna',
        icon: 'home',
        rootFolder: '',
        allowedFileTypes: [],
        allowedTags: [],
    },
    {
        id: 'writing',
        label: 'Pisanie',
        icon: 'pen-line',
        rootFolder: '',         // użytkownik uzupełnia w ustawieniach
        allowedFileTypes: [],
        allowedTags: [],
    },
    {
        id: 'worldbuilding',
        label: 'Świat',
        icon: 'globe-2',
        rootFolder: '',
        allowedFileTypes: [],
        allowedTags: [],
    },
    {
        id: 'databases',
        label: 'Bazy danych',
        icon: 'database',
        rootFolder: '',
        allowedFileTypes: [],
        allowedTags: [],
    },
    {
        id: 'connections',
        label: 'Połączenia',
        icon: 'share-2',
        rootFolder: '',
        allowedFileTypes: [],
        allowedTags: [],
    },
    {
        id: 'dashboard',
        label: 'Dashboard',
        icon: 'layout-dashboard',
        rootFolder: '',
        allowedFileTypes: [],
        allowedTags: [],
    },
];

export class AreaManager {
    private plugin: FireflyPlugin;
    private navState: NavState;

    constructor(plugin: FireflyPlugin) {
        this.plugin = plugin;
        this.navState = this.loadNavState();
    }

    // ── Odczyt stanu ────────────────────────────────────────────────

    getCurrentAreaId(): AreaId {
        return this.navState.currentAreaId;
    }

    getCurrentAreaConfig(): AreaConfig {
        return this.getAreaConfig(this.navState.currentAreaId);
    }

    getAreaConfig(id: AreaId): AreaConfig {
        // Konfiguracje obszarów są w data.json pluginu (this.plugin.settings.areaConfigs)
        // Fallback do domyślnych jeśli brak konfiguracji użytkownika
        const saved = (this.plugin.settings as any).areaConfigs?.find(
            (c: AreaConfig) => c.id === id
        );
        return saved ?? DEFAULT_AREA_CONFIGS.find(c => c.id === id) ?? DEFAULT_AREA_CONFIGS[0];
    }

    getAllAreaConfigs(): AreaConfig[] {
        return AREA_ORDER.map(id => this.getAreaConfig(id));
    }

    getActiveTabForArea(areaId: AreaId): string {
        return this.navState.activeTabPerArea[areaId] ?? '';
    }

    // ── Zmiana stanu ─────────────────────────────────────────────────

    /**
     * Zmienia aktywny obszar i emituje event który odświeża oba widoki.
     * To jest JEDYNA metoda którą wywołujesz żeby zmienić obszar.
     */
    setCurrentArea(id: AreaId): void {
        if (this.navState.currentAreaId === id) return;  // bez zmian — bez eventu
        this.navState.currentAreaId = id;
        this.persistNavState();
        // Event powiadamia FireflyMainView i FireflyFileBrowserView jednocześnie
        this.plugin.app.workspace.trigger(FIREFLY_EVENT_AREA_CHANGED as any, id);
    }

    setActiveTab(areaId: AreaId, tabId: string): void {
        this.navState.activeTabPerArea[areaId] = tabId;
        this.persistNavState();
        this.plugin.app.workspace.trigger(
            FIREFLY_EVENT_TAB_CHANGED as any,
            { areaId, tabId }
        );
    }

    // ── Persistencja ─────────────────────────────────────────────────

    private loadNavState(): NavState {
        try {
            const raw = window.localStorage.getItem(NAV_STATE_KEY);
            if (raw) return JSON.parse(raw) as NavState;
        } catch {
            // localStorage niedostępny lub uszkodzone dane — używamy domyślnych
        }
        return {
            currentAreaId: 'home',
            activeTabPerArea: {},
        };
    }

    private persistNavState(): void {
        try {
            window.localStorage.setItem(
                NAV_STATE_KEY,
                JSON.stringify(this.navState)
            );
        } catch {
            // localStorage może być niedostępny w niektórych środowiskach
        }
    }
}
```

---

## 5. Krok 3 — Rozszerzenie main.ts

Nie tworzysz nowego `main.ts` — **rozszerzasz istniejący**. Zmiany są minimalne i nie naruszają działającego kodu StoryLine.

### Co dodać do importów (na górze pliku):

```typescript
import { AreaManager } from './firefly/services/AreaManager';
import { FireflyMainView } from './firefly/views/FireflyMainView';
import { FireflyFileBrowserView } from './firefly/views/FireflyFileBrowserView';
import {
    FIREFLY_MAIN_VIEW_TYPE,
    FIREFLY_FILE_BROWSER_VIEW_TYPE,
} from './firefly/constants';
```

### Co dodać do pól klasy pluginu (obok istniejących jak `sceneManager`):

```typescript
areaManager!: AreaManager;
```

### Co dodać do onload() — PO istniejących inicjalizacjach serwisów:

```typescript
// Inicjalizacja AreaManager — musi być przed rejestracją widoków
this.areaManager = new AreaManager(this);

// Rejestracja widoków Firefly — dodaj do istniejącego bloku registerView()
this.registerView(
    FIREFLY_MAIN_VIEW_TYPE,
    (leaf) => new FireflyMainView(leaf, this)
);
this.registerView(
    FIREFLY_FILE_BROWSER_VIEW_TYPE,
    (leaf) => new FireflyFileBrowserView(leaf, this)
);

// Komenda do otwierania Firefly
this.addCommand({
    id: 'open-firefly-main',
    name: 'Otwórz Firefly',
    callback: () => { this.openFireflyMainView(); },
    hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'f' }],
});

// Ikona w ribbonie
this.addRibbonIcon('feather', 'Otwórz Firefly', () => {
    this.openFireflyMainView();
});
```

### Co dodać jako metody klasy pluginu:

```typescript
async openFireflyMainView(): Promise<void> {
    // Jeśli widok już jest otwarty — tylko go aktywuj
    const existing = this.app.workspace.getLeavesOfType(FIREFLY_MAIN_VIEW_TYPE);
    if (existing.length > 0) {
        this.app.workspace.revealLeaf(existing[0]);
        return;
    }
    // Otwórz w głównym panelu (nie w sidebarze)
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: FIREFLY_MAIN_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
}

async openFireflyFileBrowser(): Promise<void> {
    // Jeśli widok już jest w sidebarze — tylko go aktywuj
    const existing = this.app.workspace.getLeavesOfType(FIREFLY_FILE_BROWSER_VIEW_TYPE);
    if (existing.length > 0) {
        this.app.workspace.revealLeaf(existing[0]);
        return;
    }
    // Lewy sidebar — getLeftLeaf(false) = nowy leaf bez splitu
    const leaf = this.app.workspace.getLeftLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: FIREFLY_FILE_BROWSER_VIEW_TYPE, active: true });
}
```

### Co dodać do settings.ts (interfejs SceneCardsSettings):

```typescript
// Konfiguracje obszarów Firefly — edytowalne przez ustawienia wtyczki
areaConfigs?: import('./firefly/models/Area').AreaConfig[];
```

I w obiekcie `DEFAULT_SETTINGS`:

```typescript
areaConfigs: undefined,   // undefined = używaj domyślnych z AreaManager
```

---

## 6. Krok 4 — FireflyMainView

### Plik: `firefly/views/FireflyMainView.ts`

To jest najważniejszy plik. Renderuje cały interfejs aplikacji: pasek obszarów po lewej, zakładki na górze, zawartość w środku.

```typescript
import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type FireflyPlugin from '../../main';
import {
    FIREFLY_MAIN_VIEW_TYPE,
    FIREFLY_EVENT_AREA_CHANGED,
    AREA_ORDER,
} from '../constants';
import type { AreaId } from '../constants';

// Definicja zakładek per obszar
// W kolejnych sesjach można to wydzielić do osobnego pliku konfiguracyjnego
const TABS_BY_AREA: Record<AreaId, Array<{ id: string; label: string; icon: string }>> = {
    home: [
        { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
    ],
    writing: [
        { id: 'chapter-list',  label: 'Rozdziały',  icon: 'list'        },
        { id: 'timeline',      label: 'Oś czasu',    icon: 'clock'       },
        { id: 'manuscript',    label: 'Manuskrypt',  icon: 'book-open'   },
        { id: 'stats',         label: 'Statystyki',  icon: 'bar-chart-2' },
    ],
    worldbuilding: [
        { id: 'characters',    label: 'Postacie',    icon: 'users'       },
        { id: 'locations',     label: 'Miejsca',     icon: 'map-pin'     },
        { id: 'codex',         label: 'Kodeks',      icon: 'book-open'   },
    ],
    databases: [
        { id: 'db-list',       label: 'Bazy danych', icon: 'database'    },
    ],
    connections: [
        { id: 'graph',         label: 'Graf',        icon: 'share-2'     },
    ],
    dashboard: [
        { id: 'overview',      label: 'Przegląd',    icon: 'activity'    },
    ],
};

export class FireflyMainView extends ItemView {
    private plugin: FireflyPlugin;

    // Referencje do elementów DOM — przechowujemy żeby móc je aktualizować
    // bez przebudowywania całego widoku od zera
    private sidebarEl: HTMLElement | null = null;
    private tabBarEl: HTMLElement | null = null;
    private contentEl: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: FireflyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return FIREFLY_MAIN_VIEW_TYPE; }
    getDisplayText(): string { return 'Firefly'; }
    getIcon(): string { return 'feather'; }

    async onOpen(): Promise<void> {
        // Obsidian daje nam containerEl.children[1] jako przestrzeń roboczą
        // children[0] to nagłówek widoku (tytuł, przyciski) — zarządzany przez Obsidiana
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('firefly-main-view');

        // Struktura layoutu:
        // ┌─────────┬────────────────────────────┐
        // │ pasek   │ pasek zakładek             │
        // │ obszarów├────────────────────────────┤
        // │         │ zawartość aktywnej zakładki │
        // └─────────┴────────────────────────────┘
        const rootEl = container.createDiv('firefly-root');
        this.sidebarEl = rootEl.createDiv('firefly-area-sidebar');
        const rightPanel = rootEl.createDiv('firefly-right-panel');
        this.tabBarEl = rightPanel.createDiv('firefly-tab-bar');
        this.contentEl = rightPanel.createDiv('firefly-content');

        // Wyrenderuj pasek obszarów
        this.renderAreaSidebar();

        // Wyrenderuj zakładki i zawartość dla aktualnego obszaru
        const currentAreaId = this.plugin.areaManager.getCurrentAreaId();
        this.renderTabBar(currentAreaId);
        this.renderContent(currentAreaId);

        // Słuchaj eventów zmiany obszaru emitowanych przez AreaManager
        // registerEvent() automatycznie usuwa listener przy zamknięciu widoku
        this.registerEvent(
            this.app.workspace.on(FIREFLY_EVENT_AREA_CHANGED as any, (areaId: AreaId) => {
                this.onAreaChanged(areaId);
            })
        );

        // Otwórz drzewo plików w sidebarze (jeśli jeszcze nie jest otwarte)
        await this.plugin.openFireflyFileBrowser();
    }

    async onClose(): Promise<void> {
        // registerEvent() sprzątnie listenery automatycznie
        // Wyzeruj referencje DOM
        this.sidebarEl = null;
        this.tabBarEl = null;
        this.contentEl = null;
    }

    // ── Renderowanie paska obszarów ───────────────────────────────────

    private renderAreaSidebar(): void {
        if (!this.sidebarEl) return;
        this.sidebarEl.empty();

        const currentAreaId = this.plugin.areaManager.getCurrentAreaId();

        for (const areaId of AREA_ORDER) {
            const config = this.plugin.areaManager.getAreaConfig(areaId);
            const isActive = areaId === currentAreaId;

            const btn = this.sidebarEl.createDiv({
                cls: `firefly-area-btn${isActive ? ' is-active' : ''}`,
            });

            // setIcon z Obsidian API — renderuje ikonę Lucide
            const iconEl = btn.createSpan({ cls: 'firefly-area-icon' });
            setIcon(iconEl, config.icon);

            // Tooltip — natywny mechanizm Obsidiana
            btn.setAttribute('aria-label', config.label);
            btn.setAttribute('data-tooltip-position', 'right');

            btn.addEventListener('click', () => {
                // AreaManager.setCurrentArea() emituje event — onAreaChanged() się wywoła
                this.plugin.areaManager.setCurrentArea(areaId);
            });
        }
    }

    // ── Renderowanie paska zakładek ───────────────────────────────────

    private renderTabBar(areaId: AreaId): void {
        if (!this.tabBarEl) return;
        this.tabBarEl.empty();

        const tabs = TABS_BY_AREA[areaId] ?? [];
        const activeTabId = this.plugin.areaManager.getActiveTabForArea(areaId);

        for (const tab of tabs) {
            // Pierwsza zakładka jest domyślnie aktywna jeśli brak zapisanego stanu
            const isActive = tab.id === activeTabId || (!activeTabId && tab === tabs[0]);

            const btn = this.tabBarEl.createEl('button', {
                cls: `firefly-tab-btn${isActive ? ' is-active' : ''}`,
            });

            const iconEl = btn.createSpan({ cls: 'firefly-tab-icon' });
            setIcon(iconEl, tab.icon);
            btn.createSpan({ cls: 'firefly-tab-label', text: tab.label });

            btn.addEventListener('click', () => {
                this.plugin.areaManager.setActiveTab(areaId, tab.id);
                this.renderTabBar(areaId);   // odśwież podkreślenie aktywnej zakładki
                this.renderContent(areaId);  // pokaż zawartość tej zakładki
            });
        }
    }

    // ── Renderowanie zawartości ───────────────────────────────────────

    private renderContent(areaId: AreaId): void {
        if (!this.contentEl) return;
        this.contentEl.empty();

        const tabs = TABS_BY_AREA[areaId] ?? [];
        const activeTabId = this.plugin.areaManager.getActiveTabForArea(areaId);
        const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];

        if (!activeTab) {
            this.contentEl.createDiv({
                cls: 'firefly-empty-state',
                text: 'Ten obszar nie ma jeszcze żadnych zakładek.',
            });
            return;
        }

        // PLACEHOLDER — w kolejnych sesjach każda zakładka dostanie własny komponent
        // renderowany tutaj na podstawie activeTab.id
        const placeholder = this.contentEl.createDiv('firefly-content-placeholder');
        const iconEl = placeholder.createDiv({ cls: 'firefly-placeholder-icon' });
        setIcon(iconEl, activeTab.icon);
        placeholder.createEl('h2', { text: activeTab.label });
        placeholder.createEl('p', {
            text: `Zakładka "${activeTab.label}" — do zaimplementowania.`,
            cls: 'firefly-placeholder-text',
        });
    }

    // ── Obsługa eventu zmiany obszaru ────────────────────────────────

    /**
     * Wywoływane gdy AreaManager.setCurrentArea() emituje event 'firefly:area-changed'.
     * Aktualizuje UI bez pełnego przebudowania widoku.
     */
    private onAreaChanged(areaId: AreaId): void {
        // Zaktualizuj podświetlenie przycisków w pasku obszarów
        if (this.sidebarEl) {
            const buttons = this.sidebarEl.querySelectorAll('.firefly-area-btn');
            buttons.forEach((btn, i) => {
                const btnAreaId = AREA_ORDER[i];
                btn.classList.toggle('is-active', btnAreaId === areaId);
            });
        }

        // Przebuduj pasek zakładek i zawartość dla nowego obszaru
        this.renderTabBar(areaId);
        this.renderContent(areaId);
    }
}
```

---

## 7. Krok 5 — FireflyFileBrowserView

### Plik: `firefly/views/FireflyFileBrowserView.ts`

```typescript
import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import type FireflyPlugin from '../../main';
import {
    FIREFLY_FILE_BROWSER_VIEW_TYPE,
    FIREFLY_EVENT_AREA_CHANGED,
} from '../constants';
import type { AreaConfig } from '../models/Area';

export class FireflyFileBrowserView extends ItemView {
    private plugin: FireflyPlugin;
    private listEl: HTMLElement | null = null;
    private headerTitleEl: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: FireflyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return FIREFLY_FILE_BROWSER_VIEW_TYPE; }
    getDisplayText(): string { return 'Firefly — Pliki'; }
    getIcon(): string { return 'folder-open'; }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('firefly-file-browser');

        // Nagłówek z nazwą aktywnego obszaru
        const header = container.createDiv('firefly-browser-header');
        this.headerTitleEl = header.createSpan({ cls: 'firefly-browser-title', text: 'Pliki' });

        // Lista plików — główna przestrzeń robocza
        this.listEl = container.createDiv('firefly-browser-list');

        // Wyrenderuj dla aktualnego obszaru
        this.refresh();

        // Słuchaj zmiany obszaru — przefiltruj drzewo pod nowy obszar
        this.registerEvent(
            this.app.workspace.on(FIREFLY_EVENT_AREA_CHANGED as any, () => {
                this.refresh();
            })
        );

        // Słuchaj zmian w vaulcie — odśwież kiedy pliki są dodawane/usuwane/zmieniane
        this.registerEvent(this.app.vault.on('create', () => this.refresh()));
        this.registerEvent(this.app.vault.on('delete', () => this.refresh()));
        this.registerEvent(this.app.vault.on('rename', () => this.refresh()));

        // Podświetl aktywny plik kiedy użytkownik go otwiera
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.highlightActiveFile();
            })
        );
    }

    async onClose(): Promise<void> {
        this.listEl = null;
        this.headerTitleEl = null;
    }

    // ── Główna metoda odświeżania ─────────────────────────────────────

    private refresh(): void {
        if (!this.listEl) return;
        this.listEl.empty();

        const config = this.plugin.areaManager.getCurrentAreaConfig();

        // Zaktualizuj tytuł nagłówka
        if (this.headerTitleEl) {
            this.headerTitleEl.setText(config.label);
        }

        const files = this.getFilteredFiles(config);

        if (files.length === 0) {
            this.listEl.createDiv({
                cls: 'firefly-browser-empty',
                text: config.rootFolder
                    ? `Brak plików w folderze "${config.rootFolder}"`
                    : 'Brak plików pasujących do filtrów tego obszaru.',
            });
            return;
        }

        this.renderTree(this.listEl, files, config.rootFolder);
    }

    // ── Filtrowanie plików ────────────────────────────────────────────

    /**
     * Pobiera pliki markdown z vaultu i filtruje je według konfiguracji obszaru.
     *
     * Filtrowanie jest trzyetapowe:
     * 1. rootFolder — tylko pliki wewnątrz wskazanego folderu vaultu
     * 2. allowedFileTypes — tylko pliki z pasującym polem "type" w frontmatter
     * 3. allowedTags — tylko pliki z co najmniej jednym pasującym tagiem
     *
     * Wszystkie aktywne filtry muszą być spełnione jednocześnie (AND, nie OR).
     * Jeśli filtr jest pusty (pusta tablica lub pusty string) — nie jest stosowany.
     */
    private getFilteredFiles(config: AreaConfig): TFile[] {
        let files = this.app.vault.getMarkdownFiles();

        // Filtr 1: folder startowy
        if (config.rootFolder) {
            const normalizedRoot = config.rootFolder
                .replace(/\\/g, '/')
                .replace(/\/$/, '');
            files = files.filter(f =>
                f.path.startsWith(normalizedRoot + '/') || f.path === normalizedRoot
            );
        }

        // Filtr 2: typy plików (frontmatter "type" lub "Typ Notatki")
        if (config.allowedFileTypes.length > 0) {
            files = files.filter(f => {
                const cache = this.app.metadataCache.getFileCache(f);
                // Obsługa obu wariantów pola type (angielski i polski)
                const fileType =
                    cache?.frontmatter?.['type'] ??
                    cache?.frontmatter?.['Typ Notatki'] ??
                    cache?.frontmatter?.['typ notatki'];
                return config.allowedFileTypes.includes(fileType);
            });
        }

        // Filtr 3: tagi frontmatter
        if (config.allowedTags.length > 0) {
            files = files.filter(f => {
                const cache = this.app.metadataCache.getFileCache(f);
                // Obsidian normalizuje tagi do małych liter bez #
                const fileTags: string[] = cache?.frontmatter?.tags ?? [];
                const normalizedFileTags = fileTags.map(t =>
                    t.replace(/^#/, '').toLowerCase()
                );
                return config.allowedTags.some(tag =>
                    normalizedFileTags.includes(tag.replace(/^#/, '').toLowerCase())
                );
            });
        }

        // Sortuj alfabetycznie po pełnej ścieżce
        return files.sort((a, b) => a.path.localeCompare(b.path));
    }

    // ── Renderowanie drzewa ───────────────────────────────────────────

    /**
     * Renderuje przefiltrowane pliki jako drzewo folderów.
     * Foldery są grupowane automatycznie na podstawie ścieżek plików.
     * Pliki w rootFolder bez podfolderu pokazują się bez nagłówka grupującego.
     */
    private renderTree(container: HTMLElement, files: TFile[], rootFolder: string): void {
        // Zbuduj mapę: folder → pliki w tym folderze
        const folderMap = new Map<string, TFile[]>();

        for (const file of files) {
            // Ścieżka relatywna względem rootFolder
            const relativePath = rootFolder
                ? file.path.slice(rootFolder.replace(/\\/g, '/').replace(/\/$/, '').length + 1)
                : file.path;

            const parts = relativePath.split('/');
            // Jeśli plik jest bezpośrednio w rootFolder — klucz to pusty string
            const folderKey = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

            if (!folderMap.has(folderKey)) folderMap.set(folderKey, []);
            folderMap.get(folderKey)!.push(file);
        }

        // Sortuj foldery alfabetycznie, pusty string (root) na początku
        const sortedFolders = Array.from(folderMap.keys()).sort((a, b) => {
            if (a === '') return -1;
            if (b === '') return 1;
            return a.localeCompare(b);
        });

        for (const folderKey of sortedFolders) {
            const folderFiles = folderMap.get(folderKey)!;

            if (folderKey) {
                // Nagłówek folderu
                const folderEl = container.createDiv('firefly-folder-item');
                const folderIcon = folderEl.createSpan({ cls: 'firefly-folder-icon' });
                setIcon(folderIcon, 'folder');
                folderEl.createSpan({ cls: 'firefly-folder-name', text: folderKey });
            }

            // Pliki — wcięte jeśli są w podfolderze
            const filesContainer = folderKey
                ? container.createDiv('firefly-folder-children')
                : container;

            for (const file of folderFiles) {
                this.renderFileItem(filesContainer, file);
            }
        }
    }

    private renderFileItem(container: HTMLElement, file: TFile): void {
        const activeFile = this.app.workspace.getActiveFile();
        const isActive = activeFile?.path === file.path;

        const item = container.createDiv({
            cls: `firefly-file-item${isActive ? ' is-active' : ''}`,
            attr: { 'data-path': file.path },
        });

        const iconEl = item.createSpan({ cls: 'firefly-file-icon' });
        setIcon(iconEl, 'file-text');
        item.createSpan({ cls: 'firefly-file-name', text: file.basename });

        // Klik — otwiera plik; Ctrl/Cmd+klik otwiera w nowym panelu
        item.addEventListener('click', (e) => {
            const newLeaf = e.ctrlKey || e.metaKey;
            this.app.workspace.openLinkText(file.path, '', newLeaf);
        });
    }

    // ── Podświetlanie aktywnego pliku ─────────────────────────────────

    /**
     * Aktualizuje podświetlenie bez pełnego przerenderwania drzewa.
     * Wywoływane przy 'active-leaf-change'.
     */
    private highlightActiveFile(): void {
        if (!this.listEl) return;
        const activeFile = this.app.workspace.getActiveFile();

        this.listEl.querySelectorAll('.firefly-file-item').forEach(el => {
            const path = el.getAttribute('data-path');
            el.classList.toggle('is-active', path === activeFile?.path);
        });
    }
}
```

---

## 8. Krok 6 — CSS (dołącz na końcu styles.css)

Używaj **wyłącznie zmiennych CSS Obsidiana** — nie hardcode'uj kolorów ani rozmiarów fontów. Obsidian dostarcza pełny zestaw zmiennych kompatybilnych ze wszystkimi motywami (jasny/ciemny).

```css
/* ═══════════════════════════════════════════════════════
   FIREFLY — główny widok (FireflyMainView)
   ═══════════════════════════════════════════════════════ */

.firefly-main-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

/* Korzeń — pasek obszarów po lewej + panel po prawej */
.firefly-root {
    display: flex;
    flex-direction: row;
    height: 100%;
    overflow: hidden;
}

/* ── Pionowy pasek obszarów ── */

.firefly-area-sidebar {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 48px;
    flex-shrink: 0;
    background-color: var(--background-secondary);
    border-right: 1px solid var(--background-modifier-border);
    padding: 8px 0;
    gap: 4px;
    overflow-y: auto;
}

.firefly-area-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-m);
    cursor: pointer;
    color: var(--text-muted);
    transition: background-color 100ms ease, color 100ms ease;
}

.firefly-area-btn:hover {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
}

.firefly-area-btn.is-active {
    background-color: var(--background-modifier-active-hover);
    color: var(--interactive-accent);
}

.firefly-area-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
}

.firefly-area-icon svg {
    width: 18px;
    height: 18px;
    stroke-width: 1.4;
}

/* ── Panel prawy ── */

.firefly-right-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
}

/* ── Pasek zakładek ── */

.firefly-tab-bar {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    background-color: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
    overflow-x: auto;
}

.firefly-tab-btn {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: var(--radius-s);
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: var(--font-ui-small);
    white-space: nowrap;
    transition: background-color 100ms ease, color 100ms ease;
}

.firefly-tab-btn:hover {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
}

.firefly-tab-btn.is-active {
    color: var(--text-normal);
    background-color: var(--background-modifier-active-hover);
    box-shadow: inset 0 -2px 0 var(--interactive-accent);
}

.firefly-tab-icon {
    display: flex;
    align-items: center;
}

.firefly-tab-icon svg {
    width: 14px;
    height: 14px;
    stroke-width: 1.4;
}

/* ── Obszar zawartości ── */

.firefly-content {
    flex: 1;
    overflow: auto;
}

/* ── Placeholder (przed implementacją zakładek) ── */

.firefly-content-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--text-muted);
    text-align: center;
}

.firefly-placeholder-icon svg {
    width: 32px;
    height: 32px;
    stroke-width: 1;
    color: var(--text-faint);
}

.firefly-placeholder-text {
    font-size: var(--font-ui-small);
    color: var(--text-faint);
}

/* ═══════════════════════════════════════════════════════
   FIREFLY — drzewo plików (FireflyFileBrowserView)
   ═══════════════════════════════════════════════════════ */

.firefly-file-browser {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.firefly-browser-header {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
}

.firefly-browser-title {
    font-size: var(--font-ui-small);
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.firefly-browser-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
}

.firefly-folder-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    font-size: var(--font-ui-small);
    font-weight: 600;
    color: var(--text-muted);
    user-select: none;
    margin-top: 4px;
}

.firefly-folder-icon svg {
    width: 14px;
    height: 14px;
    stroke-width: 1.4;
}

.firefly-folder-children {
    padding-left: 8px;
}

.firefly-file-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 12px;
    border-radius: var(--radius-s);
    cursor: pointer;
    font-size: var(--font-ui-small);
    color: var(--text-normal);
    transition: background-color 80ms ease;
}

.firefly-file-item:hover {
    background-color: var(--background-modifier-hover);
}

.firefly-file-item.is-active {
    background-color: var(--background-modifier-active-hover);
    color: var(--interactive-accent);
}

.firefly-file-icon svg {
    width: 14px;
    height: 14px;
    stroke-width: 1.4;
    flex-shrink: 0;
}

.firefly-browser-empty {
    padding: 16px 12px;
    font-size: var(--font-ui-small);
    color: var(--text-faint);
    text-align: center;
    line-height: 1.5;
}
```

---

## 9. Kolejność implementacji — sesja po sesji

### Sesja 1 — Fundament (wszystko co tu opisano)
1. Stwórz folder `firefly/` i podfoldery `models/`, `services/`, `views/`
2. Stwórz `firefly/constants.ts`
3. Stwórz `firefly/models/Area.ts`
4. Stwórz `firefly/services/AreaManager.ts`
5. Stwórz `firefly/views/FireflyMainView.ts`
6. Stwórz `firefly/views/FireflyFileBrowserView.ts`
7. Rozszerz `main.ts` — dodaj imports, pole `areaManager`, rejestrację widoków, komendy, metody `openFireflyMainView()` i `openFireflyFileBrowser()`
8. Dodaj `areaConfigs` do interfejsu ustawień i `DEFAULT_SETTINGS` w `settings.ts`
9. Dodaj style CSS na końcu `styles.css`
10. Zbuduj: `npm run dev` — sprawdź czy brak błędów TypeScript
11. Przetestuj: otwórz Obsidian, włącz wtyczkę, użyj komendy `Otwórz Firefly`, sprawdź czy widoki się otwierają i czy przełączanie obszarów działa

### Sesja 2 — Ustawienia obszarów
- Dodaj sekcję "Firefly — Obszary" do `SceneCardsSettingTab` w `settings.ts`
- Dla każdego obszaru: pole tekstowe na `rootFolder` z przyciskiem folder picker (`new FuzzyFolderSuggest` lub ręczny input)
- Pole wielokrotnego wyboru dla `allowedFileTypes` (wartości wpisywane ręcznie lub sugestie z metadataCache)
- Zapis przez `this.saveSettings()` — AreaManager automatycznie czyta zaktualizowane dane przy następnym odświeżeniu

### Sesja 3 — Pierwsza prawdziwa zakładka (Chapter List)
- Stwórz `firefly/views/areas/WritingChapterList.ts`
- Pobiera pliki przez `this.plugin.areaManager.getCurrentAreaConfig()` i `app.vault.getMarkdownFiles()`
- Filtruje po `type: Rozdział` (lub co jest skonfigurowane w allowedFileTypes)
- Renderuje listę rozdziałów z tytułem, statusem, liczbą słów
- Podłącz w `renderContent()` MainView: gdy `activeTab.id === 'chapter-list'` → utwórz instancję `WritingChapterList` i wywołaj jej metodę `render(this.contentEl)`

### Sesja 4+ — Kolejne zakładki
Każda zakładka = jeden plik w `firefly/views/areas/`. Wzorzec zawsze taki sam:
- Pobierz config obszaru przez `this.plugin.areaManager.getCurrentAreaConfig()`
- Pobierz pliki przez `app.vault.getMarkdownFiles()` + filtrowanie
- Renderuj zawartość do przekazanego `HTMLElement`

---

## 10. Lista ostrzeżeń — częste błędy

**Event casting:** Obsidian typuje eventy przez własny interfejs WorkspaceEvents. Własne eventy wymagają `as any` przy rejestracji i emitowaniu:
```typescript
this.app.workspace.on(FIREFLY_EVENT_AREA_CHANGED as any, handler)
this.app.workspace.trigger(FIREFLY_EVENT_AREA_CHANGED as any, payload)
```
Bez `as any` TypeScript zgłosi błąd kompilacji.

**containerEl.children[1]:** Zawsze używaj `this.containerEl.children[1]` jako przestrzeni roboczej w `onOpen()`. Element `children[0]` to nagłówek widoku zarządzany przez Obsidiana — nie dotykaj go.

**registerEvent vs addEventListener:** Dla eventów Obsidiana (`vault.on`, `workspace.on`) zawsze `this.registerEvent()`. Dla eventów DOM (kliknięcia w przyciski HTML) zwykłe `addEventListener` jest OK. `registerEvent` automatycznie sprząta przy zamknięciu widoku — bez niego masz memory leak.

**metadataCache jest synchroniczny:** `this.app.metadataCache.getFileCache(file)` zwraca dane natychmiastowo z cache — używaj go do filtrowania, nie `vault.read()`. `vault.read()` czyta plik z dysku (async) — używaj tylko kiedy potrzebujesz pełną treść notatki.

**localStorage klucze z prefiksem:** Używaj prefiksu `firefly-` dla wszystkich kluczy (jak StoryLine używa `storyline-`). Zapobiega kolizjom między wtyczkami.

**getLeftLeaf(false):** Parametr `false` = nie splituj istniejącego leafu, daj mi wolny slot. `true` = split. Dla sidebara zawsze `false`.

**Buduj po każdej zmianie:** Obsidian ładuje skompilowany `main.js`, nie TypeScript. Po każdej zmianie musisz uruchomić `npm run dev` (tryb watch) lub `npm run build`.
