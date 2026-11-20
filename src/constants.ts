export const FIREFLY_MAIN_VIEW_TYPE = 'firefly-main';
export const FIREFLY_SIDEBAR_VIEW_TYPE = 'firefly-sidebar';
export const FIREFLY_INNER_SIDEBAR_VIEW_TYPE = FIREFLY_SIDEBAR_VIEW_TYPE;
export const FIREFLY_FILE_BROWSER_VIEW_TYPE = FIREFLY_SIDEBAR_VIEW_TYPE;
export const FIREFLY_FILE_BROWSER_VIEW_TYPE_LEGACY = 'firefly-file-browser';

export const FIREFLY_EVENT_AREA_CHANGED = 'firefly:area-changed';
export const FIREFLY_EVENT_TAB_CHANGED = 'firefly:tab-changed';
export const FIREFLY_PLOTGRID_DETAILS_VIEW_TYPE = 'firefly-plotgrid-details';

export type AreaId = 'home' | 'writing' | 'worldbuilding' | 'plotgrid' | 'connections' | 'dashboard';

export const AREA_ORDER: AreaId[] = [
	'home',
	'writing',
	'worldbuilding',
	'plotgrid',
	'connections',
	'dashboard',
];
