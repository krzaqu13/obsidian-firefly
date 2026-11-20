import type { BeatDefinition } from './StoryBeats';

export interface FireflyProject {
	id: string;           // unikalny slug, np. "shadows-and-elements"
	title: string;        // wyświetlana nazwa
	filePath: string;     // ścieżka do pliku .md projektu w vaulcie
	icon?: string;        // opcjonalna ikona (emoji lub lucide name)
	color?: string;       // opcjonalny kolor akcentu
	rootFolder?: string;  // folder scen tego projektu
	structureProfileId?: string; // profil fabuły przypisany do tego projektu
	beatModelName?: string; // nazwa wykrytego lub własnego modelu z atrybutu 'Beat Model'
	customBeats?: BeatDefinition[]; // definicje beatów dla Blank Custom
	createdAt?: number;   // timestamp
}

export interface ProjectsData {
	projects: FireflyProject[];
	activeProjectId: string | null;
}
