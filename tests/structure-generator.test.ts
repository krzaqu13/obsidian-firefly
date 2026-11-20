import test from 'node:test';
import assert from 'node:assert/strict';

import { StructureManager } from '../src/services/StructureManager.ts';
import { SANDERSON_9_DEFAULT } from '../src/models/StructurePresets.ts';

const manager = new StructureManager({
	settings: {
		defaultArea: 'writing',
		projectStructure: {
			profiles: [SANDERSON_9_DEFAULT],
			activeProfileId: SANDERSON_9_DEFAULT.id,
			storageMode: 'manifest',
		},
	},
} as any);

test('buildPlan creates expected folders and beat files', () => {
	const plan = manager.buildPlan(SANDERSON_9_DEFAULT, 'Nowa książka', ['Protagonista', 'Antagonista']);
	assert.ok(plan.some(item => item.path.endsWith('/Beaty')));
	assert.ok(plan.some(item => item.path.includes('/Beaty/01 Haczyk.md')));
	assert.ok(plan.some(item => item.kind === 'arc' && item.name === 'Arc - Protagonista'));
	assert.ok(plan.some(item => item.kind === 'arc' && item.name === 'Arc - Antagonista'));
});

test('buildPlan uses active project root folder when provided', () => {
	const plan = manager.buildPlan(
		SANDERSON_9_DEFAULT,
		'Nowa książka',
		['Protagonista', 'Antagonista'],
		'Projekt/Nowa książka',
	);
	assert.ok(plan.some(item => item.path.startsWith('Projekt/Nowa książka/Beaty')));
	assert.ok(plan.some(item => item.path.startsWith('Projekt/Nowa książka/Arci/Arc - Protagonista.md')));
});

test('normalizeName strips invalid characters and mixed scripts are detected', () => {
	assert.equal(StructureManager.normalizeName('  Nowa książka  '), 'Nowa książka');
	assert.equal(StructureManager.detectMixedScripts('Merharinа'), true);
});
