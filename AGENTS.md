# Obsidian Plugin Development Guidelines & Rules

To jest plik instrukcji dla agentów AI pracujących nad tym repozytorium (Wtyczka Obsidian Storyline).

## 1. Architektura Obsidian API
* **Zawsze używaj Obsidian API:** Nie korzystaj z bezpośrednich operacji na systemie plików Node (`fs`), o ile nie jest to absolutnie konieczne. Zamiast tego używaj `this.app.vault` (np. `this.app.vault.read()`, `this.app.vault.modify()`).
* **Zarządzanie zdarzeniami:** Wszystkie nasłuchiwacze i rejestracje komend musisz dodawać wewnątrz metody `onload()` przy użyciu metody `this.registerEvent()` lub `this.addCommand()`. Pozwala to Obsidianowi na bezpieczne usuwanie nasłuchiwaczy przy wyłączaniu wtyczki (`onunload`).
* **Modyfikacja metadanych (Frontmatter):** Do czytania metadanych używaj `this.app.metadataCache.getFileCache(file)`. Do ich zapisu stosuj bezpieczną funkcję `this.app.fileManager.processFrontMatter(file, (frontmatter) => { ... })`.

## 2. Zasady edycji interfejsu (UI)
* **Widoki wtyczki:** Główne widoki dziedziczą po klasie `ItemView`. Zawsze pamiętaj o zdefiniowaniu `getViewType()` i `getDisplayText()`.
* **Stylowanie i CSS:** Wszystkie dodawane elementy interfejsu powinny korzystać ze zmiennych CSS dostarczanych przez Obsidiana (np. `var(--text-normal)`, `var(--background-primary)`), aby zapewnić pełną kompatybilność z motywami użytkowników (Jasny/Ciemny).

## 3. Standardy kodu w tym projekcie
* **TypeScript:** Projekt używa surowego TypeScriptu skompilowanego przez `esbuild`. Zachowaj ścisłe typowanie.
* **Nie zmieniaj istniejących pól YAML:** Jeśli modyfikujesz logikę odczytu scen, upewnij się, że zachowujesz kompatybilność z polami takimi jak `storyline-start`, `storyline-title`, `act`, `chapter` oraz `sequence`.
* **Brak zbędnych bibliotek:** Zanim zaproponujesz dodanie zależności `npm`, sprawdź, czy Obsidian nie dostarcza już gotowego rozwiązania w swoim API (np. ikony `setIcon` bazujące na Lucide).
