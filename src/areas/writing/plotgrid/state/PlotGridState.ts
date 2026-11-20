import type { Beat } from '../../../../models/Beat';
import type { Arc } from '../../../../models/Arc';
import type { Subplot } from '../../../../models/Subplot';
import type { Mechanic } from '../../../../models/Mechanic';
import type { Secret } from '../../../../models/Secret';
import type { Scene } from '../../../../models/Scene';
import type { ValidationResult } from '../../PlotGridValidator';

export type PlotGridTabId =
	| 'plotgrid'
	| 'beats'
	| 'scenes'
	| 'arcs'
	| 'subplots'
	| 'mechanics'
	| 'secrets';

export type PlotGridOrient = 'rows' | 'cols';

export type DrawerTabMode = 'cell' | 'column';

export type PlotGridSelection =
	| {
			kind: 'cell';
			beatFilePath: string;
			colId: string;
			sub: string | null;
			colType: 'arc' | 'subplot' | 'mechanic';
	  }
	| {
			kind: 'column';
			colId: string;
			colType: 'arc' | 'subplot' | 'mechanic';
	  }
	| {
			kind: 'beat';
			beatFilePath: string;
	  }
	| {
			kind: 'scene';
			sceneFilePath: string;
	  }
	| {
			kind: 'secret';
			secretId: string;
	  }
	| null;

/** Ujednolicona reprezentacja kolumny siatki (Arc, Subplot lub Mechanic). */
export interface GridCol {
	type: 'Arc' | 'Subplot' | 'Mechanic';
	source: Arc | Subplot | Mechanic;
	/** Podkolumny (puste = [null] → jedna kolumna bez podkolumny). */
	leaves: Array<string | null>;
	color: string;
}

export interface PlotGridData {
	beats: Beat[];
	arcs: Arc[];
	subplots: Subplot[];
	mechanics: Mechanic[];
	secrets: Secret[];
	scenes: Scene[];
	cols: GridCol[];
	validation: ValidationResult;
}

export class PlotGridState {
	public activeTab: PlotGridTabId = 'plotgrid';
	public orient: PlotGridOrient = 'rows';
	public drawerOpen: boolean = false;
	public drawerMode: DrawerTabMode = 'cell';
	public selection: PlotGridSelection = null;

	public hiddenCols: Set<string> = new Set();
	public hiddenSecrets: boolean = false;

	public lastSelectedCell: {
		beatFilePath: string;
		colId: string;
		sub: string | null;
		colType: 'arc' | 'subplot' | 'mechanic';
	} | null = null;

	public selectedArcId: string | null = null;
	public selectedSubplotId: string | null = null;
	public selectedMechanicId: string | null = null;

	public data: PlotGridData = {
		beats: [],
		arcs: [],
		subplots: [],
		mechanics: [],
		secrets: [],
		scenes: [],
		cols: [],
		validation: { issues: [], ok: [] },
	};

	/** Wybiera komórkę i otwiera drawer w trybie 'cell'. */
	selectCell(
		beatFilePath: string,
		colId: string,
		sub: string | null,
		colType: 'arc' | 'subplot' | 'mechanic',
	): void {
		this.selection = { kind: 'cell', beatFilePath, colId, sub, colType };
		this.lastSelectedCell = { beatFilePath, colId, sub, colType };
		this.drawerMode = 'cell';
		this.drawerOpen = true;
	}

	/** Wybiera kolumnę i otwiera drawer w trybie 'column'. */
	selectColumn(colId: string, colType: 'arc' | 'subplot' | 'mechanic'): void {
		this.selection = { kind: 'column', colId, colType };
		this.drawerMode = 'column';
		this.drawerOpen = true;
	}

	/** Wybiera beat i otwiera drawer. */
	selectBeat(beatFilePath: string): void {
		this.selection = { kind: 'beat', beatFilePath };
		this.drawerOpen = true;
	}

	/** Wybiera scenę i otwiera drawer. */
	selectScene(sceneFilePath: string): void {
		this.selection = { kind: 'scene', sceneFilePath };
		this.drawerOpen = true;
	}

	/** Wybiera sekret i otwiera drawer. */
	selectSecret(secretId: string): void {
		this.selection = { kind: 'secret', secretId };
		this.drawerOpen = true;
	}

	/** Zamyka drawer. */
	closeDrawer(): void {
		this.drawerOpen = false;
	}

	/** Wybiera pierwszą wypełnioną komórkę jeśli brak zaznaczenia. */
	autoSelectFirst(): void {
		if (this.selection) return;
		for (const beat of this.data.beats) {
			for (const col of this.data.cols) {
				const colType = col.type.toLowerCase() as 'arc' | 'subplot' | 'mechanic';
				for (const sub of col.leaves) {
					const key = sub ? `${colType}_${col.source.id}_${sub}` : `${colType}_${col.source.id}`;
					const legacyKey = sub ? `kom_${col.source.id}_${sub}` : `kom_${col.source.id}`;
					if ((beat.cells[key]?.length ?? 0) > 0 || (beat.cells[legacyKey]?.length ?? 0) > 0) {
						this.selection = {
							kind: 'cell',
							beatFilePath: beat.filePath,
							colId: col.source.id,
							sub,
							colType,
						};
						this.lastSelectedCell = { ...this.selection };
						this.drawerMode = 'cell';
						return;
					}
				}
			}
		}
		if (this.data.beats.length > 0 && this.data.cols.length > 0) {
			const b = this.data.beats[0];
			const c = this.data.cols[0];
			if (b && c) {
				this.selection = {
					kind: 'cell',
					beatFilePath: b.filePath,
					colId: c.source.id,
					sub: c.leaves[0] ?? null,
					colType: c.type.toLowerCase() as 'arc' | 'subplot' | 'mechanic',
				};
				this.lastSelectedCell = { ...this.selection };
				this.drawerMode = 'cell';
			}
		}
	}
}
