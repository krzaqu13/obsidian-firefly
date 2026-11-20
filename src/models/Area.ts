import type { AreaId } from '../constants';

export interface AreaConfig {
	id: AreaId;
	label: string;
	icon: string;
	rootFolder: string;
	allowedFileTypes: string[];
	allowedTags: string[];
}

export interface NavState {
	currentAreaId: AreaId;
	activeTabPerArea: Partial<Record<AreaId, string>>;
}
