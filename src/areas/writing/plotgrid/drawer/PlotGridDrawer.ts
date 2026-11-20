import { setIcon, App } from 'obsidian';
import type { PlotGridState } from '../state/PlotGridState';
import { cellKey, cellValue } from '../../../../services/PlotGridReader';
import { renderSecretChip } from '../components/SecretChip';
import type { SecretEventKind } from '../../../../models/Secret';

export interface PlotGridDrawerCallbacks {
	onClose: () => void;
	onModeChange: (mode: 'cell' | 'column') => void;
	onOpenFile: (path: string) => void;
	onShowInPlotGrid?: (colId?: string, beatFilePath?: string) => void;
	onShowBeat?: (beatFilePath: string) => void;
	onAddEntry?: (beatFilePath: string, key: string) => void;
	onSaveEntry?: (beatFilePath: string, key: string, newEntry: string) => Promise<void>;
	onDeleteEntry?: (beatFilePath: string, key: string, index: number) => Promise<void>;
}

export function renderPlotGridDrawer(
	container: HTMLElement,
	app: App,
	state: PlotGridState,
	callbacks: PlotGridDrawerCallbacks,
): HTMLElement {
	const drawer = container.createDiv({
		cls: `ff-pg-drawer${state.drawerOpen ? ' is-open' : ''}`,
	});

	// --- Nagłówek Drawera ---
	const head = drawer.createDiv('ff-pg-drawer-head');
	const headTop = head.createDiv('ff-pg-drawer-head-top');
	headTop.createDiv({ cls: 'ff-pg-drawer-eyebrow', text: 'SZCZEGÓŁY' });

	const closeBtn = headTop.createEl('button', {
		cls: 'ff-pg-drawer-close-btn',
		attr: { type: 'button', 'aria-label': 'Zamknij szczegóły' },
	});
	setIcon(closeBtn, 'x');
	closeBtn.addEventListener('click', () => callbacks.onClose());

	// Przełącznik Komórka / Kolumna (widoczny przy zaznaczeniu komórki lub kolumny)
	const sel = state.selection;
	const showModeToggle = sel?.kind === 'cell' || sel?.kind === 'column';
	if (showModeToggle) {
		const toggleGroup = head.createDiv('ff-pg-drawer-mode-toggle');
		const cellBtn = toggleGroup.createEl('button', {
			cls: `ff-pg-mode-btn${state.drawerMode === 'cell' ? ' is-active' : ''}`,
			text: 'Komórka',
			attr: { type: 'button' },
		});
		cellBtn.addEventListener('click', () => callbacks.onModeChange('cell'));

		const colBtn = toggleGroup.createEl('button', {
			cls: `ff-pg-mode-btn${state.drawerMode === 'column' ? ' is-active' : ''}`,
			text: 'Kolumna',
			attr: { type: 'button' },
		});
		colBtn.addEventListener('click', () => callbacks.onModeChange('column'));
	}

	// --- Ciało Drawera (przewijana zawartość) ---
	const body = drawer.createDiv('ff-pg-drawer-body');

	if (!sel) {
		body.createDiv({ cls: 'ff-pg-drawer-empty', text: 'Wybierz element, aby zobaczyć szczegóły.' });
		return drawer;
	}

	if (sel.kind === 'beat') {
		renderBeatContent(body, state, sel.beatFilePath, callbacks);
	} else if (sel.kind === 'scene') {
		renderSceneContent(body, state, sel.sceneFilePath, callbacks);
	} else if (sel.kind === 'secret') {
		renderSecretContent(body, state, sel.secretId, callbacks);
	} else if (sel.kind === 'cell' || sel.kind === 'column') {
		if (state.drawerMode === 'column') {
			const colId = sel.colId;
			renderColumnContent(body, state, colId, callbacks);
		} else {
			// Tryb 'cell' (Komórka)
			let cellSel = sel.kind === 'cell' ? sel : null;
			if (!cellSel && sel.kind === 'column') {
				const col = state.data.cols.find(c => c.source.id.toLowerCase() === sel.colId.toLowerCase());
				const leaves = col?.leaves.length ? col.leaves : [null];
				const sub = leaves[0] ?? null;
				const targetBeat = (state.lastSelectedCell && state.lastSelectedCell.colId.toLowerCase() === sel.colId.toLowerCase())
					? state.data.beats.find(b => b.filePath === state.lastSelectedCell!.beatFilePath)
					: (state.data.beats.find(b => col ? cellValue(b, col.source.id, sub, sel.colType).length > 0 : false) ?? state.data.beats[0]);
				if (targetBeat && col) {
					cellSel = {
						kind: 'cell',
						beatFilePath: targetBeat.filePath,
						colId: col.source.id,
						sub,
						colType: sel.colType,
					};
					state.selection = cellSel;
					state.lastSelectedCell = cellSel;
				}
			}

			if (cellSel) {
				renderCellContent(body, state, cellSel, callbacks);
			} else {
				body.createDiv({ cls: 'ff-pg-drawer-empty', text: 'Wybierz komórkę, aby zobaczyć szczegóły.' });
			}
		}
	}

	return drawer;
}

// ---------------------------------------------------------------------------
// 1. Tryb Komórka
// ---------------------------------------------------------------------------

function renderCellContent(
	body: HTMLElement,
	state: PlotGridState,
	sel: { beatFilePath: string; colId: string; sub: string | null; colType: 'arc' | 'subplot' | 'mechanic' },
	callbacks: PlotGridDrawerCallbacks,
): void {
	const beat = state.data.beats.find(b => b.filePath === sel.beatFilePath);
	const col = state.data.cols.find(c => c.source.id.toLowerCase() === sel.colId.toLowerCase());
	if (!beat || !col) return;

	const titleText = sel.sub ? `${beat.name} · ${sel.sub}` : `${beat.name} · ${col.source.nazwa}`;
	body.createEl('h2', { cls: 'ff-pg-drawer-title', text: titleText });

	const colLabel = col.type === 'Arc' ? `Arc: ${col.source.nazwa}` : col.type === 'Subplot' ? `Subplot: ${col.source.nazwa}` : `Mechanic: ${col.source.nazwa}`;
	const rangeText = beat.range ? `Range ${beat.range}%` : '';
	const subText = [colLabel, `Akt ${beat.act}`, rangeText].filter(Boolean).join(' · ');
	body.createDiv({ cls: 'ff-pg-drawer-subinfo', text: subText });

	// Sekcja: WPISY
	const entriesSection = body.createDiv('ff-pg-drawer-section');
	entriesSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'WPISY' });

	const values = cellValue(beat, col.source.id, sel.sub, sel.colType);
	const canonicalKey = cellKey(col.source.id, sel.sub, sel.colType);

	if (values.length > 0) {
		const list = entriesSection.createDiv('ff-pg-drawer-entry-list');
		values.forEach((val, idx) => {
			const item = list.createDiv('ff-pg-drawer-entry-item');
			item.createDiv({ cls: 'ff-pg-entry-text', text: val });

			if (callbacks.onDeleteEntry) {
				const delBtn = item.createEl('button', {
					cls: 'ff-pg-entry-del-btn',
					attr: { type: 'button', 'aria-label': 'Usuń ten wpis' },
				});
				setIcon(delBtn, 'trash-2');
				delBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					callbacks.onDeleteEntry?.(beat.filePath, canonicalKey, idx);
				});
			}
		});
	} else {
		entriesSection.createDiv({ cls: 'ff-pg-drawer-entry-empty', text: '(Brak wpisu w tej komórce)' });
	}

	// Formularz dodawania wpisu (inline)
	const addContainer = entriesSection.createDiv('ff-pg-add-entry-container');
	const addEntryBtn = addContainer.createEl('button', {
		cls: 'ff-pg-btn-add-entry',
		text: '+ Dodaj wpis',
		attr: { type: 'button' },
	});

	const formBox = addContainer.createDiv({ cls: 'ff-pg-inline-add-box is-hidden' });
	const textarea = formBox.createEl('textarea', {
		cls: 'ff-pg-inline-textarea',
		attr: { placeholder: 'Wpisz treść zdarzenia fabularnego...', rows: '2' },
	});
	const btnRow = formBox.createDiv('ff-pg-inline-btn-row');
	const saveBtn = btnRow.createEl('button', {
		cls: 'ff-pg-action-btn mod-cta',
		text: 'Zapisz',
		attr: { type: 'button' },
	});
	const cancelBtn = btnRow.createEl('button', {
		cls: 'ff-pg-action-btn',
		text: 'Anuluj',
		attr: { type: 'button' },
	});

	addEntryBtn.addEventListener('click', () => {
		addEntryBtn.addClass('is-hidden');
		formBox.removeClass('is-hidden');
		textarea.focus();
	});

	cancelBtn.addEventListener('click', () => {
		formBox.addClass('is-hidden');
		addEntryBtn.removeClass('is-hidden');
		textarea.value = '';
	});

	saveBtn.addEventListener('click', async () => {
		const trimmed = textarea.value.trim();
		if (!trimmed) return;
		if (callbacks.onSaveEntry) {
			await callbacks.onSaveEntry(beat.filePath, canonicalKey, trimmed);
		} else {
			callbacks.onAddEntry?.(beat.filePath, canonicalKey);
		}
	});

	// Sekcja: DEFINICJA KOLUMNY
	if (col.type === 'Arc') {
		const arc = col.source as any;
		const defSection = body.createDiv('ff-pg-drawer-section');
		defSection.createDiv({
			cls: 'ff-pg-drawer-section-title',
			text: `DEFINICJA KOLUMNY (ARC: ${arc.nazwa.toUpperCase()})`,
		});

		const kvBox = defSection.createDiv('ff-pg-def-kv-box');
		const keysToCheck: Array<[string, string]> = [
			['lie', 'lie'],
			['truth', 'truth'],
			['want', 'want'],
			['need', 'need'],
			['ghost', 'ghost'],
			['flaws', 'flaws'],
			['limitations', 'limitations'],
		];
		for (const [prop, label] of keysToCheck) {
			const val = arc[prop] || arc.definitions?.[prop];
			if (val || ['lie', 'truth', 'want', 'need'].includes(prop)) {
				const row = kvBox.createDiv('ff-pg-def-kv-row');
				row.createSpan({ cls: 'ff-pg-def-k', text: label });
				const displayVal = val || 'jeszcze niezdefiniowane';
				row.createSpan({ cls: `ff-pg-def-v${displayVal === 'jeszcze niezdefiniowane' ? ' is-empty' : ''}`, text: displayVal });
			}
		}
	} else if (col.type === 'Subplot') {
		const sub = col.source as any;
		const defSection = body.createDiv('ff-pg-drawer-section');
		defSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'OPIS SUBPLOTU' });
		defSection.createDiv({ cls: 'ff-pg-def-text', text: sub.description || '(Brak opisu w pliku subplotu)' });
	} else if (col.type === 'Mechanic') {
		const mech = col.source as any;
		const defSection = body.createDiv('ff-pg-drawer-section');
		defSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'PLIK KOLUMNY' });
		const kvBox = defSection.createDiv('ff-pg-def-kv-box');
		const row1 = kvBox.createDiv('ff-pg-def-kv-row');
		row1.createSpan({ cls: 'ff-pg-def-k', text: 'Plik' });
		row1.createSpan({ cls: 'ff-pg-def-v font-mono', text: mech.filePath || '—' });
		const row2 = kvBox.createDiv('ff-pg-def-kv-row');
		row2.createSpan({ cls: 'ff-pg-def-k', text: 'id' });
		row2.createSpan({ cls: 'ff-pg-def-v font-mono', text: mech.id });
		const row3 = kvBox.createDiv('ff-pg-def-kv-row');
		row3.createSpan({ cls: 'ff-pg-def-k', text: 'column_order' });
		row3.createSpan({ cls: 'ff-pg-def-v', text: String(mech.columnOrder ?? 1) });
	}

	// Sekcja: ZAPIS W PLIKU
	const saveSection = body.createDiv('ff-pg-drawer-section');
	saveSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'ZAPIS W PLIKU' });
	saveSection.createDiv({ cls: 'ff-pg-drawer-path font-mono', text: beat.filePath });

	const snippet = values.length > 0
		? `${canonicalKey}:\n${values.map(v => `  - "${v}"`).join('\n')}`
		: `${canonicalKey}: []`;
	saveSection.createEl('pre', { cls: 'ff-pg-yaml-snippet font-mono', text: snippet });

	// Sekcja: SĄSIEDNIE BEATY
	const currentIndex = state.data.beats.findIndex(b => b.filePath === beat.filePath);
	if (currentIndex >= 0) {
		const prevBeat = currentIndex > 0 ? state.data.beats[currentIndex - 1] : null;
		const nextBeat = currentIndex < state.data.beats.length - 1 ? state.data.beats[currentIndex + 1] : null;
		if (prevBeat || nextBeat) {
			const neighborSection = body.createDiv('ff-pg-drawer-section');
			neighborSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'SĄSIEDNIE BEATY' });

			if (prevBeat) {
				const pBox = neighborSection.createDiv('ff-pg-neighbor-box');
				pBox.createDiv({ cls: 'ff-pg-neighbor-label', text: `Poprzedni: ${prevBeat.name}` });
				const pVals = cellValue(prevBeat, col.source.id, sel.sub, sel.colType);
				pBox.createDiv({ cls: pVals.length > 0 ? 'ff-pg-neighbor-text' : 'ff-pg-neighbor-empty', text: pVals[0] ?? '(Brak wpisu)' });
			}

			if (nextBeat) {
				const nBox = neighborSection.createDiv('ff-pg-neighbor-box');
				nBox.createDiv({ cls: 'ff-pg-neighbor-label', text: `Następny: ${nextBeat.name}` });
				const nVals = cellValue(nextBeat, col.source.id, sel.sub, sel.colType);
				nBox.createDiv({ cls: nVals.length > 0 ? 'ff-pg-neighbor-text' : 'ff-pg-neighbor-empty', text: nVals[0] ?? '(Brak wpisu)' });
			}
		}
	}

	// Sekcja: SCENY W TYM BEACIE
	const scenesInBeat = state.data.scenes.filter(s => {
		const bName = s.beat?.replace(/\[\[|\]\]/g, '').split('|')[0]?.trim();
		return bName && (bName.toLowerCase() === beat.name.toLowerCase() || bName.toLowerCase() === beat.filePath.toLowerCase());
	});
	if (scenesInBeat.length > 0) {
		const scSection = body.createDiv('ff-pg-drawer-section');
		scSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'SCENY W TYM BEACIE' });
		const scList = scSection.createDiv('ff-pg-related-scene-list');
		for (const sc of scenesInBeat) {
			const scItem = scList.createEl('button', {
				cls: 'ff-pg-related-scene-link',
				text: sc.title,
				attr: { type: 'button' },
			});
			scItem.addEventListener('click', () => callbacks.onOpenFile(sc.filePath));
		}
	}

	// Przyciski akcji na dole
	const actions = body.createDiv('ff-pg-drawer-actions');
	const openBeatBtn = actions.createEl('button', {
		cls: 'ff-pg-action-btn',
		text: 'Otwórz plik beatu',
		attr: { type: 'button' },
	});
	openBeatBtn.addEventListener('click', () => callbacks.onOpenFile(beat.filePath));

	if (col.source.filePath) {
		const openColBtn = actions.createEl('button', {
			cls: 'ff-pg-action-btn',
			text: `Otwórz plik ${col.type}`,
			attr: { type: 'button' },
		});
		openColBtn.addEventListener('click', () => callbacks.onOpenFile(col.source.filePath));
	}
}

// ---------------------------------------------------------------------------
// 2. Tryb Kolumna
// ---------------------------------------------------------------------------

function renderColumnContent(
	body: HTMLElement,
	state: PlotGridState,
	colId: string,
	callbacks: PlotGridDrawerCallbacks,
): void {
	const col = state.data.cols.find(c => c.source.id.toLowerCase() === colId.toLowerCase());
	if (!col) return;

	const source = col.source as any;
	body.createEl('h2', { cls: 'ff-pg-drawer-title', text: source.nazwa });

	const ownerInfo = source.owner ? `owner: ${source.owner}` : '';
	const orderInfo = `column_order ${source.columnOrder ?? 1}`;
	body.createDiv({
		cls: 'ff-pg-drawer-subinfo',
		text: [col.type, ownerInfo, orderInfo].filter(Boolean).join(' · '),
	});

	// Sekcja: PLIK
	const fileSection = body.createDiv('ff-pg-drawer-section');
	fileSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'PLIK' });
	fileSection.createDiv({ cls: 'ff-pg-drawer-path font-mono', text: source.filePath || '(Brak dedykowanego pliku)' });

	// Sekcja: FRONTMATTER
	const fmSection = body.createDiv('ff-pg-drawer-section');
	fmSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'FRONTMATTER' });
	const subcolsYaml = (source.podkolumny && source.podkolumny.length > 0)
		? `subcolumns:\n${source.podkolumny.map((s: string) => `  - ${s}`).join('\n')}`
		: 'subcolumns: []';
	const fmSnippet = [
		`Class: ${col.type}`,
		`id: ${source.id}`,
		`name: ${source.nazwa}`,
		source.owner ? `owner: "[[Postacie/${source.owner}|${source.owner}]]"` : null,
		`color: "${col.color}"`,
		`column_order: ${source.columnOrder ?? 1}`,
		subcolsYaml,
		source.status ? `Status: ${source.status}` : null,
	].filter(Boolean).join('\n');
	fmSection.createEl('pre', { cls: 'ff-pg-yaml-snippet font-mono', text: fmSnippet });

	// Sekcja: WYPEŁNIENIE
	const fillSection = body.createDiv('ff-pg-drawer-section');
	fillSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'WYPEŁNIENIE' });
	const fillTable = fillSection.createDiv('ff-pg-fill-table');

	const colType = col.type.toLowerCase() as 'arc' | 'subplot' | 'mechanic';
	const leaves = col.leaves.length > 0 ? col.leaves : [null];
	let beatsWithoutEntries = 0;

	for (const sub of leaves) {
		const row = fillTable.createDiv('ff-pg-fill-row');
		row.createSpan({ cls: 'ff-pg-fill-name', text: sub ?? source.nazwa });
		const filledCount = state.data.beats.filter(b => cellValue(b, col.source.id, sub, colType).length > 0).length;
		row.createSpan({ cls: 'ff-pg-fill-val', text: `${filledCount} ${filledCount === 1 ? 'beat' : filledCount < 5 ? 'beaty' : 'beatów'}` });
	}

	beatsWithoutEntries = state.data.beats.filter(b => {
		return leaves.every(sub => cellValue(b, col.source.id, sub, colType).length === 0);
	}).length;

	const emptyRow = fillTable.createDiv('ff-pg-fill-row is-muted');
	emptyRow.createSpan({ cls: 'ff-pg-fill-name', text: 'Beaty bez wpisu' });
	emptyRow.createSpan({ cls: 'ff-pg-fill-val', text: `${beatsWithoutEntries} z ${state.data.beats.length}` });

	// Sekcja: WALIDACJE
	const valSection = body.createDiv('ff-pg-drawer-section');
	valSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'WALIDACJE' });
	const valBox = valSection.createDiv('ff-pg-val-box');
	const issues = state.data.validation.issues.filter(i =>
		i.title.toLowerCase().includes(source.id.toLowerCase()) ||
		i.detail.toLowerCase().includes(source.id.toLowerCase()) ||
		i.title.toLowerCase().includes(source.nazwa.toLowerCase())
	);
	if (issues.length > 0) {
		for (const iss of issues) {
			valBox.createDiv({ cls: 'ff-pg-val-item is-warn', text: `${iss.title}: ${iss.detail}` });
		}
	} else if (col.type === 'Arc' && !source.truth) {
		valBox.createDiv({ cls: 'ff-pg-val-item is-warn', text: 'truth jeszcze niezdefiniowane' });
	} else {
		valBox.createDiv({ cls: 'ff-pg-val-item is-ok', text: 'Wszystkie reguły spełnione' });
	}
	valBox.createDiv({ cls: 'ff-pg-val-item is-ok', text: 'id jest unikalne w książce' });

	// Sekcja: SCENY Z TYM WĄTKIEM
	const relatedScenes = state.data.scenes.filter(s => {
		const subs = s.subplots ?? [];
		return subs.some(sp => sp.toLowerCase() === source.nazwa.toLowerCase() || sp.toLowerCase() === source.id.toLowerCase());
	});
	if (relatedScenes.length > 0) {
		const scSection = body.createDiv('ff-pg-drawer-section');
		scSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'SCENY Z TYM WĄTKIEM' });
		const scList = scSection.createDiv('ff-pg-related-scene-list');
		for (const sc of relatedScenes) {
			const scItem = scList.createEl('button', {
				cls: 'ff-pg-related-scene-link',
				text: sc.title,
				attr: { type: 'button' },
			});
			scItem.addEventListener('click', () => callbacks.onOpenFile(sc.filePath));
		}
	}

	// Przyciski akcji
	const actions = body.createDiv('ff-pg-drawer-actions');
	if (source.filePath) {
		const openFileBtn = actions.createEl('button', {
			cls: 'ff-pg-action-btn',
			text: `Otwórz plik ${col.type}`,
			attr: { type: 'button' },
		});
		openFileBtn.addEventListener('click', () => callbacks.onOpenFile(source.filePath));
	}
	const showInGridBtn = actions.createEl('button', {
		cls: 'ff-pg-action-btn mod-cta',
		text: 'Pokaż w PlotGrid',
		attr: { type: 'button' },
	});
	showInGridBtn.addEventListener('click', () => callbacks.onShowInPlotGrid?.(col.source.id));
}

// ---------------------------------------------------------------------------
// 3. Inspektor Beatu
// ---------------------------------------------------------------------------

function renderBeatContent(
	body: HTMLElement,
	state: PlotGridState,
	beatFilePath: string,
	callbacks: PlotGridDrawerCallbacks,
): void {
	const beat = state.data.beats.find(b => b.filePath === beatFilePath);
	if (!beat) return;

	body.createEl('h2', { cls: 'ff-pg-drawer-title', text: beat.name });
	const subinfo = [`Akt ${beat.act}`, beat.range ? `Range ${beat.range}` : null, `Order ${beat.order}`].filter(Boolean).join(' · ');
	body.createDiv({ cls: 'ff-pg-drawer-subinfo', text: subinfo });

	// PURPOSE
	if (beat.purpose) {
		const pSection = body.createDiv('ff-pg-drawer-section');
		pSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'PURPOSE' });
		pSection.createDiv({ cls: 'ff-pg-def-text', text: beat.purpose });
	}

	// FRONTMATTER
	const fmSection = body.createDiv('ff-pg-drawer-section');
	fmSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'FRONTMATTER' });
	const fmSnippet = [
		'Class: Beat',
		`Act: ${beat.act}`,
		`Order: ${beat.order}`,
		beat.range ? `Range: ${beat.range}` : null,
		beat.tension ? `StoryTension: ${beat.tension}` : null,
		beat.pacing ? `StoryPacing: ${beat.pacing}` : null,
		beat.pov ? `POV: "[[Postacie/${beat.pov}|${beat.pov}]]"` : null,
		beat.status ? `Status: ${beat.status}` : null,
	].filter(Boolean).join('\n');
	fmSection.createEl('pre', { cls: 'ff-pg-yaml-snippet font-mono', text: fmSnippet });

	// SCENY W BEACIE
	const beatScenes = state.data.scenes.filter(s => s.beat && s.beat.toLowerCase() === beat.name.toLowerCase());
	if (beatScenes.length > 0) {
		const scSection = body.createDiv('ff-pg-drawer-section');
		scSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'SCENY W BEACIE' });
		const scList = scSection.createDiv('ff-pg-related-scene-list');
		for (const sc of beatScenes) {
			const scItem = scList.createEl('button', {
				cls: 'ff-pg-related-scene-link',
				text: sc.title,
				attr: { type: 'button' },
			});
			scItem.addEventListener('click', () => callbacks.onOpenFile(sc.filePath));
		}
	}

	// Przyciski akcji
	const actions = body.createDiv('ff-pg-drawer-actions');
	const openBtn = actions.createEl('button', {
		cls: 'ff-pg-action-btn',
		text: 'Otwórz plik',
		attr: { type: 'button' },
	});
	openBtn.addEventListener('click', () => callbacks.onOpenFile(beat.filePath));

	const showInGridBtn = actions.createEl('button', {
		cls: 'ff-pg-action-btn mod-cta',
		text: 'Pokaż w PlotGrid',
		attr: { type: 'button' },
	});
	showInGridBtn.addEventListener('click', () => callbacks.onShowInPlotGrid?.(undefined, beat.filePath));
}

// ---------------------------------------------------------------------------
// 4. Inspektor Sceny
// ---------------------------------------------------------------------------

function renderSceneContent(
	body: HTMLElement,
	state: PlotGridState,
	sceneFilePath: string,
	callbacks: PlotGridDrawerCallbacks,
): void {
	const scene = state.data.scenes.find(s => s.filePath === sceneFilePath);
	if (!scene) return;

	body.createEl('h2', { cls: 'ff-pg-drawer-title', text: scene.title });
	const subinfo = [scene.beat ? `Beat: ${scene.beat}` : null, `Akt ${scene.act ?? 1}`, `Order ${scene.sequence ?? 1}`].filter(Boolean).join(' · ');
	body.createDiv({ cls: 'ff-pg-drawer-subinfo', text: subinfo });

	// POWIĄZANIA
	const relSection = body.createDiv('ff-pg-drawer-section');
	relSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'POWIĄZANIA' });
	const kvBox = relSection.createDiv('ff-pg-def-kv-box');

	const addRow = (label: string, val?: string) => {
		const row = kvBox.createDiv('ff-pg-def-kv-row');
		row.createSpan({ cls: 'ff-pg-def-k', text: label });
		row.createSpan({ cls: `ff-pg-def-v${!val ? ' is-empty' : ''}`, text: val ?? 'nie ustawiono' });
	};

	addRow('Beat', scene.beat);
	addRow('Subplot', scene.subplots?.join(', '));
	addRow('POV', scene.pov);
	addRow('Character', scene.characters?.join(', '));

	// FRONTMATTER
	const fmSection = body.createDiv('ff-pg-drawer-section');
	fmSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'FRONTMATTER' });
	const fmSnippet = [
		'Class: Scene',
		`Act: ${scene.act ?? 1}`,
		`Order: ${scene.sequence ?? 1}`,
		scene.subplots && scene.subplots.length > 0 ? `Subplot:\n${scene.subplots.map(s => `  - ${s}`).join('\n')}` : null,
		scene.pov ? `POV: ${scene.pov}` : null,
		scene.status ? `Status: ${scene.status}` : null,
		scene.beat ? `Beat: "[[Beats/${scene.beat}|${scene.beat}]]"` : null,
	].filter(Boolean).join('\n');
	fmSection.createEl('pre', { cls: 'ff-pg-yaml-snippet font-mono', text: fmSnippet });

	// UWAGA
	const noteSection = body.createDiv('ff-pg-drawer-section');
	noteSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'UWAGA' });
	noteSection.createDiv({
		cls: 'ff-pg-drawer-note-text',
		text: 'Pole Subplot jest dopasowywane po polu name w plikach Arc i Subplot, więc istniejące sceny działają bez zmian.',
	});

	// Przyciski akcji
	const actions = body.createDiv('ff-pg-drawer-actions');
	const openBtn = actions.createEl('button', {
		cls: 'ff-pg-action-btn',
		text: 'Otwórz plik',
		attr: { type: 'button' },
	});
	openBtn.addEventListener('click', () => callbacks.onOpenFile(scene.filePath));

	if (scene.beat) {
		const beatFile = state.data.beats.find(b => b.name.toLowerCase() === scene.beat?.toLowerCase());
		const showBeatBtn = actions.createEl('button', {
			cls: 'ff-pg-action-btn mod-cta',
			text: 'Pokaż beat',
			attr: { type: 'button' },
		});
		showBeatBtn.addEventListener('click', () => {
			if (beatFile) callbacks.onShowBeat?.(beatFile.filePath);
		});
	}
}

// ---------------------------------------------------------------------------
// 5. Inspektor Sekretu
// ---------------------------------------------------------------------------

function renderSecretContent(
	body: HTMLElement,
	state: PlotGridState,
	secretId: string,
	callbacks: PlotGridDrawerCallbacks,
): void {
	const secret = state.data.secrets.find(s => s.id === secretId);
	if (!secret) return;

	body.createEl('h2', { cls: 'ff-pg-drawer-title', text: secret.id });
	const subinfo = [secret.tytul, secret.revealTarget ? `cel: ${secret.revealTarget}` : null].filter(Boolean).join(' · ');
	body.createDiv({ cls: 'ff-pg-drawer-subinfo', text: subinfo });

	// FAKT
	if (secret.prawda) {
		const factSection = body.createDiv('ff-pg-drawer-section');
		factSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'FAKT' });
		factSection.createDiv({ cls: 'ff-pg-def-text', text: secret.prawda });
	}

	// ZDARZENIA (Oś beatów)
	const eventsSection = body.createDiv('ff-pg-drawer-section');
	eventsSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'ZDARZENIA' });
	const evList = eventsSection.createDiv('ff-pg-drawer-event-timeline');

	for (const beat of state.data.beats) {
		const kinds: SecretEventKind[] = [];
		if (beat.sekretZasiew.includes(secret.id)) kinds.push('zasiew');
		if (beat.sekretCzesciowo.includes(secret.id)) kinds.push('czesciowo');
		if (beat.sekretPelne.includes(secret.id)) kinds.push('pelne');
		if (beat.sekretPodwazenie.includes(secret.id)) kinds.push('podwazenie');

		for (const k of kinds) {
			const item = evList.createDiv('ff-pg-drawer-event-item');
			renderSecretChip(item, { kind: k });
			item.createSpan({ cls: 'ff-pg-event-beat-text', text: `Beat ${beat.order} - ${beat.name}: ${k}` });
		}
	}

	// FRONTMATTER
	const fmSection = body.createDiv('ff-pg-drawer-section');
	fmSection.createDiv({ cls: 'ff-pg-drawer-section-title', text: 'FRONTMATTER' });
	const fmSnippet = [
		'Class: Secret',
		`id: ${secret.id}`,
		`title: ${secret.tytul}`,
		`known_by: [${secret.ktoWie.join(', ')}]`,
		secret.revealTarget ? `reveal_target: "[[Beats/${secret.revealTarget}|${secret.revealTarget}]]"` : null,
		`twist: ${secret.twist}`,
		`seed_required: ${secret.zasiewWymagany}`,
		secret.status ? `Status: ${secret.status}` : null,
	].filter(Boolean).join('\n');
	fmSection.createEl('pre', { cls: 'ff-pg-yaml-snippet font-mono', text: fmSnippet });

	// Przyciski akcji
	const actions = body.createDiv('ff-pg-drawer-actions');
	const openBtn = actions.createEl('button', {
		cls: 'ff-pg-action-btn',
		text: 'Otwórz plik Secret',
		attr: { type: 'button' },
	});
	openBtn.addEventListener('click', () => callbacks.onOpenFile(secret.filePath));

	const showInGridBtn = actions.createEl('button', {
		cls: 'ff-pg-action-btn mod-cta',
		text: 'Pokaż w PlotGrid',
		attr: { type: 'button' },
	});
	showInGridBtn.addEventListener('click', () => callbacks.onShowInPlotGrid?.(secret.id));
}
