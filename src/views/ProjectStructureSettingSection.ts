import { Notice, setIcon } from 'obsidian';
import type FireflyPlugin from '../main';
import { ALL_STRUCTURE_PRESETS, createDefaultStructureSettings } from '../models/StructurePresets';

export class ProjectStructureSettingSection {
	private plugin: FireflyPlugin;
	private containerEl: HTMLElement;
	private activeTab: 'preset' | 'beats' | 'preview' = 'preset';

	constructor(containerEl: HTMLElement, plugin: FireflyPlugin) {
		this.containerEl = containerEl;
		this.plugin = plugin;
		if (!this.plugin.settings.projectStructure) {
			this.plugin.settings.projectStructure = createDefaultStructureSettings();
		}
	}

	public render(): void {
		this.containerEl.empty();
		const sectionEl = this.containerEl.createDiv({ cls: 'firefly-project-structure-section' });
		const header = sectionEl.createDiv({ cls: 'firefly-project-structure-header' });
		const icon = header.createSpan({ cls: 'firefly-project-structure-icon' });
		setIcon(icon, 'folder-tree');
		header.createSpan({ cls: 'firefly-project-structure-title', text: 'Struktura projektu' });

		const content = sectionEl.createDiv({ cls: 'firefly-project-structure-content' });
		const activeProject = this.plugin.projectManager.getActiveProject();
		const activeProfile = this.plugin.structureManager.getActiveProfile();
		if (!activeProfile) {
			content.setText('Brak aktywnego profilu struktury.');
			return;
		}

		const summary = content.createDiv({
			cls: 'firefly-project-structure-summary',
			text: `${activeProfile.name} · ${activeProfile.beats.length} beatów · ${activeProfile.arcElements.length} elementów arcu`,
		});
		summary.style.marginBottom = '12px';

		const tabBar = content.createDiv({ cls: 'firefly-project-structure-tabs' });
		const tabs = [
			{ id: 'preset', label: 'Preset' },
			{ id: 'beats', label: 'Beaty' },
			{ id: 'preview', label: 'Podgląd' },
		] as const;

		const tabPanels: Record<string, HTMLElement> = {};
		tabs.forEach(tab => {
			const button = tabBar.createEl('button', {
				cls: `firefly-project-structure-tab${tab.id === this.activeTab ? ' is-active' : ''}`,
				text: tab.label,
			});
			button.addEventListener('click', () => {
				this.activeTab = tab.id;
				this.render();
			});
		});

		const presetPanel = content.createDiv({ cls: 'firefly-project-structure-panel is-visible' });
		tabPanels.preset = presetPanel;
		const presetRow = presetPanel.createDiv({ cls: 'firefly-project-structure-presets' });
		ALL_STRUCTURE_PRESETS.forEach(preset => {
			const card = presetRow.createDiv({
				cls: `firefly-project-structure-card${preset.id === activeProfile.basedOn || preset.id === activeProfile.id ? ' is-active' : ''}`,
			});
			card.createDiv({ cls: 'firefly-project-structure-card-name', text: preset.name });
			card.createDiv({ cls: 'firefly-project-structure-card-desc', text: preset.description ?? 'Brak opisu.' });
			card.addEventListener('click', async () => {
				const profile = this.plugin.structureManager.createProfileFromPreset(preset.id);
				this.plugin.structureManager.setActiveProfile(profile.id);
				await this.plugin.saveSettings();
				this.render();
			});
		});

		const formPanel = content.createDiv({ cls: 'firefly-project-structure-panel' });
		tabPanels.beats = formPanel;
		const form = formPanel.createDiv({ cls: 'firefly-project-structure-form' });
		const nameRow = form.createDiv({ cls: 'firefly-project-structure-row' });
		nameRow.createSpan({ text: 'Nazwa profilu' });
		const nameInput = nameRow.createEl('input', { type: 'text', value: activeProfile.name });
		nameInput.addEventListener('change', async () => {
			activeProfile.name = nameInput.value.trim() || activeProfile.name;
			await this.plugin.saveSettings();
			this.render();
		});

		const projectTitleRow = form.createDiv({ cls: 'firefly-project-structure-row' });
		projectTitleRow.createSpan({ text: 'Tytuł książki' });
		const defaultProjectTitle = activeProject?.title || 'Nowa książka';
		const defaultProjectRoot = activeProject?.rootFolder || activeProject?.filePath || defaultProjectTitle;
		const projectTitleInput = projectTitleRow.createEl('input', { type: 'text', value: defaultProjectTitle });
		projectTitleInput.addEventListener('change', async () => {
			if (!activeProject) return;
			this.plugin.projectManager.updateProject(activeProject.id, { title: projectTitleInput.value.trim() || defaultProjectTitle });
			this.render();
		});

		const beatsBox = form.createDiv({ cls: 'firefly-project-structure-beats' });
		const beatsHeader = beatsBox.createDiv({ cls: 'firefly-project-structure-beats-header' });
		beatsHeader.createDiv({ cls: 'firefly-project-structure-section-label', text: 'Beaty' });
		const mapBeatsButton = beatsHeader.createEl('button', {
			cls: 'mod-cta firefly-project-structure-map-beats',
			attr: { type: 'button' },
			text: 'Mapuj istniejące beaty',
		});
		mapBeatsButton.addEventListener('click', async () => {
			if (!activeProject?.rootFolder) {
				new Notice('Najpierw ustaw folder aktywnego projektu.');
				return;
			}
			const mapped = this.plugin.structureManager.mapExistingBeatFiles(activeProfile);
			if (mapped === 0) {
				new Notice(`Nie znaleziono plików beatów w folderze „${activeProject.rootFolder}/${activeProfile.folders.beats}”.`);
				return;
			}
			await this.plugin.saveSettings();
			new Notice(`Zmapowano ${mapped} plików beatów do profilu „${activeProfile.name}”. Zmiany nazw i pól będą synchronizowane automatycznie.`);
			this.render();
		});
		if (activeProfile.beats.length === 0) {
			beatsBox.createDiv({ cls: 'firefly-project-structure-empty', text: 'Brak beatów. Wybierz preset lub dodaj pierwszy beat.' });
		} else {
			activeProfile.beats.forEach((beat, index) => {
				const row = beatsBox.createDiv({ cls: 'firefly-project-structure-beat-row' });
				const enabledWrap = row.createDiv({ cls: 'firefly-project-structure-toggle-wrap' });
				const enabled = enabledWrap.createEl('input', { type: 'checkbox' });
				enabled.checked = beat.enabled !== false;
				enabled.className = 'firefly-project-structure-checkbox';
				enabled.addEventListener('change', async () => {
					beat.enabled = enabled.checked;
					await this.plugin.saveSettings();
				});

				const name = row.createEl('input', { type: 'text', value: beat.name });
				name.placeholder = 'Nazwa beata';
				name.addEventListener('change', async () => {
					beat.name = name.value.trim() || beat.name;
					await this.plugin.saveSettings();
					this.render();
				});

				const act = row.createEl('input', { type: 'number', value: String(beat.act || 1) });
				act.min = '1';
				act.addEventListener('change', async () => {
					beat.act = Number(act.value) || 1;
					await this.plugin.saveSettings();
				});

				const range = row.createEl('input', { type: 'text', value: beat.range || '' });
				range.placeholder = '0-10';
				range.addEventListener('change', async () => {
					beat.range = range.value;
					await this.plugin.saveSettings();
				});

				const removeBtn = row.createEl('button', { text: 'Usuń' });
				removeBtn.addEventListener('click', async () => {
					activeProfile.beats.splice(index, 1);
					await this.plugin.saveSettings();
					this.render();
				});
			});
		}

		const addBeatButton = form.createEl('button', { cls: 'mod-cta', text: 'Dodaj beat' });
		addBeatButton.addEventListener('click', async () => {
			activeProfile.beats.push({
				name: `Nowy beat ${activeProfile.beats.length + 1}`,
				act: 1,
				range: '',
				enabled: true,
				order: activeProfile.beats.length + 1,
			});
			await this.plugin.saveSettings();
			this.render();
		});

		const previewPanel = content.createDiv({ cls: 'firefly-project-structure-panel' });
		tabPanels.preview = previewPanel;
		const plan = this.plugin.structureManager.buildPlan(
			activeProfile,
			projectTitleInput.value || defaultProjectTitle,
			['Protagonista', 'Antagonista'],
			defaultProjectRoot,
		);
		const preview = previewPanel.createDiv({ cls: 'firefly-project-structure-preview' });
		preview.createDiv({ cls: 'firefly-project-structure-section-label', text: 'Podgląd wygenerowania' });
		plan.slice(0, 8).forEach(entry => {
			preview.createDiv({ cls: 'firefly-project-structure-entry', text: entry.path });
		});

		Object.entries(tabPanels).forEach(([key, panel]) => {
			panel.toggleClass('is-visible', key === this.activeTab);
		});

		const actions = content.createDiv({ cls: 'firefly-project-structure-actions' });
		const saveButton = actions.createEl('button', { cls: 'mod-cta', text: 'Zapisz profil' });
		saveButton.addEventListener('click', async () => {
			const validation = this.plugin.structureManager.validateProfile(activeProfile);
			if (!validation.valid) {
				new Notice(validation.errors.join('\n'));
				return;
			}
			await this.plugin.saveSettings();
			new Notice(`Profil „${activeProfile.name}” zapisany.`);
		});

		const createButton = actions.createEl('button', { cls: 'mod-cta', text: 'Utwórz strukturę' });
		createButton.addEventListener('click', async () => {
			const validation = this.plugin.structureManager.validateProfile(activeProfile);
			if (!validation.valid) {
				new Notice(validation.errors.join('\n'));
				return;
			}
			const result = await this.plugin.structureManager.generateProjectFiles(
				activeProfile,
				projectTitleInput.value || defaultProjectTitle,
				['Protagonista', 'Antagonista'],
				defaultProjectRoot,
			);
			const total = result.created.length + result.skipped.length + result.errors.length;
			new Notice(
				result.created.length > 0
					? `Utworzono ${result.created.length} elementów. Pominięto: ${result.skipped.length}. Błędy: ${result.errors.length}.`
					: `Brak utworzonych elementów. Pominięto: ${result.skipped.length}. Błędy: ${result.errors.length}.`,
			);
			if (total > 0) {
				this.render();
			}
		});
	}
}
