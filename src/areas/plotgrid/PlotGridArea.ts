import type FireflyPlugin from '../../main';
import { PlotGridView } from '../writing/PlotGridView';
import type { PlotGridTabId } from '../writing/plotgrid/state/PlotGridState';

export class PlotGridArea {
	private plugin: FireflyPlugin;
	private onStateChange?: () => void;
	public view: PlotGridView | null = null;

	constructor(plugin: FireflyPlugin, onStateChange?: () => void) {
		this.plugin = plugin;
		this.onStateChange = onStateChange;
	}

	destroy(): void {
		this.view?.destroy();
		this.view = null;
	}

	renderMain(container: HTMLElement, tabId: string): void {
		if (!this.view) {
			this.view = new PlotGridView(this.plugin, container, () => {
				this.onStateChange?.();
			});
		} else {
			this.view.setContainer(container);
		}
		this.view.render(tabId as PlotGridTabId);
	}

	buildTopbarControls(rightEl: HTMLElement): void {
		this.view?.buildTopbarControls(rightEl);
	}

	reload(): void {
		this.view?.reload();
	}
}

export { PlotGridView };
