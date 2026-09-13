// ID widoków rejestrowanych w Obsidianie — muszą być globalnie unikalne
export const FIREFLY_MAIN_VIEW_TYPE = 'firefly-main';
export const FIREFLY_FILE_BROWSER_VIEW_TYPE = 'firefly-file-browser';

// Nazwy eventów — używaj TYLKO tych stałych, nigdy stringów literalnych
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
