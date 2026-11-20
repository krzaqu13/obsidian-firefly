import { AbstractInputSuggest, App, TAbstractFile, TFolder } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	textInputEl: HTMLInputElement;
	private onSelectCallback?: (folder: TFolder) => void;

	constructor(app: App, textInputEl: HTMLInputElement, onSelectCallback?: (folder: TFolder) => void) {
		super(app, textInputEl);
		this.textInputEl = textInputEl;
		this.onSelectCallback = onSelectCallback;
	}

	getSuggestions(inputStr: string): TFolder[] {
		const abstractFiles = this.app.vault.getAllLoadedFiles();
		const folders: TFolder[] = [];
		const lowerCaseInputStr = inputStr.toLowerCase();

		abstractFiles.forEach((folder: TAbstractFile) => {
			if (
				folder instanceof TFolder &&
				folder.path.toLowerCase().includes(lowerCaseInputStr)
			) {
				folders.push(folder);
			}
		});

		return folders;
	}

	renderSuggestion(file: TFolder, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TFolder): void {
		this.textInputEl.value = file.path;
		this.textInputEl.dispatchEvent(new Event('input'));
		if (this.onSelectCallback) {
			this.onSelectCallback(file);
		}
		this.close();
	}
}
