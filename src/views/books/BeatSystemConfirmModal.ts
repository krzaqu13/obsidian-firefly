import { App, Modal, Setting } from 'obsidian';

export class BeatSystemConfirmModal extends Modal {
	private presetName: string;
	private onConfirm: () => Promise<void>;

	constructor(app: App, presetName: string, onConfirm: () => Promise<void>) {
		super(app);
		this.presetName = presetName;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('firefly-confirm-modal');

		contentEl.createEl('h2', { text: 'Zmiana systemu Beatów' });
		
		const warnEl = contentEl.createDiv('firefly-confirm-warning-box');
		warnEl.createEl('p', {
			text: `Czy na pewno chcesz zastąpić obecny system beatów modelem „${this.presetName}”?`,
		});
		warnEl.createEl('ul', {}, ul => {
			ul.createEl('li', { text: 'Dotychczasowe pliki w folderze Beats/ zostaną usunięte.' });
			ul.createEl('li', { text: 'Referencje do usuniętych beatów w innych plikach (np. TargetBeat w Secrets) zostaną wyczyszczone.' });
			ul.createEl('li', { text: `Nowe pliki beatów dla profilu „${this.presetName}” zostaną wygenerowane w Beats/.` });
		});

		new Setting(contentEl)
			.addButton(btn => {
				btn.setButtonText('Anuluj')
					.onClick(() => this.close());
			})
			.addButton(btn => {
				btn.setButtonText('Zmień system beatów i zaktualizuj pliki')
					.setWarning()
					.setCta()
					.onClick(async () => {
						btn.setDisabled(true);
						btn.setButtonText('Przetwarzanie...');
						await this.onConfirm();
						this.close();
					});
			});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
