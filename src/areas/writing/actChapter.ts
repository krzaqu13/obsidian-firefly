export type ActChapterValue = number | string | undefined | null;

export const PROLOGUE_ACT = 0;
export const EPILOGUE_ACT = 99;

export function isPrologueAct(act: ActChapterValue): boolean {
	if (act === undefined || act === null) return false;
	if (act === PROLOGUE_ACT || act === '0') return true;
	return typeof act === 'string' && act.trim().toLowerCase() === 'prologue';
}

export function isEpilogueAct(act: ActChapterValue): boolean {
	if (act === undefined || act === null) return false;
	if (act === EPILOGUE_ACT || act === '99') return true;
	return typeof act === 'string' && act.trim().toLowerCase() === 'epilogue';
}

export function isPureNumericActChapter(value: ActChapterValue): boolean {
	if (value === undefined || value === null) return false;
	if (typeof value === 'number') return Number.isFinite(value);
	const s = String(value).trim();
	if (s === '') return false;
	return /^-?\d+(\.\d+)?$/.test(s);
}

export function toActChapterNumber(value: ActChapterValue): number {
	if (value === undefined || value === null) return NaN;
	if (typeof value === 'string') {
		const trimmed = value.trim().toLowerCase();
		if (trimmed === 'prologue') return PROLOGUE_ACT;
		if (trimmed === 'epilogue') return EPILOGUE_ACT;
	}
	if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
	return isPureNumericActChapter(value) ? Number(value) : NaN;
}

export function getActDisplayLabel(act: ActChapterValue): string {
	if (isPrologueAct(act)) return 'Prolog';
	if (isEpilogueAct(act)) return 'Epilog';
	if (act === undefined || act === null || act === '') return '';
	const n = toActChapterNumber(act);
	if (!isNaN(n) && n >= 1 && n <= 98) return `Akt ${n}`;
	return String(act);
}

export function compareActChapter(a: ActChapterValue, b: ActChapterValue): number {
	const aMissing = a === undefined || a === null || a === '';
	const bMissing = b === undefined || b === null || b === '';
	if (aMissing && bMissing) return 0;
	if (aMissing) return 1;
	if (bMissing) return -1;

	const aNum = isPureNumericActChapter(a);
	const bNum = isPureNumericActChapter(b);

	if (aNum && bNum) {
		return Number(a as number | string) - Number(b as number | string);
	}

	return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function compareScenesByActChapter<T extends { act?: ActChapterValue; chapter?: ActChapterValue }>(
	a: T,
	b: T,
	tiebreaker?: (a: T, b: T) => number,
): number {
	const actCmp = compareActChapter(a.act, b.act);
	if (actCmp !== 0) return actCmp;
	const chCmp = compareActChapter(a.chapter, b.chapter);
	if (chCmp !== 0) return chCmp;
	return tiebreaker ? tiebreaker(a, b) : 0;
}
