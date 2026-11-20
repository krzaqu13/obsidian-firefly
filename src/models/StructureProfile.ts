export type ArcElementKind = 'text' | 'anchor';
export type FieldMap = Record<string, string>;

export interface BeatDef {
	key?: string;
	id?: string;
	sourcePath?: string;
	name: string;
	act: number;
	range?: string;
	purpose?: string;
	enabled?: boolean;
	order?: number;
}

export interface ArcElementDef {
	key: string;
	name: string;
	kind: ArcElementKind;
	multi?: boolean;
}

export interface StructureProfile {
	id: string;
	name: string;
	version: number;
	basedOn: string;
	acts: Array<{ id: number; name: string }>;
	beats: BeatDef[];
	arcElements: ArcElementDef[];
	fieldMap: FieldMap;
	folders: {
		beats: string;
		scenes: string;
		arcs: string;
		subplots: string;
	};
	naming: {
		beatPattern: string;
		orderPadding: number;
	};
	createdAt?: number;
	updatedAt?: number;
}

export interface StructurePresetDefinition extends StructureProfile {
	description?: string;
}

export interface ProjectStructureSettings {
	profiles: StructureProfile[];
	activeProfileId?: string | null;
	storageMode?: 'manifest' | 'plugin';
}
