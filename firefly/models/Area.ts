import type { AreaId } from '../constants';

/**
 * Konfiguracja pojedynczego obszaru — co pokazuje drzewo plików
 * kiedy ten obszar jest aktywny. Przechowywana w data.json pluginu
 * i edytowalna przez ustawienia wtyczki.
 */
export interface AreaConfig {
    id: AreaId;
    label: string;
    icon: string;
    rootFolder: string;
    allowedFileTypes: string[];
    allowedTags: string[];
}

/**
 * Konfiguracja pojedynczej zakładki wewnątrz obszaru.
 */
export interface AreaTabConfig {
    id: string;
    label: string;
    icon: string;
    areaId: AreaId;
}

/**
 * Stan nawigacji — co jest aktualnie aktywne.
 * Przechowywany w localStorage pod kluczem 'firefly-nav-state'.
 */
export interface NavState {
    currentAreaId: AreaId;
    activeTabPerArea: Partial<Record<AreaId, string>>;
}
