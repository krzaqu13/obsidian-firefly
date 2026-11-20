import { setIcon, Menu, Modal, App } from 'obsidian';
import type FireflyPlugin from '../main';
import type { FireflyProject } from '../models/Project';

/**
 * Renderuje header inner sidebara z selektorem projektu.
 * Klik → Menu z listą projektów, separatorem, "Utwórz projekt" i "Zarządzaj projektami".
 */
export function renderProjectSelector(
	container: HTMLElement,
	plugin: FireflyPlugin,
	onProjectChanged: () => void,
): HTMLElement {
	const wrapper = container.createDiv('firefly-project-selector');

	const render = () => {
		wrapper.empty();

		const active = plugin.projectManager.getActiveProject();

		// Ikona projektu
		const iconEl = wrapper.createDiv({ cls: 'firefly-project-selector-icon' });
		if (active?.icon && !active.icon.includes('-')) {
			// Emoji
			iconEl.setText(active.icon);
		} else {
			setIcon(iconEl, active?.icon ?? 'book-open');
		}

		// Tekst: tytuł + subtitle "Projekt"
		const textEl = wrapper.createDiv({ cls: 'firefly-project-selector-text' });
		textEl.createDiv({
			cls:  'firefly-project-selector-title',
			text: active?.title ?? 'Brak projektu',
		});
		textEl.createDiv({
			cls:  'firefly-project-selector-subtitle',
			text: 'Projekt',
		});

		// Strzałka
		const chevron = wrapper.createSpan({ cls: 'firefly-project-selector-chevron' });
		setIcon(chevron, 'chevron-down');

		// Ustawienia wtyczki
		const settingsBtn = wrapper.createDiv({
			cls: 'firefly-settings-btn',
			attr: { 'aria-label': 'Ustawienia wtyczki' },
		});
		setIcon(settingsBtn, 'settings');
		settingsBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			(plugin.app as any).setting?.open();
			(plugin.app as any).setting?.openTabById?.('firefly');
		});

		// Klik → Menu
		wrapper.addEventListener('click', (e) => {
			const menu = new Menu();

			const projects = plugin.projectManager.getProjects();

			if (projects.length === 0) {
				menu.addItem(item => item
					.setTitle('Brak projektów')
					.setDisabled(true)
				);
			} else {
				for (const project of projects) {
					const isActive = project.id === plugin.projectManager.getActiveProject()?.id;
					menu.addItem(item => {
						item.setTitle(project.title);
						if (project.icon) {
							if (!project.icon.includes('-')) {
								item.setIcon('book-open'); // fallback — emoji w tytule
								item.setTitle(`${project.icon}  ${project.title}`);
							} else {
								item.setIcon(project.icon);
							}
						} else {
							item.setIcon('book-open');
						}
						if (isActive) item.setChecked(true);
						item.onClick(() => {
							plugin.projectManager.setActiveProject(project.id);
							render();
							onProjectChanged();
						});
					});
				}
			}

			menu.addSeparator();

			menu.addItem(item => item
				.setTitle('Utwórz projekt')
				.setIcon('plus')
				.onClick(() => {
					openCreateProjectModal(plugin, () => {
						render();
						onProjectChanged();
					});
				})
			);

			menu.addItem(item => item
				.setTitle('Zarządzaj projektami')
				.setIcon('settings')
				.onClick(() => {
					// Otwiera zakładkę Firefly w ustawieniach Obsidiana
					(plugin.app as any).setting?.open();
					(plugin.app as any).setting?.openTabById('firefly');
				})
			);

			menu.showAtMouseEvent(e);
		});
	};

	render();
	return wrapper;
}

/**
 * Prosty modal tworzenia projektu — inline, bez osobnego pliku.
 * Docelowo zastąpiony pełnym ModalComponent gdy będzie potrzeba.
 */
function openCreateProjectModal(
	plugin: FireflyPlugin,
	onCreated: () => void,
): void {
	class CreateProjectModal extends Modal {
		constructor(app: App) {
			super(app);
		}

		onOpen() {
			const { contentEl } = this;
			contentEl.empty();
			contentEl.createEl('h2', { text: 'Nowy projekt' });

			// Tytuł
			const titleWrap = contentEl.createDiv({ cls: 'firefly-modal-field' });
			titleWrap.createEl('label', { text: 'Nazwa projektu' });
			const titleInput = titleWrap.createEl('input', {
				type: 'text',
				placeholder: 'np. Cień nadziei',
				cls: 'firefly-modal-input',
			});
			titleInput.focus();

			// Ikona (opcjonalna)
			const iconWrap = contentEl.createDiv({ cls: 'firefly-modal-field' });
			iconWrap.createEl('label', { text: 'Ikona (emoji lub puste)' });
			const iconInput = iconWrap.createEl('input', {
				type: 'text',
				placeholder: '📖',
				cls: 'firefly-modal-input firefly-modal-input-sm',
			});

			// Przyciski
			const btnRow = contentEl.createDiv({ cls: 'firefly-modal-btn-row' });

			const cancelBtn = btnRow.createEl('button', { text: 'Anuluj', cls: 'firefly-modal-btn' });
			cancelBtn.addEventListener('click', () => this.close());

			const createBtn = btnRow.createEl('button', { text: 'Utwórz', cls: 'firefly-modal-btn firefly-modal-btn-primary' });
			createBtn.addEventListener('click', () => {
				const title = titleInput.value.trim();
				if (!title) { titleInput.addClass('firefly-input-error'); return; }

				const id = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
				plugin.projectManager.addProject({
					id:        id || `project-${Date.now()}`,
					title,
					filePath:  '',
					icon:      iconInput.value.trim() || undefined,
					createdAt: Date.now(),
				});

				this.close();
				onCreated();
			});

			// Enter = utwórz
			titleInput.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter') createBtn.click();
			});
		}

		onClose() {
			this.contentEl.empty();
		}
	}

	new CreateProjectModal(plugin.app).open();
}
