import { setIcon, setTooltip, Notice } from 'obsidian';
import type FireflyPlugin from '../main';
import type { BeatDefinition, LoadedBeatTab, BeatLibraryItem } from '../models/StoryBeats';
import { ALL_LIBRARY_ITEMS, createDefaultStoryBeatsSettings } from '../models/StoryBeatsPresets';

export type BeatStage = 'preview' | 'design' | 'fields' | 'library';

export class StoryBeatsSettingSection {
	private plugin: FireflyPlugin;
	private containerEl: HTMLElement;
	private currentStage: BeatStage = 'preview';

	constructor(containerEl: HTMLElement, plugin: FireflyPlugin) {
		this.containerEl = containerEl;
		this.plugin = plugin;
		this.ensureSettings();
	}

	private ensureSettings(): void {
		if (!this.plugin.settings.storyBeats || !this.plugin.settings.storyBeats.loadedTabs?.length) {
			this.plugin.settings.storyBeats = createDefaultStoryBeatsSettings();
			void this.plugin.saveSettings();
		}
	}

	private get activeTab(): LoadedBeatTab | undefined {
		const storyBeats = this.plugin.settings.storyBeats;
		if (!storyBeats || !storyBeats.loadedTabs.length) return undefined;
		const found = storyBeats.loadedTabs.find(t => t.tabId === storyBeats.activeTabId);
		return found || storyBeats.loadedTabs[0];
	}

	public render(): void {
		this.containerEl.empty();
		this.ensureSettings();

		const sectionEl = this.containerEl.createDiv({ cls: 'firefly-beat-system-section' });

		// 1. Heading row
		const headingRow = sectionEl.createDiv({ cls: 'firefly-beat-heading-row' });
		const titleWrap = headingRow.createDiv({ cls: 'firefly-beat-heading-left' });
		const iconEl = titleWrap.createSpan({ cls: 'firefly-beat-heading-icon' });
		setIcon(iconEl, 'activity');

		const headingTitle = titleWrap.createSpan({ cls: 'firefly-beat-heading-title', text: 'Story beats system' });
		const linkEl = titleWrap.createSpan({ cls: 'firefly-beat-heading-link' });
		setIcon(linkEl, 'external-link');
		setTooltip(linkEl, 'Struktura fabularna i rytm narracyjny');

		// 2. Tabs + Card wrapper
		const wrapper = sectionEl.createDiv({ cls: 'firefly-beat-wrapper' });

		// Tab bar
		this.renderTabBar(wrapper);

		// Card panel
		const cardEl = wrapper.createDiv({ cls: 'firefly-beat-card' });
		if (this.currentStage === 'library') {
			this.renderLibrary(cardEl);
		} else {
			this.renderSystemCard(cardEl);
		}
	}

	private renderTabBar(parent: HTMLElement): void {
		const tabBar = parent.createDiv({ cls: 'firefly-beat-mini-tabs' });
		const storyBeats = this.plugin.settings.storyBeats!;
		const activeTab = this.activeTab;

		storyBeats.loadedTabs.forEach((tab) => {
			const isActive = this.currentStage !== 'library' && tab.tabId === activeTab?.tabId;
			const tabBtn = tabBar.createEl('button', {
				cls: `firefly-beat-mini-tab${isActive ? ' is-active' : ''}`,
				attr: { type: 'button' }
			});

			const tabIcon = tabBtn.createSpan({ cls: 'firefly-beat-mini-tab-icon' });
			setIcon(tabIcon, 'circle-dashed');

			tabBtn.createSpan({ cls: 'firefly-beat-mini-tab-label', text: tab.name });

			// Close button
			const closeBtn = tabBtn.createSpan({ cls: 'firefly-beat-mini-tab-close' });
			setIcon(closeBtn, 'x');
			setTooltip(closeBtn, `Usuń "${tab.name}"`);
			closeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.removeTab(tab.tabId);
			});

			tabBtn.addEventListener('click', () => {
				storyBeats.activeTabId = tab.tabId;
				if (this.currentStage === 'library') {
					this.currentStage = 'preview';
				}
				void this.plugin.saveSettings();
				this.render();
			});
		});

		// "+ Add system" tab button
		const addBtn = tabBar.createEl('button', {
			cls: `firefly-beat-mini-tab firefly-beat-add-tab${this.currentStage === 'library' ? ' is-active' : ''}`,
			attr: { type: 'button' }
		});
		const addIcon = addBtn.createSpan({ cls: 'firefly-beat-mini-tab-icon' });
		setIcon(addIcon, 'plus');
		addBtn.createSpan({ text: '+ Add system' });

		addBtn.addEventListener('click', () => {
			this.currentStage = 'library';
			this.render();
		});
	}

	private removeTab(tabId: string): void {
		const storyBeats = this.plugin.settings.storyBeats!;
		if (storyBeats.loadedTabs.length <= 1) {
			new Notice('Musi pozostać przynajmniej jeden system.');
			return;
		}
		const removedIndex = storyBeats.loadedTabs.findIndex(t => t.tabId === tabId);
		storyBeats.loadedTabs = storyBeats.loadedTabs.filter(t => t.tabId !== tabId);
		if (storyBeats.activeTabId === tabId) {
			const nextTab = storyBeats.loadedTabs[Math.max(0, removedIndex - 1)];
			storyBeats.activeTabId = nextTab?.tabId;
		}
		void this.plugin.saveSettings();
		this.render();
	}

	private renderSystemCard(cardEl: HTMLElement): void {
		const activeTab = this.activeTab;
		if (!activeTab) return;

		const totalBeats = activeTab.beats.length;
		const actNumbers = new Set(activeTab.beats.map(b => Number(b.act) || 1));
		const totalActs = Math.max(3, actNumbers.size, ...Array.from(actNumbers));

		// System header / description block
		const headerBlock = cardEl.createDiv({ cls: 'firefly-beat-card-header' });

		const titleRow = headerBlock.createDiv({ cls: 'firefly-beat-title-row' });
		const titleEl = titleRow.createEl('h3', { cls: 'firefly-beat-card-title', text: activeTab.name });
		
		// If custom, allow inline rename
		if (activeTab.sourceKind === 'blank' || activeTab.sourceKind === 'saved') {
			titleEl.addClass('is-editable');
			setTooltip(titleEl, 'Kliknij, aby zmienić nazwę systemu');
			titleEl.addEventListener('click', () => {
				const newName = prompt('Nowa nazwa systemu beatów:', activeTab.name);
				if (newName && newName.trim()) {
					activeTab.name = newName.trim();
					void this.plugin.saveSettings();
					this.render();
				}
			});
		}

		if (activeTab.description) {
			const descEl = headerBlock.createDiv({ cls: 'firefly-beat-card-desc' });
			const paragraphs = activeTab.description.split('\n\n');
			paragraphs.forEach(pText => {
				const trimmed = pText.trim();
				if (!trimmed) return;
				const p = descEl.createEl('p', { cls: 'firefly-beat-desc-paragraph' });
				// Formatting labels
				if (trimmed.startsWith('Best for:') || trimmed.startsWith('Momentum profile:')) {
					p.addClass('firefly-beat-desc-meta');
				}
				p.setText(trimmed);
			});
		}

		// Stats line: "13 beats · 3 acts"
		headerBlock.createDiv({
			cls: 'firefly-beat-stats-line',
			text: `${totalBeats} beats · ${totalActs} acts`
		});

		// Stage switcher: 1. Preview | 2. Design | 3. Fields
		this.renderStageSwitcher(cardEl);

		// Stage Content
		const contentContainer = cardEl.createDiv({ cls: 'firefly-beat-stage-content' });
		if (this.currentStage === 'preview') {
			this.renderPreviewStage(contentContainer, activeTab, totalActs);
		} else if (this.currentStage === 'design') {
			this.renderDesignStage(contentContainer, activeTab, totalActs);
		} else if (this.currentStage === 'fields') {
			this.renderFieldsStage(contentContainer, activeTab);
		}
	}

	private renderStageSwitcher(parent: HTMLElement): void {
		const switcher = parent.createDiv({ cls: 'firefly-beat-stage-switcher' });

		const stages: { id: BeatStage; step: number; label: string }[] = [
			{ id: 'preview', step: 1, label: 'Preview' },
			{ id: 'design', step: 2, label: 'Design' },
			{ id: 'fields', step: 3, label: 'Fields' },
		];

		stages.forEach(s => {
			const isActive = this.currentStage === s.id;
			const btn = switcher.createEl('button', {
				cls: `firefly-beat-stage-btn${isActive ? ' is-active' : ''}`,
				attr: { type: 'button' }
			});
			btn.createSpan({ cls: 'firefly-beat-stage-step', text: `${s.step}.` });
			btn.createSpan({ text: ` ${s.label}` });

			btn.addEventListener('click', () => {
				this.currentStage = s.id;
				this.render();
			});
		});
	}

	// ─── STAGE 1: PREVIEW ──────────────────────────────────────────
	private renderPreviewStage(parent: HTMLElement, tab: LoadedBeatTab, totalActs: number): void {
		const previewCard = parent.createDiv({ cls: 'firefly-beat-preview-container' });

		// Manuscript Status Banner
		const statusLine = previewCard.createDiv({ cls: 'firefly-beat-manuscript-status' });
		statusLine.setText('Inactive in manuscript');

		// Act Columns Grid
		const actGrid = previewCard.createDiv({ cls: 'firefly-beat-act-grid' });

		for (let actNum = 1; actNum <= totalActs; actNum++) {
			const actBeats = tab.beats.filter(b => (Number(b.act) || 1) === actNum);
			const col = actGrid.createDiv({ cls: 'firefly-beat-act-column' });

			// Act Header: "Act 1 (5)"
			const header = col.createDiv({ cls: 'firefly-beat-act-header' });
			header.setText(`Act ${actNum} (${actBeats.length})`);

			// List of beats
			const list = col.createDiv({ cls: 'firefly-beat-act-list' });
			actBeats.forEach(beat => {
				const globalIndex = tab.beats.indexOf(beat) + 1;
				const item = list.createDiv({ cls: 'firefly-beat-act-item' });
				item.setText(`${globalIndex}. ${beat.name}`);
				if (beat.purpose) {
					setTooltip(item, beat.purpose);
				}
			});

			if (actBeats.length === 0) {
				const emptyItem = list.createDiv({ cls: 'firefly-beat-act-empty' });
				emptyItem.setText('Brak beatów w tym akcie');
			}
		}
	}

	// ─── STAGE 2: DESIGN ───────────────────────────────────────────
	private renderDesignStage(parent: HTMLElement, tab: LoadedBeatTab, totalActs: number): void {
		const designContainer = parent.createDiv({ cls: 'firefly-beat-design-container' });

		const intro = designContainer.createDiv({ cls: 'firefly-beat-design-intro' });
		intro.setText('Edytuj listę beatów, zmieniaj ich nazwy, opisy oraz przypisanie do aktów.');

		for (let actNum = 1; actNum <= totalActs; actNum++) {
			const actBeats = tab.beats.filter(b => (Number(b.act) || 1) === actNum);
			const actGroup = designContainer.createDiv({ cls: 'firefly-beat-act-group' });

			const groupHeader = actGroup.createDiv({ cls: 'firefly-beat-act-group-header' });
			groupHeader.createSpan({ cls: 'firefly-beat-act-group-title', text: `Akt ${actNum} (${actBeats.length})` });

			const addBeatBtn = groupHeader.createEl('button', {
				cls: 'firefly-beat-btn-sm',
				text: '+ Dodaj beat'
			});
			addBeatBtn.addEventListener('click', () => {
				tab.beats.push({
					name: `Nowy Beat ${tab.beats.length + 1}`,
					act: actNum,
					purpose: ''
				});
				void this.plugin.saveSettings();
				this.render();
			});

			const listEl = actGroup.createDiv({ cls: 'firefly-beat-design-list' });

			actBeats.forEach(beat => {
				const globalIndex = tab.beats.indexOf(beat) + 1;
				const row = listEl.createDiv({ cls: 'firefly-beat-design-row' });

				// Grip icon
				const grip = row.createSpan({ cls: 'firefly-beat-grip-handle' });
				setIcon(grip, 'grip-vertical');

				// Ordinal
				row.createSpan({ cls: 'firefly-beat-row-ordinal', text: `${globalIndex}.` });

				// Name input
				const nameInput = row.createEl('input', {
					type: 'text',
					cls: 'firefly-beat-name-input',
					value: beat.name
				});
				nameInput.placeholder = 'Nazwa beatu...';
				nameInput.addEventListener('input', () => {
					beat.name = nameInput.value;
				});
				nameInput.addEventListener('blur', () => {
					void this.plugin.saveSettings();
				});

				// Act selector
				const actSelect = row.createEl('select', { cls: 'firefly-beat-act-select' });
				for (let a = 1; a <= totalActs; a++) {
					const opt = actSelect.createEl('option', { text: `Akt ${a}`, value: String(a) });
					if (a === actNum) opt.selected = true;
				}
				actSelect.addEventListener('change', () => {
					beat.act = parseInt(actSelect.value, 10);
					void this.plugin.saveSettings();
					this.render();
				});

				// Purpose button / indicator
				const descBtn = row.createEl('button', {
					cls: `firefly-beat-icon-btn${beat.purpose ? ' has-purpose' : ''}`,
					attr: { type: 'button' }
				});
				setIcon(descBtn, 'file-text');
				setTooltip(descBtn, beat.purpose || 'Dodaj opis beatu...');
				descBtn.addEventListener('click', () => {
					const newPurpose = prompt(`Opis dla beatu "${beat.name}":`, beat.purpose || '');
					if (newPurpose !== null) {
						beat.purpose = newPurpose.trim();
						void this.plugin.saveSettings();
						this.render();
					}
				});

				// Delete button
				const deleteBtn = row.createEl('button', {
					cls: 'firefly-beat-icon-btn is-danger',
					attr: { type: 'button' }
				});
				setIcon(deleteBtn, 'trash');
				setTooltip(deleteBtn, 'Usuń beat');
				deleteBtn.addEventListener('click', () => {
					tab.beats = tab.beats.filter(b => b !== beat);
					void this.plugin.saveSettings();
					this.render();
				});
			});

			if (actBeats.length === 0) {
				const emptyRow = listEl.createDiv({ cls: 'firefly-beat-empty-placeholder' });
				emptyRow.setText(`Brak beatów w Akcie ${actNum}. Kliknij "+ Dodaj beat", aby utworzyć.`);
			}
		}

		// Action bar at bottom: Add Act
		const footerActions = designContainer.createDiv({ cls: 'firefly-beat-design-footer' });
		const addActBtn = footerActions.createEl('button', {
			cls: 'firefly-beat-btn-secondary',
			text: '+ Dodaj kolejny akt'
		});
		addActBtn.addEventListener('click', () => {
			const nextActNum = totalActs + 1;
			tab.beats.push({
				name: `Beat otwierający Akt ${nextActNum}`,
				act: nextActNum,
				purpose: ''
			});
			void this.plugin.saveSettings();
			this.render();
		});
	}

	// ─── STAGE 3: FIELDS ───────────────────────────────────────────
	private renderFieldsStage(parent: HTMLElement, tab: LoadedBeatTab): void {
		const fieldsContainer = parent.createDiv({ cls: 'firefly-beat-fields-container' });

		const title = fieldsContainer.createEl('h4', { cls: 'firefly-beat-section-subtitle', text: 'Pola YAML beatów' });
		const desc = fieldsContainer.createEl('p', {
			cls: 'firefly-beat-section-desc',
			text: 'Zdefiniuj domyślne pola frontmatter, które będą wstrzykiwane do notatek lub scen związanych z tym systemem beatów.'
		});

		const yamlArea = fieldsContainer.createEl('textarea', {
			cls: 'firefly-beat-yaml-textarea',
			attr: { rows: '8', placeholder: 'status: draft\npov:\nlocation:\nconflict:' }
		});
		yamlArea.value = tab.config?.beatYamlAdvanced || '';

		yamlArea.addEventListener('blur', () => {
			if (!tab.config) tab.config = {};
			tab.config.beatYamlAdvanced = yamlArea.value;
			void this.plugin.saveSettings();
			new Notice('Zapisano szablon pól YAML.');
		});

		const saveBtn = fieldsContainer.createEl('button', {
			cls: 'firefly-beat-btn-primary',
			text: 'Zapisz pola YAML'
		});
		saveBtn.addEventListener('click', () => {
			if (!tab.config) tab.config = {};
			tab.config.beatYamlAdvanced = yamlArea.value;
			void this.plugin.saveSettings();
			new Notice('Zapisano szablon pól YAML.');
		});
	}

	// ─── LIBRARY (ADD SYSTEM) ──────────────────────────────────────
	private renderLibrary(parent: HTMLElement): void {
		const libraryContainer = parent.createDiv({ cls: 'firefly-beat-library-container' });

		const header = libraryContainer.createDiv({ cls: 'firefly-beat-library-header' });
		header.createEl('h3', { text: 'Biblioteka systemów beatów' });
		header.createEl('p', { text: 'Wybierz system fabularny i załaduj go do swojego obszaru roboczego Firefly.' });

		const grid = libraryContainer.createDiv({ cls: 'firefly-beat-library-grid' });
		const storyBeats = this.plugin.settings.storyBeats!;

		ALL_LIBRARY_ITEMS.forEach(item => {
			const isLoaded = storyBeats.loadedTabs.some(t => t.sourceId === item.id || t.name === item.name);
			const card = grid.createDiv({ cls: `firefly-beat-library-card${isLoaded ? ' is-loaded' : ''}` });

			const topRow = card.createDiv({ cls: 'firefly-beat-libcard-top' });
			const iconWrap = topRow.createSpan({ cls: 'firefly-beat-libcard-icon' });
			setIcon(iconWrap, item.icon || 'book-open');

			topRow.createSpan({ cls: 'firefly-beat-libcard-title', text: item.name });

			const categoryBadge = topRow.createSpan({ cls: 'firefly-beat-libcard-badge', text: item.category });

			const desc = card.createDiv({ cls: 'firefly-beat-libcard-desc' });
			const firstPara = item.description.split('\n\n')[0] || '';
			desc.setText(firstPara);

			const meta = card.createDiv({ cls: 'firefly-beat-libcard-meta' });
			const actNums = new Set(item.beats.map(b => b.act));
			meta.setText(`${item.beats.length} beats · ${actNums.size || 3} acts`);

			const actionRow = card.createDiv({ cls: 'firefly-beat-libcard-actions' });
			if (isLoaded) {
				const switchBtn = actionRow.createEl('button', {
					cls: 'firefly-beat-btn-sm firefly-beat-btn-secondary',
					text: 'Otwórz'
				});
				switchBtn.addEventListener('click', () => {
					const existing = storyBeats.loadedTabs.find(t => t.sourceId === item.id || t.name === item.name);
					if (existing) {
						storyBeats.activeTabId = existing.tabId;
						this.currentStage = 'preview';
						void this.plugin.saveSettings();
						this.render();
					}
				});
			} else {
				const loadBtn = actionRow.createEl('button', {
					cls: 'firefly-beat-btn-sm firefly-beat-btn-primary',
					text: 'Załaduj do Firefly'
				});
				loadBtn.addEventListener('click', () => {
					this.loadSystemFromLibrary(item);
				});
			}
		});
	}

	private loadSystemFromLibrary(item: BeatLibraryItem): void {
		const storyBeats = this.plugin.settings.storyBeats!;
		const newTab: LoadedBeatTab = {
			tabId: `tab_${item.id}_${Date.now()}`,
			sourceKind: item.kind,
			sourceId: item.id,
			name: item.name,
			description: item.description,
			beats: JSON.parse(JSON.stringify(item.beats)),
			config: item.config ? JSON.parse(JSON.stringify(item.config)) : undefined
		};

		storyBeats.loadedTabs.push(newTab);
		storyBeats.activeTabId = newTab.tabId;
		this.currentStage = 'preview';

		void this.plugin.saveSettings();
		new Notice(`Załadowano system "${item.name}".`);
		this.render();
	}
}
