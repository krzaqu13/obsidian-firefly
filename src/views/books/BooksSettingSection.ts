import { App, ButtonComponent, ExtraButtonComponent, Notice, setIcon } from 'obsidian';
import type FireflyPlugin from '../../main';
import { BookCreateModal } from './BookCreateModal';
import { BookCustomizeInlineView } from './BookCustomizeInlineView';
import { FolderSuggest } from './FolderSuggest';

export class BooksSettingSection {
	private containerEl: HTMLElement;
	private plugin: FireflyPlugin;
	private app: App;
	private expandedBookId: string | null = null;

	constructor(containerEl: HTMLElement, plugin: FireflyPlugin) {
		this.containerEl = containerEl;
		this.plugin = plugin;
		this.app = plugin.app;
	}

	render(): void {
		this.containerEl.empty();
		const section = this.containerEl.createDiv('firefly-settings-books-section');

		// Header
		const header = section.createDiv('firefly-settings-books-header');
		const headerLeft = header.createDiv('firefly-books-header-left');

		const titleWrap = headerLeft.createDiv('firefly-books-title-wrap');
		setIcon(titleWrap.createSpan('firefly-books-title-icon'), 'library');
		titleWrap.createSpan({ cls: 'firefly-books-title', text: 'Books' });

		headerLeft.createDiv({
			cls: 'firefly-books-subtitle',
			text: 'Zarządzaj swoimi książkami, twórz dedykowaną strukturę folderów i dostosowuj elementy fabularne.',
		});

		const btnAddContainer = header.createDiv();
		new ButtonComponent(btnAddContainer)
			.setIcon('plus')
			.setButtonText('Nowa książka')
			.setCta()
			.setTooltip('Utwórz nową książkę')
			.onClick(() => {
				new BookCreateModal(this.app, this.plugin, () => this.render()).open();
			});

		// Lista książek
		const list = section.createDiv('firefly-settings-books-list');
		const projects = this.plugin.projectManager.getProjects();
		const activeId = this.plugin.projectManager.getActiveProject()?.id;

		if (projects.length === 0) {
			const emptyState = list.createDiv('firefly-books-empty-state');
			emptyState.createEl('p', { text: 'Nie masz jeszcze żadnej książki w Firefly.' });
			const createFirstBtn = emptyState.createEl('button', {
				text: 'Utwórz pierwszą książkę',
				cls: 'mod-cta',
			});
			createFirstBtn.onclick = () => {
				new BookCreateModal(this.app, this.plugin, () => this.render()).open();
			};
			return;
		}

		for (const project of projects) {
			const isActive = project.id === activeId;
			const isExpanded = this.expandedBookId === project.id;

			const card = list.createDiv('firefly-settings-book-card');
			if (isActive) {
				card.addClass('is-active');
			}
			if (isExpanded) {
				card.addClass('is-expanded');
			}

			// Karta Góra
			const cardTop = card.createDiv('firefly-book-card-top');

			// Ikona wyboru aktywnej książki
			const checkIcon = cardTop.createDiv('firefly-book-check-icon');
			if (isActive) {
				setIcon(checkIcon, 'check-circle');
				checkIcon.addClass('is-active');
				checkIcon.setAttribute('title', 'Książka aktywna');
			} else {
				setIcon(checkIcon, 'circle');
				checkIcon.setAttribute('title', 'Ustaw jako aktywną');
				checkIcon.onclick = () => {
					this.plugin.projectManager.setActiveProject(project.id);
					this.render();
				};
			}

			// Tytuł książki
			const titleContainer = cardTop.createDiv('firefly-book-title-container');
			const titleInput = titleContainer.createEl('input', {
				type: 'text',
				value: project.title,
				cls: 'firefly-book-title-input',
			});
			titleInput.onblur = () => {
				const newTitle = titleInput.value.trim() || project.title;
				this.plugin.projectManager.updateProject(project.id, { title: newTitle });
			};

			// Status aktywna / Badge
			if (isActive) {
				cardTop.createSpan({ cls: 'firefly-active-badge', text: 'Aktywna' });
			}

			// Karta Dół
			const cardBottom = card.createDiv('firefly-book-card-bottom');

			// Ścieżka folderu
			const pathWrap = cardBottom.createDiv('firefly-book-path-wrap');
			setIcon(pathWrap.createSpan('firefly-folder-icon'), 'folder');
			const pathInput = pathWrap.createEl('input', {
				type: 'text',
				value: project.rootFolder || '',
				placeholder: 'Ścieżka do folderu książki...',
				cls: 'firefly-book-path-input',
			});
			new FolderSuggest(this.app, pathInput);
			pathInput.onblur = () => {
				this.plugin.projectManager.updateProject(project.id, {
					rootFolder: pathInput.value.trim(),
					filePath: pathInput.value.trim(),
				});
			};

			// Akcje karty
			const actions = cardBottom.createDiv('firefly-book-actions');

			const customizeBtn = actions.createEl('button', {
				text: isExpanded ? 'Zwiń dostosowywanie' : 'Dostosuj elementy',
				cls: `firefly-customize-btn ${isExpanded ? 'mod-cta' : ''}`,
			});
			customizeBtn.onclick = () => {
				if (this.expandedBookId === project.id) {
					this.expandedBookId = null;
				} else {
					this.expandedBookId = project.id;
					if (!isActive) {
						this.plugin.projectManager.setActiveProject(project.id);
					}
				}
				this.render();
			};

			new ExtraButtonComponent(actions)
				.setIcon('trash')
				.setTooltip('Usuń książkę z wtyczki')
				.onClick(() => {
					if (confirm(`Czy na pewno usunąć książkę "${project.title}" z konfiguracji Firefly? (Pliki w folderze nie zostaną skasowane)`)) {
						if (this.expandedBookId === project.id) {
							this.expandedBookId = null;
						}
						this.plugin.projectManager.deleteProject(project.id);
						this.render();
					}
				});

			// Rozszerzony widok inline
			if (isExpanded) {
				const expandedContainer = card.createDiv('firefly-book-expanded-panel');
				const inlineView = new BookCustomizeInlineView(
					this.app,
					this.plugin,
					project,
					() => this.render(),
				);
				inlineView.render(expandedContainer);
			}
		}
	}
}
