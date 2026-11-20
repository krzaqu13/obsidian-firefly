import type FireflyPlugin from '../main';

export class FireflyLayout {
	public topbarEl: HTMLElement;
	public mainEl: HTMLElement;

	constructor(
		private readonly plugin: FireflyPlugin,
		rootEl: HTMLElement,
	) {
		const panelEl = rootEl.createDiv('firefly-panel');
		this.topbarEl = panelEl.createDiv('firefly-topbar');
		this.mainEl = panelEl.createDiv('firefly-main');
	}
}
