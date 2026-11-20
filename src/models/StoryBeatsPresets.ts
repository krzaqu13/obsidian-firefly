import type { BeatDefinition, BeatLibraryItem, LoadedBeatTab, StoryBeatsSettings } from './StoryBeats';

export const BLANK_CUSTOM_BEATS: BeatDefinition[] = [
	{ name: 'Kapitan', act: 1, purpose: 'Wprowadzenie protagonisty i status quo.' },
	{ name: 'Ostatnia kropla', act: 1, purpose: 'Incydent inicjujący, który burzy równowagę.' },
	{ name: 'Odrzucenie', act: 1, purpose: 'Wahanie, próba uniknięcia nieuchronnego powołania.' },
	{ name: 'Organizacja', act: 1, purpose: 'Zgromadzenie zasobów, sojuszników lub planu.' },
	{ name: 'Między młotem a kowadłem', act: 1, purpose: 'Przekroczenie progu aktu pierwszego i punkt bez powrotu.' },
	{ name: 'Pęknięcia', act: 2, purpose: 'Pierwsze rysy na początkowym planie i wzrost presji.' },
	{ name: 'Człowiek który przeżył', act: 2, purpose: 'Konfrontacja z przeszłością lub poprzednią ofiarą.' },
	{ name: 'Lustro', act: 2, purpose: 'Punkt centralny (midpoint) – prawda wychodzi na jaw.' },
	{ name: 'Który z nas miał rację', act: 2, purpose: 'Rozłam w zespole, konflikt wartości i wątpliwości.' },
	{ name: 'Z wyboru', act: 2, purpose: 'Kryzys, wszystko stracone, świadoma decyzja o dalszej walce.' },
	{ name: 'Wszystkie fragmenty', act: 3, purpose: 'Synteza wiedzy i przygotowanie do ostatecznego starcia.' },
	{ name: 'Bez dobrego wyjścia', act: 3, purpose: 'Kulminacja – poświęcenie i nieodwracalny wybór.' },
	{ name: 'Choć cień nadziei', act: 3, purpose: 'Rozwiązanie, nowy porządek świata i powrót odmienionego bohatera.' },
];

export const BLANK_CUSTOM_DESC = `Starts empty so you can design your own structure from scratch.

Use it when none of the library lenses match your process or you want a project-specific model.

Best for: custom beat design, experimentation, hybrid structures, teaching your own method
Momentum profile: author-defined

Start with at least 3 beats. Name each beat by function, not theme. Use a clear progression such as opening → pressure → shift. Add or reorder beats only when each one serves a distinct structural purpose.`;

export const HEROS_JOURNEY_BEATS: BeatDefinition[] = [
	{ name: 'Ordinary World', act: 1, purpose: 'The hero\'s normal life before the adventure begins.' },
	{ name: 'Call to Adventure', act: 1, purpose: 'Something disrupts the ordinary world and beckons the hero.' },
	{ name: 'Refusal of the Call', act: 1, purpose: 'The hero hesitates or declines out of fear or obligation.' },
	{ name: 'Meeting the Mentor', act: 1, purpose: 'Guidance, advice, or magical gifts prepare the hero.' },
	{ name: 'Crossing the Threshold', act: 1, purpose: 'The hero commits to the journey and enters the unknown special world.' },
	{ name: 'Tests, Allies, Enemies', act: 2, purpose: 'Challenges, alliances, and learning the rules of the new world.' },
	{ name: 'Approach to the Inmost Cave', act: 2, purpose: 'Preparation for the central ordeal in the dangerous heart.' },
	{ name: 'Ordeal', act: 2, purpose: 'The supreme test: facing greatest fear, death and rebirth.' },
	{ name: 'Reward (Seizing the Sword)', act: 2, purpose: 'The hero claims the prize or insight earned from the ordeal.' },
	{ name: 'The Road Back', act: 2, purpose: 'Urgency to complete journey and bring treasure home while pursued.' },
	{ name: 'Resurrection', act: 3, purpose: 'The final decisive exam; the hero applies all lessons learned.' },
	{ name: 'Return with the Elixir', act: 3, purpose: 'Returning to the ordinary world transformed, with aid for others.' },
];

export const HEROS_JOURNEY_DESC = `Tracks departure, transformation, ordeal, and return.

Use it when you want a mythic or identity-driven arc with visible inner and outer transformation.

Best for: quest stories, speculative fiction, coming-of-age, transformational journeys
Momentum profile: departure → trials → ordeal → return with change`;

export const SAVE_THE_CAT_BEATS: BeatDefinition[] = [
	{ name: 'Opening Image', act: 1, purpose: 'Snapshot of the protagonist\'s world before the journey begins.' },
	{ name: 'Theme Stated', act: 1, purpose: 'Thematic argument hinted by a secondary character or event.' },
	{ name: 'Setup', act: 1, purpose: 'Exploration of daily flaws, relationships, and status quo.' },
	{ name: 'Catalyst', act: 1, purpose: 'Inciting incident that knocks the world off balance.' },
	{ name: 'Debate', act: 1, purpose: 'Hesitation, deliberation, and doubt before taking the leap.' },
	{ name: 'Break into Two', act: 2, purpose: 'Crossing into Act Two with a decisive proactive choice.' },
	{ name: 'B Story', act: 2, purpose: 'Subplot / love interest that carries the emotional and thematic truth.' },
	{ name: 'Fun and Games', act: 2, purpose: 'The core premise delivered: exploring the new reality.' },
	{ name: 'Midpoint', act: 2, purpose: 'Turning point: false victory or false defeat; ticking clock begins.' },
	{ name: 'Bad Guys Close In', act: 2, purpose: 'External pressure mounts; internal doubts fracture unity.' },
	{ name: 'All Is Lost', act: 2, purpose: 'The lowest point; the whiff of death; hope seems impossible.' },
	{ name: 'Dark Night of the Soul', act: 2, purpose: 'Grief, processing defeat, and uncovering true enlightenment.' },
	{ name: 'Break into Three', act: 2, purpose: 'New synthesis of A and B story yields a final plan.' },
	{ name: 'Finale', act: 3, purpose: 'Climax: old habits discarded, lessons applied to defeat the antagonist.' },
	{ name: 'Final Image', act: 3, purpose: 'Mirror to Opening Image showing profound transformation.' },
];

export const SAVE_THE_CAT_DESC = `Emphasizes clear emotional beats and audience engagement.

Use it when you want clean turning points, visible reversals, and a strong sense of audience-facing momentum from setup through finale.

Best for: commercial fiction, screenplays, high-concept genre
Momentum profile: setup → midpoint turn → closing payoff`;

export const CLASSIC_DRAMATIC_BEATS: BeatDefinition[] = [
	{ name: 'Setup', act: 1, purpose: 'Disruption of the status quo and definition of the central stakes.' },
	{ name: 'Complication', act: 2, purpose: 'Escalating obstacles narrowing the protagonist\'s choices.' },
	{ name: 'Pressure', act: 2, purpose: 'Peak tension forcing a difficult dilemma with no easy exit.' },
	{ name: 'Pivotal Choice', act: 3, purpose: 'An irreversible choice answering the central dramatic question.' },
	{ name: 'Outcome', act: 3, purpose: 'The permanent consequence, costs, and thematic conclusion.' },
];

export const CLASSIC_DRAMATIC_DESC = `Emphasizes scene pressure, turning points, pivotal choices, and consequential outcomes.

Use it when you want to stress-test whether each scene creates movement through conflict and change.

Best for: literary fiction, drama, tightly edited scene work, revision passes
Momentum profile: setup → complication → pressure → pivotal choice → outcome`;

export const STORY_CIRCLE_BEATS: BeatDefinition[] = [
	{ name: '1. You', act: 1, purpose: 'A character is in a zone of comfort.' },
	{ name: '2. Need', act: 1, purpose: 'But they want or need something.' },
	{ name: '3. Go', act: 1, purpose: 'They enter an unfamiliar situation.' },
	{ name: '4. Search', act: 2, purpose: 'They adapt to it and face trials.' },
	{ name: '5. Find', act: 2, purpose: 'They find what they wanted.' },
	{ name: '6. Take', act: 2, purpose: 'They pay a heavy price for it.' },
	{ name: '7. Return', act: 3, purpose: 'They go back to where they started.' },
	{ name: '8. Change', act: 3, purpose: 'Having changed fundamentally.' },
];

export const STORY_CIRCLE_DESC = `Dan Harmon's simplified 8-stage monomyth cycle.

Focuses on cyclic protagonist need, transgression, acquisition, payment, and transformation.

Best for: episodic storytelling, tight character arcs, modern screenwriting
Momentum profile: comfort → hunger → plunge → adaptation → cost → changed return`;

export const PODCAST_NARRATIVE_BEATS: BeatDefinition[] = [
	{ name: 'Cold Open', act: 1, purpose: 'A vivid moment hooks curiosity and promises a payoff.' },
	{ name: 'Framing Question', act: 1, purpose: 'States the core mystery or argument in human terms.' },
	{ name: 'Context Setup', act: 1, purpose: 'Background arrives to make the stakes legible.' },
	{ name: 'First Lead', act: 2, purpose: 'Investigation starts with a concrete lead.' },
	{ name: 'Complication', act: 2, purpose: 'A contradiction appears and simple theories break.' },
	{ name: 'Deep Dive', act: 2, purpose: 'Interviews and evidence expand the world.' },
	{ name: 'Midpoint Revelation', act: 2, purpose: 'A key fact flips listener understanding.' },
	{ name: 'Major Obstacle', act: 2, purpose: 'Sources go quiet or access is blocked.' },
	{ name: 'Turning Point', act: 3, purpose: 'A new approach opens the resolution.' },
	{ name: 'Climax Insight', act: 3, purpose: 'Central discovery or reckoning delivered.' },
	{ name: 'Reflection', act: 3, purpose: 'Host interprets meaning honestly.' },
	{ name: 'Closing Resonance', act: 3, purpose: 'Final echo that lingers with the listener.' },
];

export const PODCAST_NARRATIVE_DESC = `Shapes spoken storytelling around hook, setup, development, and payoff.

Use it when you want strong listener retention and clean verbal progression.

Best for: narrative podcasts, investigative journalism, audio essays
Momentum profile: hook → framing → development → payoff`;

export const ALL_LIBRARY_ITEMS: BeatLibraryItem[] = [
	{
		id: 'blank',
		kind: 'blank',
		category: 'blank',
		icon: 'square',
		name: 'Blank custom',
		description: BLANK_CUSTOM_DESC,
		beats: BLANK_CUSTOM_BEATS,
		config: {
			beatYamlAdvanced: 'status: draft\npov:\nlocation:\nconflict:',
		},
	},
	{
		id: 'heros_journey',
		kind: 'builtin',
		category: 'narrative',
		icon: 'route',
		name: "Hero's Journey",
		description: HEROS_JOURNEY_DESC,
		beats: HEROS_JOURNEY_BEATS,
		config: {
			beatYamlAdvanced: 'archetype:\nthreshold:\nmentor_influence:',
		},
	},
	{
		id: 'save_the_cat',
		kind: 'builtin',
		category: 'narrative',
		icon: 'paw-print',
		name: 'Save The Cat',
		description: SAVE_THE_CAT_DESC,
		beats: SAVE_THE_CAT_BEATS,
		config: {
			beatYamlAdvanced: 'beat_type:\nemotional_charge: +/-\nstakes:',
		},
	},
	{
		id: 'classic_dramatic',
		kind: 'builtin',
		category: 'narrative',
		icon: 'zap',
		name: 'Classic Dramatic Structure',
		description: CLASSIC_DRAMATIC_DESC,
		beats: CLASSIC_DRAMATIC_BEATS,
		config: {
			beatYamlAdvanced: 'dramatic_tension:\npivotal_action:',
		},
	},
	{
		id: 'story_circle',
		kind: 'builtin',
		category: 'narrative',
		icon: 'circle-dot',
		name: "Dan Harmon's Story Circle",
		description: STORY_CIRCLE_DESC,
		beats: STORY_CIRCLE_BEATS,
		config: {
			beatYamlAdvanced: 'internal_need:\nprice_paid:\ntransformation:',
		},
	},
	{
		id: 'podcast_narrative',
		kind: 'starter',
		category: 'format',
		icon: 'mic',
		name: 'Podcast Narrative Arc',
		description: PODCAST_NARRATIVE_DESC,
		beats: PODCAST_NARRATIVE_BEATS,
		config: {
			beatYamlAdvanced: 'segment_type:\nemotional_intensity:\ncliffhanger:',
		},
	},
];

export function createDefaultStoryBeatsSettings(): StoryBeatsSettings {
	const blankTab: LoadedBeatTab = {
		tabId: 'tab_blank_custom',
		sourceKind: 'blank',
		sourceId: 'blank',
		name: 'Blank custom',
		description: BLANK_CUSTOM_DESC,
		beats: JSON.parse(JSON.stringify(BLANK_CUSTOM_BEATS)),
		config: {
			beatYamlAdvanced: 'status: draft\npov:\nlocation:\nconflict:',
		},
	};

	const herosJourneyTab: LoadedBeatTab = {
		tabId: 'tab_heros_journey',
		sourceKind: 'builtin',
		sourceId: 'heros_journey',
		name: "Hero's Journey",
		description: HEROS_JOURNEY_DESC,
		beats: JSON.parse(JSON.stringify(HEROS_JOURNEY_BEATS)),
		config: {
			beatYamlAdvanced: 'archetype:\nthreshold:\nmentor_influence:',
		},
	};

	return {
		loadedTabs: [blankTab, herosJourneyTab],
		activeTabId: blankTab.tabId,
		actCount: 3,
	};
}
