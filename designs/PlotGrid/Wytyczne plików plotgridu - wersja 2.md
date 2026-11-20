# Wytyczne plików plotgridu (wersja 2)

Data: 28-10-2026

Zastępuje wersję testową z 27-10-2026. Zmiany: osobne typy Arc, Subplot i Mechanic, podkolumny deklarowane listą w pliku arcu, klucze komórek tylko dla wypełnionych komórek, komórka zawsze jako lista, linki ze ścieżką i aliasem.

## Status ustaleń

- zatw. Plotgrid to widok, a nie osobna struktura danych. Komórka = przecięcie beatu (wiersz) i kolumny (arc, subplot lub mechanika).
- zatw. Hierarchia: Akt (atrybut) > Beat > Scena. Nie ma poziomu "jednostka".
- zatw. Wartość komórki leży w pliku beatu jako płaski atrybut. Definicja leży w pliku kolumny (arc, subplot, mechanika) lub sekretu.
- zatw. Podkolumny arcu są deklarowane płaską listą `podkolumny` w pliku arcu. Klucz w beacie powstaje dopiero przy wypełnieniu komórki.
- zatw. Zdarzenia sekretów to same znaczniki (płaskie listy linków), bez tekstu przy zdarzeniu.
- zatw. Arc, Subplot i Mechanic to osobne typy plików z własnym frontmatterem.
- inf. Propozycja do potwierdzenia: komórka zawsze jako lista YAML (jeden typ na kolumnę), linki z pełną ścieżką i aliasem, najsłabszy stan wygrywa, podkolumny opcjonalne dla każdej kolumny.
- zatw. Rodzaje zdarzeń sekretów: zasiew (`z`), odsłona częściowa (`o`), odsłona pełna (`O`), podważenie (`p`). Fałszywy trop mieści się w podważeniu, więc nie ma osobnego klucza `sekret_trop`.
- w_toku. Kolejność odsłon wewnątrz beatu (opcje A: tylko beat, B: także scena, C: `sekret_kolejnosc`).
- w_toku. `audience` (czytelnik / postać) dla ironii dramatycznej.
- w_toku. Język i styl nazw kluczy (istniejące `Class`, `StoryTension` vs polskie).
- w_toku. Wątki dla kolumn xlsx pominiętych w teście (Rasa, Drużyna, Sekta, Enklawa, Tatuaż).

## Struktura folderów (propozycja)

```
Choć cień nadziei/
  Beaty/
  Sceny/
  Arcy/
  Subploty/
  Mechaniki/
  Sekrety/
```

Postacie zostają tam, gdzie są dziś.

## Zasady ogólne

1. Krótkie, filtrowalne dane idą do YAML. Długi, ciągły tekst idzie do treści notatki.
2. Relację zapisujemy raz, po stronie czasu (w beacie). Odwrotną stronę liczy wtyczka z backlinków.
3. Linki w YAML mają pełną ścieżkę i alias, w cudzysłowie: `"[[Beaty/Prolog|Prolog]]"`. Chroni to przed kolizją nazw w dużym vaulcie.
4. Wtyczka czyta tylko pliki z odpowiednim `Class`. Plik z `Class: Test` jest ignorowany, nawet gdy ma klucze `kom_*`.
5. Id kolumny: małe litery ASCII, bez znaku `_`, wielowyrazowe łączymy myślnikiem (`wielki-mistrz`).
6. Daty w formacie DD-MM-RRRR. Nagłówki bez emoji.
7. Tymczasowo: istniejące nazwy kluczy zostają (`Class`, `Act`, `Order`, `Range`, `StoryTension`, `StoryPacing`, `Subplot`, `POV`, `beat`). Nowe klucze są po polsku, małymi literami.

### Klucze komórek w beacie

- Kolumna bez podkolumn: `kom_<id>`.
- Kolumna z podkolumnami: `kom_<id>_<nazwa podkolumny>`. Nazwa jest dokładnie taka, jak na liście `podkolumny` (może mieć spacje i polskie znaki).
- Wartość zawsze jest listą tekstów. Jedna pozycja = jedno zdarzenie. Komórka z jednym zdarzeniem to lista jednoelementowa.
- Klucz istnieje tylko, gdy komórka jest wypełniona. Brak klucza = pusta komórka.
- Kolumna istnieje, gdy jest w pliku kolumny (`podkolumny` lub sam plik), niezależnie od beatów.
- Zmiana nazwy podkolumny przepisuje klucz w beatach, w których jest wypełniona.

## Typ 1: Beat

Plik w `Beaty/`. Jeden beat = jeden wiersz siatki.

```yaml
---
Class: Beat
Beat Model: Blank custom
Act: 1
Order: 1
Range: 1-10
Purpose:
StoryTension: 3
StoryPacing: 4
pov: "[[Postacie/Merharin|Merharin]]"
stawka: 0
stan: zatw
# zdarzenia sekretów: klucze opcjonalne, wtyczka dopisuje przy użyciu
sekret_zasiew:
  - "[[Sekrety/S1|S1]]"
sekret_podwazenie:
  - "[[Sekrety/S3|S3]]"
# komórki: tylko wypełnione
kom_merharin_Kłamstwo:
  - "Kłamstwo działa od pierwszych scen: kontrola, nie prosi o pomoc (A)"
  - "Kłamstwo potwierdzone: gdybym był lepszy, węzeł by nie padł"
kom_organizacja:
  - "Plotki, że to ostatnia wyprawa; zasiew organizacji"
kom_dawkowanie:
  - "Wolno: kamienie bojowe, formacja. Nie wolno: Ciszy, historii"
---
```

Pola:

- `Act`, `Order`, `Range`, `StoryTension`, `StoryPacing`: jak dziś (oś Y napięcia i tempa).
- `pov`: link do postaci.
- `stawka`: liczba z drabiny (0–5), opcjonalna. Opis stawki, także wewnętrznej, idzie do kolumny `kom_stawka` (mechanika).
- `stan`: `zatw`, `prop` albo `otwarte`. Najsłabszy stan wygrywa: jeśli którekolwiek ze zdarzeń beatu jest propozycją, beat ma `prop`.
- `Arc` (jeden string) z dzisiejszych beatów odpada. Wtyczka wylicza, w których arcach beat ma treść.
- Treść notatki pod frontmatterem jest wolna na notatki do pisania.

## Typ 2: Scena

Plik w `Sceny/`. Zostaje taki jak dziś, bez nowych pól.

```yaml
---
Class: Scene
Act: 1
Order: 1
Subplot:
  - Łuk Merharina
Character:
POV:
Status:
beat: "[[Beaty/The Hook|The Hook]]"
---
```

Pole `Subplot` zostaje listą tekstów. Wtyczka dopasowuje je po polu `nazwa` w plikach arcu i subplotu, więc sceny nie wymagają zmian.

Zdarzenia sekretów na scenie na razie nie występują (patrz otwarta kwestia kolejności odsłon).

## Typ 3: Arc

Plik w `Arcy/`. Kolumna siatki powiązana z postacią, zwykle z podkolumnami.

```yaml
---
Class: Arc
id: merharin
nazwa: Łuk Merharina
owner: "[[Postacie/Merharin|Merharin]]"
kolor: "#c9a24a"
column_order: 1
podkolumny:
  - Kłamstwo
  - Czyn i cel
  - Duch
stan: zatw
---

## Definicje

### Kłamstwo
Gdybym był lepszy, nikt by nie umarł.

### Czyn i cel
Dobry cel, zła metoda: chroni ludzi, ale działa sam, bez informowania i za kogoś.

### Duch
Stary Łowca zginął w drodze do enklawy, gdy Merharin miał 8 lat.
```

Pola:

- `id`: unikalny, patrz zasada 5.
- `nazwa`: nazwa wyświetlana. Dopasowanie do `Subplot` w scenach.
- `owner`: link do postaci (jedyne pole, którego nie mają subploty).
- `podkolumny`: płaska lista nazw w kolejności kolumn. Opcjonalna. Arc bez podkolumn ma jedną komórkę `kom_<id>`.
- Nagłówki `###` w sekcji `## Definicje` odpowiadają nazwom podkolumn.

## Typ 4: Subplot

Plik w `Subploty/`. Wątek fabularny bez właściciela-postaci.

```yaml
---
Class: Subplot
id: organizacja
nazwa: Organizacja i Imperium
kolor: "#3f6e8c"
column_order: 3
podkolumny: []
stan: zatw
---

Kilku równych przywódców, jawny rywal w wyścigu po Serce, szpiedzy w drużynie.
```

Pola jak w arcu, bez `owner`. `podkolumny` opcjonalne. Treść pliku to krótki opis wątku (po co jest, co ma robić w tomie).

## Typ 5: Mechanic

Plik w `Mechaniki/`. Kolumna techniczna, nie fabularna (dawkowanie, stawka).

```yaml
---
Class: Mechanic
id: dawkowanie
nazwa: POV, dawkowanie, telling
kolor: "#8a8a8a"
column_order: 9
---
```

Cel: zasada "wolno / nie wolno" przy każdym beacie, opis stawki. Komórki to `kom_dawkowanie` i `kom_stawka`.

## Typ 6: Sekret

Plik w `Sekrety/`. Nazwa pliku = id.

```yaml
---
Class: Secret
id: S3
tytul: Tatuaż Światła to zalążek Znaku Pieczęci
prawda: Tatuaż Światła to zalążek Znaku Pieczęci; Bractwo widzi dawny tatuaż, ale nie rozumie, co znaczy.
kto_wie: []
reveal_target: "[[Beaty/Climax 5|Climax 5]]"
twist: nie
zasiew_wymagany: tak
stan: zatw
---
```

Pola:

- `prawda`: jedno zdanie. Rozwinięcie idzie do treści.
- `kto_wie`: lista linków do postaci.
- `reveal_target`: link do beatu docelowej odsłony.
- `twist`: `tak` albo `nie`.
- `zasiew_wymagany`: `tak` (domyślnie) albo `nie`. Dla sekretu zamierzenie bez zasiewu (np. S6: "brak sygnałów wcześniej") wyłącza ostrzeżenie "odsłona bez zasiewu".
- Kiedy i jak sekret jest zasiewany lub odsłaniany, wynika z beatów. Nie zapisujemy tego w pliku sekretu.

### Rodzaje zdarzeń w beacie

| Klucz w beacie | Kod w xlsx | Znaczenie |
|---|---|---|
| `sekret_zasiew` | `z` | zasiew: czytelnik dostaje pierwszy ślad |
| `sekret_czesciowo` | `o` (małe) | odsłona częściowa: część prawdy wychodzi na jaw |
| `sekret_pelne` | `O` (duże) | odsłona pełna |
| `sekret_podwazenie` | `p` | podważenie: zdarzenie osłabia lub myli trop (także fałszywy trop) |

Uwaga do importu z xlsx: kody `o` i `O` różnią się tylko wielkością liter, więc mapowanie musi rozróżniać wielkość liter. Kod z dwoma znakami w jednej komórce (np. `z/p`, `O p`) to dwa zdarzenia tego samego sekretu w jednym beacie, każde we własnym kluczu.

## Typ 7: Postać

Istniejące notatki postaci zostają. Wtyczka wymaga tylko:

```yaml
---
Class: Character
---
```

Opcjonalnie: `rola`, `pov: tak` (postać z POV), aliasy. Arcy postaci wtyczka wylicza z pola `owner` w plikach arcu. W pliku postaci nie zapisujemy ich drugi raz.

## Co liczy wtyczka (nie zapisujesz)

- Tabela tajemnic: macierz sekret × beat z rodzajem zdarzenia.
- Widok arcu: kolumny jednego arcu ułożone po beatach.
- Walidacje: odsłona bez zasiewu (z wyjątkiem `zasiew_wymagany: nie`), brak odsłony pełnej, odsłona pełna przed `reveal_target`, `reveal_target` bez beatu, link do sekretu bez pliku, kilka odsłon pełnych w jednym beacie (reguła "odsłony po jednej"), nieznany klucz `kom_*`, scena z `Subplot` bez dopasowania do `nazwa`.
- Stawka na osi, napięcie i tempo.

## Zestaw testowy

Pliki w `Archiwum/Test` pozostają. Po przyjęciu wersji 2 do zmiany: komórki jako listy w każdej kolumnie, linki ze ścieżką, rozdzielenie plików wątków na Arc, Subplot i Mechanic, lista `podkolumny` w arcu, usunięcie pustych kluczy (w tym `sekret_trop: []`).
