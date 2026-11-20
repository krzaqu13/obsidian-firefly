# Etap 2: Książki w ustawieniach Writing

Dokument opisuje wyłącznie to, czego nie ma we wdrożonej wersji 1 (tworzenie nowej książki). To, co już działa, zostaje tak, jak opisują „Wytyczne: Ustawienia Writing, sekcja Projekty”. Algorytmy skanowania, aliasów i zapisu są w sekcjach 6–9 tamtych wytycznych. Tutaj są tylko różnice i nowe ustalenia.

## 1. Zakres i kolejność wdrożenia

1. Tryb „Wykorzystaj istniejące foldery”: przypisanie ról do folderów i skanowanie bez zapisu.
2. ScanReportModal: raport skanowania (makieta: plansza 3 ze starej makiety).
3. Wykrywanie książek w vaulcie i Stan B sekcji (nowa makieta: „Wykryta książka”, napisy na planszy do zmiany wg sekcji 7).
4. FixPreviewModal i kopie zapasowe w `.firefly/backups/` (nowa makieta: „Podgląd poprawek”).

Każdy krok da się sprawdzić bez ryzyka dla plików użytkownika, bo zapis pojawia się dopiero w kroku 4.

## 2. Ujednolicenia przed wdrożeniem

- W raporcie chip z podkolumnami ma mieć tekst `subcolumns`, nie `podkolumny`. Klucze frontmattera są angielskie.
- Kolejność wierszy raportu: najpierw „Decyzja”, potem „Uzupełnić”, na końcu „Gotowy”; w obrębie statusu alfabetycznie po ścieżce. Makieta pokazuje kolejność wg folderów tylko dla czytelności.
- Raport pokazuje najwyżej 6 wierszy i podsumowanie „Pokazano 6 z N plików”.

## 3. FixPreviewModal

- Otwiera się z raportu przyciskiem „Przejrzyj poprawki (N plików)”; N to pliki ze statusem „Uzupełnić”.
- Lewa kolumna: lista plików z odznaką `+K` (liczba dopisywanych pól). Prawa: diff wybranego pliku, tylko dodane linie i 1–2 linie kontekstu.
- Diff jest tylko do odczytu. Nie zmieniamy nazw istniejących pól ani wartości.
- Przyciski: „Wróć do raportu”, „Utwórz bez zmian w plikach” i „Zastosuj poprawki i utwórz książkę”.
- Wartości dopisywane (`Order`, `Act`, `Class`) wynikają z roli folderu i wybranego Beats System; reguły kluczy dla ról są w sekcji 8 wytycznych.

## 4. Kopie zapasowe

- Ścieżka: `.firefly/backups/<RRRR-MM-DD_GGmm>/<ścieżka względna pliku>`; jedna kopia na plik, jeden folder na uruchomienie poprawek.
- Kopia powstaje tuż przed zapisem pliku. Jeśli kopii nie da się utworzyć, plik nie jest zmieniany i trafia do raportu błędów.
- Jeśli plik zmienił się na dysku między skanem a zapisem (inny hash), jest pomijany i raportowany.
- Zapis tekstowy: wstawiamy tylko brakujące linie we frontmatterze, zachowując CRLF/BOM, komentarze i nieznane klucze.
- Retencja: propozycja to ostatnie 10 uruchomień, starsze usuwane po udanym zapisie. Do decyzji (punkt 6).

## 5. Wykrywanie książek i Stan B

- Po otwarciu sekcji Książki Firefly przeszukuje już zeskanowane węzły vaultu pod kątem `Class: Book`. Nie czyta plików ponownie.
- Stan B pokazuje kartę aktywnej książki (nazwa, ścieżka, Beats System, liczba plików, czas ostatniego skanu) i przyciski „Skanuj ponownie” oraz „Zmień książkę”.
- Jeśli znaleziono inne książki, pod kartą pojawia się wiersz „Znaleziono jeszcze N książek w tym vaulcie” (odmiana: 1 książkę, 2–4 książki, 5 i więcej książek) z przyciskiem „Przełącz na tę książkę”. Przy kilku książkach: lista.
- Brak aktywnej książki, ale wykryte są książki: Stan B bez karty aktywnej, od razu z listą do wyboru.
- Aktywna książka zapisuje się w `story-spine-writing-active-book` (mapa: root vaultu na ścieżkę pliku książki). Jeśli istnieje stary klucz `story-spine-writing-active-project`, a nowego nie ma, wartość jest kopiowana jednorazowo przy starcie, a stary klucz usuwany.
- Uwaga: bez file watchera lista odświeża się tylko po „Skanuj ponownie” i po ponownym skanie vaultu; trzeba to napisać w UI.

## 6. Decyzje do podjęcia

1. Retencja kopii zapasowych: ostatnie 10 uruchomień (rekomendacja) czy bez limitu.
2. Gdzie leży plik książki w trybie istniejących folderów: w folderze nadrzędnym wskazanych folderów (rekomendacja) czy w wybranym folderze docelowym.
3. Czy „Zmień książkę” ma ostrzegać o niezapisanych kartach z plikami poprzedniej książki.

## 7. Zmiana nazwy: Project na Book (polecenia dla wdrożenia)

Pojęcie „projekt” zostaje zastąpione pojęciem „książka” (w kodzie i plikach `Book`), żeby słowo Project pozostało wolne na przyszłe użycie. Zmiana dotyczy też już wdrożonej wersji 1. Wykonaj każde polecenie z tabeli.

| Miejsce | Zmień z | Zmień na |
| --- | --- | --- |
| Klasa pliku | `Class: Project` | `Class: Book` |
| Napisy w interfejsie: sekcja | „Projekty” | „Książki” (do potwierdzenia, pytanie 3 w dokumencie o frontmatterze) |
| Napisy w interfejsie: tworzenie | „Utwórz nowy projekt”, „Nazwa projektu”, „Utwórz projekt” | „Utwórz nową książkę”, „Nazwa książki”, „Utwórz książkę” |
| Napisy w interfejsie: raport i podgląd | „Utwórz projekt bez zmian w plikach”, „Zastosuj poprawki i utwórz projekt” | „Utwórz książkę bez zmian w plikach”, „Zastosuj poprawki i utwórz książkę” |
| Napisy w interfejsie: Stan B | „Zmień projekt”, „Przełącz na ten projekt”, „Znaleziono jeszcze N projekt(y)” | „Zmień książkę”, „Przełącz na tę książkę”, „Znaleziono jeszcze N książek” (z odmianą) |
| Klucz localStorage | `story-spine-writing-active-project` | `story-spine-writing-active-book`, z jednorazową migracją starej wartości |
| SettingsContext | `activeProject`, `setActiveProject` | `activeBook`, `setActiveBook` |
| Typy, komponenty, funkcje | każdy identyfikator z części `Project` (np. `ProjectFile`, `ProjectSection`) | ta sama nazwa z `Book` |
| Nazwy plików i folderów w `src/` | każdy plik lub folder z `project` w nazwie | ta sama nazwa z `book` |
| Wartość `Project` w już utworzonych plikach | `Class: Project` (pliki z wersji 1) | odczytywana jako `Book` bez zmiany pliku; użytkownik poprawia ręcznie lub przez podgląd poprawek |

### Jak znaleźć wszystkie miejsca

1. W repozytorium uruchom wyszukiwanie bez rozróżniania wielkości liter: `grep -rniE "project|projekt" src/ docs/`.
2. Zamień każde trafienie dotyczące tej funkcji na `Book` lub „książka” według tabeli, w tym w komentarzach, testach i danych mockowych.
3. Nie zmieniaj trafień niezwiązanych z tą funkcją: pola `project` w konfiguracji narzędzi (`tsconfig`, `package.json`), zależności zewnętrznych i słowa „projekt” użyte w znaczeniu ogólnym.
4. Po zmianie to samo wyszukiwanie ma zwrócić tylko wyjątki z punktu 3 oraz stary klucz localStorage w kodzie migracji.

### Dokumenty i makiety do zaktualizowania

- **Wytyczne: Ustawienia Writing, sekcja Projekty:** zamień „projekt”, „Plik projektu” i `Class: Project` na „książka”, „Plik książki” i `Class: Book`; zmień tytuł dokumentu, jeśli sekcja ustawień zmieni nazwę.
- **Makieta z etapu 1 (plansze 1–3) i nowa makieta etapu 2:** popraw napisy „Utwórz nowy projekt”, „Nazwa projektu”, „Utwórz projekt”, „Utwórz projekt bez zmian w plikach”, „Zastosuj poprawki i utwórz projekt”, „Zmień projekt”, „Przełącz na ten projekt”, „Wykryty projekt”, „PROJEKTY”.
- **Szablony beatów (Beats System):** sprawdź, czy słowo „projekt” występuje w opisach pliku beatu; zamień, jeśli tak.
- **docs/firefly\_docs (vision i dev\_docs):** w tym `feature-status-matrix.md` i dokumentacja modułu Writing/Settings.
