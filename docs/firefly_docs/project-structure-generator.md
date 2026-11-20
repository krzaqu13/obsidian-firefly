# Generator struktury projektu

## Status

Wdrożono podstawę modelu danych i serwisu wtyczki do obsługi profili struktury projektu. To obejmuje:

- typy `StructureProfile`, `BeatDef`, `ArcElementDef`, `FieldMap`
- preset `Sanderson — 9 punktów`
- pusty preset `Pusty`
- `StructureManager` do tworzenia, walidacji i planowania plików projektu
- integrację ustawień i prosty widok sekcji w ustawieniach Firefly

## Założenia

- Profil struktury jest przechowywany w ustawieniach wtyczki jako źródło prawdy dla aktywnego projektu.
- Dla przyszłej fazy można rozważyć migrację do manifestu w katalogu projektu, zgodnie z rekomendacją z dokumentu projektowego.
- Nazwy i kolejność beatów są odzwierciedlane w planie generowania plików i można rozszerzać o dodatkowe profile w przyszłości.

## Model danych

Najważniejsze elementy są zdefiniowane w `src/models/StructureProfile.ts`:

- `BeatDef` opisuje pojedynczy beat z zakresem, aktywnością, kolejnością i celem.
- `ArcElementDef` opisuje element łuku fabularnego: tekstowy lub kotwica.
- `StructureProfile` wyraża profil całej struktury książki, w tym foldery i wzorce nazewnictwa.
- `FieldMap` reprezentuje mapowanie nazw pól frontmatteru.

## Presety

Zdefiniowane w `src/models/StructurePresets.ts`:

- `sanderson-9` — podstawowy, 9-beatowy profil oparty na modelu Sandersona
- `empty-structure` — pusty profil do budowy własnej struktury

## Serwis

`src/services/StructureManager.ts` odpowiada za:

- pobranie aktywnego profilu
- utworzenie profilu z presetów
- walidację profilu
- budowanie planu plików projektu i folderów
- wykrywanie nieprawidłowych nazw i mieszania alfabetów

## Integracja z ustawieniami

Plugin zapisuje ustawienia w `FireflySettings` oraz wyświetla sekcję w panelu ustawień:

- `src/settings.ts`
- `src/views/ProjectStructureSettingSection.ts`

## Następne etapy

W kolejnej fazie można dopisać:

1. pełną wizardową konfigurację krok po kroku
2. zapis profilu do manifestu książki zamiast tylko do ustawień pluginu
3. generowanie plików `.md` z frontmatterem i kolizjami
4. obsługę zmiany nazw atrybutów frontmatteru poprzez `fieldMap`
5. wsparcie dla rodzielonych, dynamicznych profilów subplotów i postaci
