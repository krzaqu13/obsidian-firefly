import {
	WorkspaceLeaf,
	WorkspaceSplit,
	MarkdownRenderer,
	TFile,
	setIcon,
	Notice,
	Platform,
} from 'obsidian';
import { EditorView, Decoration } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, Compartment, EditorSelection } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type FireflyPlugin from '../../main';
import { SceneReader } from '../../services/SceneReader';
import type { Scene, SceneStatus } from '../../models/Scene';
import { getStatusCfg } from '../../models/Scene';
import { buildFormattingToolbar } from './FormattingToolbar';
import { compareActChapter, getActDisplayLabel } from './actChapter';

/**
 * Pamięć podręczna stanu kursora i scrolla na poziomie modułu
 * (przetrwa przełączanie zakładek wewnątrz Firefly).
 */
let _lastManuscriptState: {
	scenePath: string;
	scrollTop: number;
	cursorAnchor?: number;
	cursorHead?: number;
} | null = null;

export class ManuscriptView {
	private plugin: FireflyPlugin;
	private container: HTMLElement;
	private onStateChange?: () => void;
	private reader: SceneReader;

	// Elementy DOM
	private rootEl: HTMLElement | null = null;
	private scrollArea: HTMLElement | null = null;
	private footerEl: HTMLElement | null = null;
	private fmtToolbarEl: HTMLElement | null = null;
	private searchPanel: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private replaceInput: HTMLInputElement | null = null;

	// Obserwatory i liście CodeMirror
	private lazyObserver: IntersectionObserver | null = null;
	private focusObserver: IntersectionObserver | null = null;
	private embeddedLeaves: Map<string, WorkspaceLeaf> = new Map();
	private editorResizeObservers: Map<string, ResizeObserver> = new Map();
	private mountingPaths: Map<string, symbol> = new Map();

	// Token cyklu renderowania do ochrony przed nieaktualnymi montowaniami
	private teardownToken: symbol = Symbol('initial');
	private isMounting = false;
	private lazyMounting = false;
	private hasActiveFocus = false;

	// Rozszerzenie atomic-links CodeMirror
	private atomicCompartment = new Compartment();

	// Stan widoku kontrolowany m.in. przez topbar
	focusMode = false;
	plainText = true;
	lockLinks = false;
	showFormattingToolbar = false;
	searchOpen = false;

	// Filtry i sortowanie
	filterAct = 'all';
	filterStatus = 'all';
	sortMode: 'reading' | 'chronological' | 'title' = 'reading';

	// Statystyki
	renderedSceneCount = 0;
	totalWordCount = 0;

	// Śledzenie aktywnej i widocznej sceny
	activeLeaf: WorkspaceLeaf | null = null;
	editingScenePath: string | null = null;
	focusedScenePath: string | null = null;

	// Wyszukiwanie w manuskrypcie
	private searchCaseSensitive = false;
	private searchWholeWord = false;
	private searchRegex = false;
	private searchMatchIndex = -1;
	private searchMatchTotal = 0;
	private searchMatches: { path: string; from: number; to: number }[] = [];

	// Bufor listy scen
	private lastScenes: Scene[] = [];

	constructor(plugin: FireflyPlugin, container: HTMLElement, onStateChange?: () => void) {
		this.plugin = plugin;
		this.container = container;
		this.onStateChange = onStateChange;
		this.reader = new SceneReader(plugin.app);
	}

	render(): void {
		this.detachAllEmbedded();
		this.container.empty();

		const project = this.plugin.projectManager.getActiveProject();
		if (!project) {
			this.renderPlaceholder('book-open', 'Brak aktywnego projektu', 'Wybierz lub utwórz projekt, aby zobaczyć manuskrypt.');
			return;
		}
		if (!project.rootFolder) {
			this.renderPlaceholder('folder-open', 'Brak folderu projektu', 'Skonfiguruj folder projektu w ustawieniach.');
			return;
		}

		this.rootEl = this.container.createDiv('firefly-manuscript-container');
		this.renderManuscriptStructure();
	}

	rerender(): void {
		this.render();
	}

	refresh(): void {
		if (this.hasActiveFocus || this.isMounting || this.lazyMounting || this.searchOpen) {
			this.updateStats();
			return;
		}
		this.render();
	}

	destroy(): void {
		this.captureCurrentState();
		this.detachAllEmbedded();
		this.focusObserver?.disconnect();
		this.lazyObserver?.disconnect();
		this.focusObserver = null;
		this.lazyObserver = null;

		const body = activeDocument.body;
		body.removeClass('firefly-focus-active-global');
		body.style.removeProperty('--firefly-focus-bg');
		this.rootEl = null;
	}

	// ── Budowanie struktury widoku ───────────────────────────────

	private renderManuscriptStructure(): void {
		if (!this.rootEl) return;

		// Pasek formatowania tekstu (ukryty domyślnie, włączany przyciskiem lub focusem)
		this.fmtToolbarEl = this.rootEl.createDiv('firefly-fmt-toolbar');
		this.fmtToolbarEl.style.display = this.showFormattingToolbar ? '' : 'none';
		buildFormattingToolbar(this.fmtToolbarEl, () => this.getActiveCm());

		// Panel wyszukiwania i zamiany
		this.buildSearchPanel(this.rootEl);

		// Główny kontener przewijania tekstu manuskryptu
		this.scrollArea = this.rootEl.createDiv('firefly-manuscript-scroll');
		if (this.plainText) this.scrollArea.addClass('firefly-manuscript-plain');
		if (this.focusMode) this.rootEl.addClass('firefly-manuscript-focus');

		// Obsługa zdarzeń fokusu w obszarze edycji
		this.scrollArea.addEventListener('focusin', (e) => {
			this.hasActiveFocus = true;
			const target = e.target as HTMLElement;
			for (const [path, leaf] of this.embeddedLeaves) {
				const splitEl = (leaf as unknown as { containerEl?: { parentElement?: HTMLElement | null } }).containerEl?.parentElement;
				if (splitEl?.contains(target)) {
					this.activeLeaf = leaf;
					this.editingScenePath = path;

					if (this.focusMode) {
						this.scrollArea?.querySelectorAll('.firefly-focus-active').forEach(
							el => el.removeClass('firefly-focus-active'),
						);
						const block = splitEl.closest('.firefly-manuscript-scene-block');
						if (block) block.addClass('firefly-focus-active');
					}
					break;
				}
			}
		});

		this.scrollArea.addEventListener('focusout', () => {
			this.captureCurrentState();
			window.setTimeout(() => {
				if (!this.scrollArea?.contains(activeDocument.activeElement)) {
					this.hasActiveFocus = false;
					this.activeLeaf = null;
				}
			}, 100);
		});

		// Stopka ze statystykami
		this.footerEl = this.rootEl.createDiv('firefly-manuscript-footer');

		this.setupFocusObserver();
		this.renderManuscriptContent();
	}

	// ── Renderowanie zawartości scen i dividerów ─────────────────

	private async renderManuscriptContent(): Promise<void> {
		if (!this.scrollArea || !this.footerEl) return;
		this.detachAllEmbedded();
		const renderToken = this.teardownToken;
		this.scrollArea.empty();
		this.footerEl.empty();

		const allScenes = this.reader.getAllScenes(this.plugin);

		// Filtracja
		let scenes = allScenes.filter(scene => {
			if (this.filterAct !== 'all') {
				const actVal = String(scene.act ?? '');
				if (actVal !== this.filterAct) return false;
			}
			if (this.filterStatus !== 'all') {
				const statusVal = String(scene.status ?? 'idea').toLowerCase();
				if (statusVal !== this.filterStatus) return false;
			}
			return true;
		});

		// Sortowanie
		if (this.sortMode === 'reading') {
			scenes.sort((a, b) => {
				const actCmp = compareActChapter(a.act, b.act);
				if (actCmp !== 0) return actCmp;
				const chCmp = compareActChapter(a.chapter, b.chapter);
				if (chCmp !== 0) return chCmp;
				return (a.sequence ?? 9999) - (b.sequence ?? 9999);
			});
		} else if (this.sortMode === 'chronological') {
			scenes.sort((a, b) => {
				const wa = a.when || a.date || '';
				const wb = b.when || b.date || '';
				if (wa && wb && wa !== wb) return wa.localeCompare(wb);
				return (a.sequence ?? 9999) - (b.sequence ?? 9999);
			});
		} else if (this.sortMode === 'title') {
			scenes.sort((a, b) => a.title.localeCompare(b.title));
		}

		this.lastScenes = scenes;
		this.renderedSceneCount = scenes.length;

		if (scenes.length === 0) {
			this.scrollArea.createDiv({
				cls: 'firefly-manuscript-empty',
				text: 'Brak scen pasujących do wybranych filtrów.',
			});
			this.footerEl.setText('0 scen · 0 słów');
			this.updateStats();
			return;
		}

		// Obserwator do lazy loading edytorów
		this.lazyObserver?.disconnect();
		this.lazyObserver = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const el = entry.target as HTMLElement;
						const path = el.dataset.scenePath;
						if (path && !this.embeddedLeaves.has(path) && !this.mountingPaths.has(path)) {
							this.mountEditor(el, path);
						}
					}
				}
			},
			{ root: this.scrollArea, rootMargin: '400px 0px' },
		);

		let totalWords = 0;
		let lastAct: string | number | undefined;
		let lastChapter: string | number | undefined;
		let prevBlock: HTMLElement | null = null;
		const editorContainers: { el: HTMLElement; path: string }[] = [];

		for (const scene of scenes) {
			// Separator Aktu
			if (scene.act !== undefined && scene.act !== null && scene.act !== lastAct) {
				lastAct = scene.act;
				lastChapter = undefined;
				if (prevBlock) prevBlock.classList.add('is-before-divider');
				const actDiv = this.scrollArea.createDiv('firefly-manuscript-act-divider');
				const actDisplay = getActDisplayLabel(scene.act);
				actDiv.createSpan({
					cls: 'firefly-manuscript-act-label',
					text: actDisplay,
				});
			}

			// Separator Rozdziału
			if (scene.chapter !== undefined && scene.chapter !== null && scene.chapter !== lastChapter) {
				lastChapter = scene.chapter;
				if (prevBlock) prevBlock.classList.add('is-before-divider');
				const chapDiv = this.scrollArea.createDiv('firefly-manuscript-chapter-divider');
				chapDiv.createSpan({
					cls: 'firefly-manuscript-chapter-label',
					text: `Rozdział ${scene.chapter}`,
				});
			}

			// Blok sceny
			const block = this.scrollArea.createDiv('firefly-manuscript-scene-block');
			prevBlock = block;
			block.dataset.scenePath = scene.filePath;
			if (this.focusObserver) this.focusObserver.observe(block);

			// Nagłówek sceny: tytuł + status badge
			const header = block.createDiv('firefly-manuscript-scene-header');
			const titleEl = header.createSpan({
				cls: 'firefly-manuscript-scene-title',
				text: scene.title,
			});
			titleEl.setAttribute('title', 'Otwórz scenę w nowej karcie');
			titleEl.addEventListener('click', () => {
				const file = this.plugin.app.vault.getAbstractFileByPath(scene.filePath);
				if (file instanceof TFile) {
					this.plugin.app.workspace.getLeaf('tab').openFile(file);
				}
			});

			if (scene.status) {
				const cfg = getStatusCfg(scene.status);
				header.createSpan({
					cls: `firefly-manuscript-status firefly-status-${scene.status}`,
					text: cfg.label,
				});
			}

			if (scene.synopsis) {
				header.createSpan({
					cls: 'firefly-manuscript-scene-subtitle',
					text: scene.synopsis,
				});
			}

			// Kontener edytora Markdown (Live Preview)
			const editorWrap = block.createDiv('firefly-manuscript-editor-wrap');
			editorWrap.dataset.scenePath = scene.filePath;
			editorWrap.createDiv({ cls: 'firefly-manuscript-loading', text: 'Ładowanie sceny…' });
			this.lazyObserver.observe(editorWrap);
			editorContainers.push({ el: editorWrap, path: scene.filePath });

			// Obliczenie słów
			const sceneWords = scene.wordcount ?? this.estimateSceneWords(scene);
			totalWords += sceneWords;
		}

		this.totalWordCount = totalWords;
		this.footerEl.setText(`${scenes.length} scen · ${totalWords.toLocaleString()} słów`);
		this.updateStats();

		// Eager loading pierwszych kilku scen dla natychmiastowego renderu
		this.isMounting = true;
		try {
			const eagerCount = Math.min(3, editorContainers.length);
			for (let i = 0; i < eagerCount; i++) {
				if (this.teardownToken !== renderToken) return;
				const ec = editorContainers[i];
				if (ec) {
					await this.mountEditor(ec.el, ec.path);
				}
			}

			if (this.teardownToken !== renderToken) return;
			this.restoreStateAfterRender();
		} finally {
			if (this.teardownToken === renderToken) {
				this.isMounting = false;
			}
		}
	}

	/**
	 * Montuje prawdziwy edytor Markdown (Live Preview) wewnątrz kontenera sceny.
	 */
	private async mountEditor(container: HTMLElement, filePath: string): Promise<void> {
		if (this.embeddedLeaves.has(filePath) || this.mountingPaths.has(filePath)) return;
		const mountId = Symbol('mount');
		this.mountingPaths.set(filePath, mountId);
		this.lazyMounting = true;
		const teardownToken = this.teardownToken;

		const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			this.releaseMount(filePath, mountId);
			return;
		}

		if (!container.isConnected || this.teardownToken !== teardownToken) {
			this.releaseMount(filePath, mountId);
			return;
		}

		container.empty();

		// Na urządzeniach mobilnych (tablet/telefon) WorkspaceSplit bywa niestabilny; użyj podglądu markdown
		if (Platform.isPhone || Platform.isTablet) {
			this.releaseMount(filePath, mountId);
			await this.mountReadOnlyPreview(container, file);
			return;
		}

		try {
			const split = new (WorkspaceSplit as unknown as new (workspace: unknown, dir: string) => WorkspaceSplit)(
				this.plugin.app.workspace,
				'vertical',
			);
			const splitEl: HTMLElement = (split as unknown as { containerEl: HTMLElement }).containerEl;
			container.appendChild(splitEl);
			splitEl.classList.add('firefly-manuscript-embedded-split');
			splitEl.setCssStyles({ height: '300px' });

			const leaf = this.plugin.app.workspace.createLeafInParent(split, 0);
			await leaf.openFile(file, {
				state: { mode: 'source', source: false },
			});

			if (this.teardownToken !== teardownToken || !splitEl.isConnected) {
				try { leaf.detach(); } catch { /* ignore */ }
				this.releaseMount(filePath, mountId);
				return;
			}

			this.embeddedLeaves.set(filePath, leaf);
			this.releaseMount(filePath, mountId);

			// Rozszerzenie lock-links (atomic ranges)
			this.injectAtomicExtension(leaf);

			// Synchronizacja wysokości bez sztucznych odstępów CM6
			let rafPending = false;
			let syncing = false;
			const syncHeight = () => {
				if (syncing) return;
				const cm = this.getCmView(leaf);
				if (!cm) return;
				syncing = true;
				cm.requestMeasure({
					read: () => {
						const content = splitEl.querySelector('.cm-content') as HTMLElement | null;
						if (!content) return 0;
						const contentRect = content.getBoundingClientRect();
						const splitTop = splitEl.getBoundingClientRect().top;
						const offset = Math.max(0, contentRect.top - splitTop);
						return contentRect.height + offset;
					},
					write: (h) => {
						if (h > 0) {
							const px = Math.ceil(h) + 'px';
							splitEl.setCssStyles({ height: px });
							container.setCssStyles({ height: px });
						}
						syncing = false;
					},
				});
			};

			const debouncedSync = () => {
				if (rafPending) return;
				rafPending = true;
				window.requestAnimationFrame(() => {
					rafPending = false;
					syncHeight();
				});
			};

			window.requestAnimationFrame(() => {
				syncHeight();
				window.requestAnimationFrame(() => {
					syncHeight();
					window.setTimeout(syncHeight, 300);
				});
			});

			const cmEl = splitEl.querySelector('.cm-editor') as HTMLElement | null;
			const cmContent = splitEl.querySelector('.cm-content') as HTMLElement | null;
			if (cmEl) {
				const ro = new ResizeObserver(() => debouncedSync());
				ro.observe(cmEl);
				if (cmContent && cmContent !== cmEl) ro.observe(cmContent);
				this.editorResizeObservers.set(filePath, ro);
			}

			if (cmContent) {
				cmContent.addEventListener('blur', () => {
					this.editingScenePath = filePath;
					this.captureCurrentState();
				});
				cmContent.addEventListener('keyup', () => {
					this.editingScenePath = filePath;
					this.captureCurrentState();
				});
				cmContent.addEventListener('click', () => {
					this.editingScenePath = filePath;
					this.captureCurrentState();
				});
			}
		} catch (err) {
			this.releaseMount(filePath, mountId);
			console.warn('Firefly: nie udało się osadzić edytora sceny, przejście do trybu czytania', err);
			if (container.isConnected) {
				await this.mountReadOnlyPreview(container, file);
			}
		}
	}

	private async mountReadOnlyPreview(container: HTMLElement, file: TFile): Promise<void> {
		try {
			const text = await this.plugin.app.vault.read(file);
			const cleanText = text.replace(/^---[\s\S]*?---\s*/, '').trim();
			if (cleanText) {
				const previewEl = container.createDiv('firefly-manuscript-preview');
				await MarkdownRenderer.render(this.plugin.app, cleanText, previewEl, file.path, this.plugin);
				this.decodeNbspEntities(previewEl);
			} else {
				container.createDiv({ cls: 'firefly-manuscript-scene-empty', text: 'Pusta scena' });
			}
		} catch {
			container.createDiv({ cls: 'firefly-manuscript-scene-empty', text: 'Błąd odczytu sceny' });
		}
	}

	private decodeNbspEntities(root: HTMLElement): void {
		const walker = activeDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		const targets: Text[] = [];
		let node: Node | null;
		while ((node = walker.nextNode())) {
			const t = node as Text;
			if (t.nodeValue && /&(nbsp|#160|#xA0);/i.test(t.nodeValue)) {
				targets.push(t);
			}
		}
		for (const t of targets) {
			t.nodeValue = t.nodeValue!
				.replace(/&nbsp;/gi, '\u00A0')
				.replace(/&#160;/gi, '\u00A0')
				.replace(/&#xA0;/gi, '\u00A0');
		}
	}

	private releaseMount(filePath: string, mountId: symbol): void {
		if (this.mountingPaths.get(filePath) === mountId) {
			this.mountingPaths.delete(filePath);
		}
		if (this.mountingPaths.size === 0) {
			this.lazyMounting = false;
		}
	}

	private detachAllEmbedded(): void {
		this.teardownToken = Symbol('detach');
		for (const [, leaf] of this.embeddedLeaves) {
			try { leaf.detach(); } catch { /* ignore */ }
		}
		this.embeddedLeaves.clear();
		for (const [, ro] of this.editorResizeObservers) {
			ro.disconnect();
		}
		this.editorResizeObservers.clear();
		this.mountingPaths.clear();
		this.lazyMounting = false;
	}

	private getCmView(leaf: WorkspaceLeaf): EditorView | null {
		const editor = (leaf.view as unknown as { editor?: { cm?: EditorView } })?.editor;
		return editor?.cm ?? null;
	}

	private getActiveCm(): EditorView | null {
		if (!this.activeLeaf) return null;
		return this.getCmView(this.activeLeaf);
	}

	// ── Atomic links extension (CodeMirror 6) ───────────────────

	private buildAtomicExtension(): ReturnType<typeof EditorView.atomicRanges.of> {
		return EditorView.atomicRanges.of((view) => {
			const builder = new RangeSetBuilder<Decoration>();
			const tree = syntaxTree(view.state);
			tree.iterate({
				enter(node: { name: string; from: number; to: number }) {
					const name = node.name;
					if (
						name.includes('hmd-internal-link') ||
						name.includes('internal-link') ||
						name === 'hashtag' ||
						name.includes('HyperMD-internal-link') ||
						name.includes('formatting-link')
					) {
						if (node.from < node.to) {
							builder.add(node.from, node.to, Decoration.mark({}));
						}
					}
				},
			});
			return builder.finish();
		});
	}

	private injectAtomicExtension(leaf: WorkspaceLeaf): void {
		const cm = this.getCmView(leaf);
		if (!cm) return;
		const ext = this.lockLinks ? this.buildAtomicExtension() : [];
		cm.dispatch({
			effects: StateEffect.appendConfig.of(this.atomicCompartment.of(ext)),
		});
	}

	private updateAtomicLinks(): void {
		const ext = this.lockLinks ? this.buildAtomicExtension() : [];
		for (const [, leaf] of this.embeddedLeaves) {
			const cm = this.getCmView(leaf);
			if (!cm) continue;
			cm.dispatch({
				effects: this.atomicCompartment.reconfigure(ext),
			});
		}
	}

	// ── Tryb skupienia (Focus Mode) ──────────────────────────────

	toggleFocusMode(): void {
		this.focusMode = !this.focusMode;
		if (this.rootEl) {
			this.rootEl.classList.toggle('firefly-manuscript-focus', this.focusMode);
		}
		const body = activeDocument.body;
		if (this.focusMode) {
			body.addClass('firefly-focus-active-global');
		} else {
			body.removeClass('firefly-focus-active-global');
			this.scrollArea?.querySelectorAll('.firefly-focus-active').forEach(
				el => el.removeClass('firefly-focus-active'),
			);
		}
	}

	// ── Przeszukiwanie i zamiana (Cross-scene Search) ────────────

	private buildSearchPanel(container: HTMLElement): void {
		const panel = container.createDiv('firefly-manuscript-search');
		panel.style.display = 'none';
		this.searchPanel = panel;

		const row = panel.createDiv('firefly-manuscript-search-row');
		const findIcon = row.createSpan();
		setIcon(findIcon, 'search');

		const input = row.createEl('input', {
			cls: 'firefly-manuscript-search-input',
			attr: { type: 'text', placeholder: 'Szukaj w całym manuskrypcie…', 'aria-label': 'Szukaj w manuskrypcie' },
		});
		this.searchInput = input;

		row.createSpan({ cls: 'firefly-manuscript-search-count', text: '' });

		const prevBtn = row.createEl('button', {
			cls: 'firefly-manuscript-search-btn',
			attr: { 'aria-label': 'Poprzednie dopasowanie', title: 'Poprzednie (Shift+Enter)' },
		});
		setIcon(prevBtn, 'chevron-up');
		prevBtn.addEventListener('click', () => this.searchNext(false));

		const nextBtn = row.createEl('button', {
			cls: 'firefly-manuscript-search-btn',
			attr: { 'aria-label': 'Następne dopasowanie', title: 'Następne (Enter)' },
		});
		setIcon(nextBtn, 'chevron-down');
		nextBtn.addEventListener('click', () => this.searchNext(true));

		const caseBtn = row.createEl('button', {
			cls: 'firefly-manuscript-search-toggle',
			attr: { 'aria-label': 'Uwzględniaj wielkość liter', title: 'Wielkość liter' },
		});
		caseBtn.setText('Aa');
		caseBtn.addEventListener('click', () => {
			this.searchCaseSensitive = !this.searchCaseSensitive;
			caseBtn.classList.toggle('is-active', this.searchCaseSensitive);
			this.runSearch();
		});

		const wordBtn = row.createEl('button', {
			cls: 'firefly-manuscript-search-toggle',
			attr: { 'aria-label': 'Całe słowa', title: 'Całe słowa' },
		});
		setIcon(wordBtn, 'whole-word');
		wordBtn.addEventListener('click', () => {
			this.searchWholeWord = !this.searchWholeWord;
			wordBtn.classList.toggle('is-active', this.searchWholeWord);
			this.runSearch();
		});

		const regexBtn = row.createEl('button', {
			cls: 'firefly-manuscript-search-toggle',
			attr: { 'aria-label': 'Wyrażenie regularne', title: 'RegEx' },
		});
		regexBtn.setText('.*');
		regexBtn.addEventListener('click', () => {
			this.searchRegex = !this.searchRegex;
			regexBtn.classList.toggle('is-active', this.searchRegex);
			this.runSearch();
		});

		const closeBtn = row.createEl('button', {
			cls: 'firefly-manuscript-search-btn',
			attr: { 'aria-label': 'Zamknij wyszukiwanie', title: 'Zamknij (Esc)' },
		});
		setIcon(closeBtn, 'x');
		closeBtn.addEventListener('click', () => this.closeSearch());

		// Wiersz zamiany
		const replaceRow = panel.createDiv('firefly-manuscript-search-row firefly-manuscript-replace-row');
		const repIcon = replaceRow.createSpan();
		setIcon(repIcon, 'replace');

		const replaceInput = replaceRow.createEl('input', {
			cls: 'firefly-manuscript-search-input',
			attr: { type: 'text', placeholder: 'Zastąp…', 'aria-label': 'Zastąp' },
		});
		this.replaceInput = replaceInput;

		const replaceBtn = replaceRow.createEl('button', {
			cls: 'firefly-manuscript-search-btn',
			attr: { 'aria-label': 'Zastąp to dopasowanie', title: 'Zastąp' },
		});
		setIcon(replaceBtn, 'replace');
		replaceBtn.addEventListener('click', () => this.replaceCurrent());

		const replaceAllBtn = replaceRow.createEl('button', {
			cls: 'firefly-manuscript-search-btn',
			attr: { 'aria-label': 'Zastąp wszystkie wystąpienia', title: 'Zastąp wszystko' },
		});
		setIcon(replaceAllBtn, 'check-check');
		replaceAllBtn.addEventListener('click', () => this.replaceAll());

		input.addEventListener('input', () => this.runSearch());
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.searchNext(!e.shiftKey);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this.closeSearch();
			}
		});
		replaceInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.replaceCurrent();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this.closeSearch();
			}
		});
	}

	toggleSearch(): void {
		if (!this.searchPanel) return;
		this.searchOpen = this.searchPanel.style.display === 'none';
		this.searchPanel.style.display = this.searchOpen ? '' : 'none';
		if (this.searchOpen) {
			this.searchInput?.focus();
			this.searchInput?.select();
			if (this.searchInput?.value) this.runSearch();
		} else {
			this.clearSearchHighlights();
		}
	}

	private closeSearch(): void {
		this.searchOpen = false;
		if (this.searchPanel) this.searchPanel.style.display = 'none';
		this.clearSearchHighlights();
		this.searchMatches = [];
		this.searchMatchTotal = 0;
		this.searchMatchIndex = -1;
		this.updateSearchCount();
		this.onStateChange?.();
	}

	private buildSearchRegex(): RegExp | null {
		const term = this.searchInput?.value ?? '';
		if (!term) return null;
		let flags = 'g';
		if (!this.searchCaseSensitive) flags += 'i';
		let pattern = this.searchRegex ? term : term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		if (this.searchWholeWord && !this.searchRegex) pattern = `\\b${pattern}\\b`;
		try {
			return new RegExp(pattern, flags);
		} catch {
			return null;
		}
	}

	private async runSearch(): Promise<void> {
		this.clearSearchHighlights();
		this.searchMatches = [];
		const re = this.buildSearchRegex();
		if (!re) {
			this.searchMatchTotal = 0;
			this.searchMatchIndex = -1;
			this.updateSearchCount();
			return;
		}

		for (const scene of this.lastScenes) {
			let text: string | null = null;
			const leaf = this.embeddedLeaves.get(scene.filePath);
			if (leaf) {
				const cm = this.getCmView(leaf);
				if (cm) text = cm.state.doc.toString();
			}
			if (text == null) {
				const file = this.plugin.app.vault.getAbstractFileByPath(scene.filePath);
				if (file instanceof TFile) {
					text = await this.plugin.app.vault.read(file);
				}
			}
			if (text == null) continue;

			re.lastIndex = 0;
			let m: RegExpExecArray | null;
			while ((m = re.exec(text)) !== null) {
				if (m[0].length === 0) { re.lastIndex++; continue; }
				this.searchMatches.push({
					path: scene.filePath,
					from: m.index,
					to: m.index + m[0].length,
				});
			}
		}

		this.searchMatchTotal = this.searchMatches.length;
		this.searchMatchIndex = this.searchMatchTotal > 0 ? 0 : -1;
		this.applySearchHighlights();
		this.updateSearchCount();
	}

	private searchNext(forward: boolean): void {
		if (this.searchMatches.length === 0) {
			void this.runSearch();
			return;
		}
		if (forward) {
			this.searchMatchIndex = (this.searchMatchIndex + 1) % this.searchMatches.length;
		} else {
			this.searchMatchIndex = (this.searchMatchIndex - 1 + this.searchMatches.length) % this.searchMatches.length;
		}
		this.updateSearchCount();
		void this.scrollToMatch(this.searchMatchIndex);
	}

	private updateSearchCount(): void {
		const el = this.searchPanel?.querySelector('.firefly-manuscript-search-count') as HTMLElement | null;
		if (!el) return;
		if (this.searchMatchTotal === 0) {
			el.setText(this.searchInput?.value ? 'Brak wyników' : '');
		} else {
			el.setText(`${this.searchMatchIndex + 1} z ${this.searchMatchTotal}`);
		}
	}

	private applySearchHighlights(): void {
		if (this.searchMatchIndex < 0 || this.searchMatchIndex >= this.searchMatches.length) return;
		const match = this.searchMatches[this.searchMatchIndex];
		if (!match) return;
		const leaf = this.embeddedLeaves.get(match.path);
		if (!leaf) return;
		const cm = this.getCmView(leaf);
		if (!cm) return;
		cm.dispatch({
			selection: EditorSelection.single(match.from, match.to),
			scrollIntoView: true,
		});
	}

	private clearSearchHighlights(): void {
		for (const [, leaf] of this.embeddedLeaves) {
			const cm = this.getCmView(leaf);
			if (!cm) continue;
			const sel = cm.state.selection.main;
			if (sel.from !== sel.to) {
				cm.dispatch({ selection: EditorSelection.single(sel.head, sel.head) });
			}
		}
	}

	private async scrollToMatch(idx: number): Promise<void> {
		if (idx < 0 || idx >= this.searchMatches.length) return;
		const match = this.searchMatches[idx];
		if (!match) return;
		if (!this.embeddedLeaves.has(match.path)) {
			const block = this.scrollArea?.querySelector(
				`[data-scene-path="${CSS.escape(match.path)}"]`,
			) as HTMLElement | null;
			const editorWrap = block?.querySelector('.firefly-manuscript-editor-wrap') as HTMLElement | null;
			if (editorWrap) await this.mountEditor(editorWrap, match.path);
		}
		const block = this.scrollArea?.querySelector(
			`[data-scene-path="${CSS.escape(match.path)}"]`,
		) as HTMLElement | null;
		if (block) block.scrollIntoView({ behavior: 'smooth', block: 'center' });

		window.requestAnimationFrame(() => {
			this.applySearchHighlights();
			const leaf = this.embeddedLeaves.get(match.path);
			if (leaf) {
				const cm = this.getCmView(leaf);
				cm?.focus();
			}
		});
	}

	private async replaceCurrent(): Promise<void> {
		if (this.searchMatchIndex < 0 || this.searchMatchIndex >= this.searchMatches.length) return;
		const replacement = this.replaceInput?.value ?? '';
		const match = this.searchMatches[this.searchMatchIndex];
		if (!match) return;
		const leaf = this.embeddedLeaves.get(match.path);

		if (leaf) {
			const cm = this.getCmView(leaf);
			if (!cm) return;
			cm.dispatch({
				changes: { from: match.from, to: match.to, insert: replacement },
				selection: EditorSelection.single(match.from, match.from + replacement.length),
			});
		} else {
			const file = this.plugin.app.vault.getAbstractFileByPath(match.path);
			if (file instanceof TFile) {
				const text = await this.plugin.app.vault.read(file);
				const newText = text.slice(0, match.from) + replacement + text.slice(match.to);
				await this.plugin.app.vault.modify(file, newText);
			}
		}

		await new Promise(r => window.setTimeout(r, 200));
		void this.runSearch();
	}

	private async replaceAll(): Promise<void> {
		if (this.searchMatches.length === 0) return;
		const replacement = this.replaceInput?.value ?? '';

		const byPath = new Map<string, { from: number; to: number }[]>();
		for (const m of this.searchMatches) {
			const arr = byPath.get(m.path) ?? [];
			arr.push({ from: m.from, to: m.to });
			byPath.set(m.path, arr);
		}

		let totalReplaced = 0;
		for (const [path, matches] of byPath) {
			const leaf = this.embeddedLeaves.get(path);
			if (leaf) {
				const cm = this.getCmView(leaf);
				if (!cm) continue;
				const sorted = [...matches].sort((a, b) => b.from - a.from);
				const changes = sorted.map(m => ({ from: m.from, to: m.to, insert: replacement }));
				cm.dispatch({ changes });
				totalReplaced += matches.length;
			} else {
				const file = this.plugin.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					let text = await this.plugin.app.vault.read(file);
					const sorted = [...matches].sort((a, b) => b.from - a.from);
					for (const m of sorted) {
						text = text.slice(0, m.from) + replacement + text.slice(m.to);
					}
					await this.plugin.app.vault.modify(file, text);
					totalReplaced += matches.length;
				}
			}
		}

		new Notice(`Zastąpiono ${totalReplaced} wystąpień`);
		await new Promise(r => window.setTimeout(r, 300));
		void this.runSearch();
	}

	// ── Focus Observer dla aktywnej sceny ────────────────────────

	private setupFocusObserver(): void {
		this.focusObserver?.disconnect();
		if (!this.scrollArea) return;

		const visibleEntries = new Map<string, number>();
		let focusSyncTimer: number | null = null;
		const syncFocusedScene = () => {
			if (focusSyncTimer !== null) return;
			focusSyncTimer = window.setTimeout(() => {
				focusSyncTimer = null;
				let best: string | null = null;
				let bestRatio = 0;
				for (const [path, ratio] of visibleEntries) {
					if (ratio > bestRatio) {
						best = path;
						bestRatio = ratio;
					}
				}
				if (best && best !== this.focusedScenePath) {
					this.focusedScenePath = best;
				}
			}, 120);
		};

		this.focusObserver = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const path = (entry.target as HTMLElement).dataset.scenePath;
					if (!path) continue;
					visibleEntries.set(path, entry.intersectionRatio);
					if (!entry.isIntersecting) visibleEntries.delete(path);
				}
				syncFocusedScene();
			},
			{ root: this.scrollArea, threshold: [0, 0.25, 0.5, 0.75, 1] },
		);
	}

	// ── Zapis i przywracanie stanu pozycji scrolla/kursora ────────

	private captureCurrentState(): void {
		try {
			const scrollTop = this.scrollArea?.scrollTop ?? 0;
			const scenePath = this.editingScenePath ?? this.focusedScenePath;
			if (!scenePath) return;

			let cursorAnchor: number | undefined;
			let cursorHead: number | undefined;
			const leaf = this.activeLeaf ?? this.embeddedLeaves.get(scenePath);
			if (leaf) {
				const cm = this.getCmView(leaf);
				if (cm) {
					const sel = cm.state.selection.main;
					cursorAnchor = sel.anchor;
					cursorHead = sel.head;
				}
			}

			_lastManuscriptState = {
				scenePath,
				scrollTop,
				cursorAnchor,
				cursorHead,
			};
		} catch {
			/* best effort */
		}
	}

	private restoreStateAfterRender(): void {
		if (!_lastManuscriptState || !this.scrollArea) return;
		const state = _lastManuscriptState;

		if (state.scrollTop > 0) {
			this.scrollArea.scrollTop = state.scrollTop;
		}

		if (!state.scenePath) return;

		const block = this.scrollArea.querySelector(
			`[data-scene-path="${CSS.escape(state.scenePath)}"]`,
		) as HTMLElement | null;
		if (!block) return;

		const editorWrap = block.querySelector('.firefly-manuscript-editor-wrap') as HTMLElement | null;
		if (!editorWrap) return;

		const mountAndFocus = async (): Promise<void> => {
			if (!this.embeddedLeaves.has(state.scenePath)) {
				await this.mountEditor(editorWrap, state.scenePath);
			}
			const leaf = this.embeddedLeaves.get(state.scenePath);
			if (!leaf) return;

			const cm = this.getCmView(leaf);
			if (cm) {
				if (typeof state.cursorAnchor === 'number' && typeof state.cursorHead === 'number') {
					try {
						cm.dispatch({
							selection: EditorSelection.single(state.cursorAnchor, state.cursorHead),
							scrollIntoView: true,
						});
					} catch { /* ignore */ }
				}
				cm.focus();
			}
		};

		void mountAndFocus();
	}

	private estimateSceneWords(scene: Scene): number {
		if (scene.wordcount) return scene.wordcount;
		return 0;
	}

	private updateStats(): void {
		if (this.footerEl && !this.focusMode) {
			this.footerEl.setText(
				`${this.renderedSceneCount} scen · ${this.totalWordCount.toLocaleString()} słów`,
			);
		}
	}

	// ── Topbar Controls (Umieszczane w firefly-topbar) ─────────────

	buildTopbarControls(rightEl: HTMLElement): void {
		rightEl.empty();

		// 1. Wyszukiwanie i zamiana
		const searchBtn = rightEl.createEl('button', {
			cls: `firefly-topbar-mode-btn${this.searchOpen ? ' is-active' : ''}`,
			attr: { 'aria-label': 'Wyszukaj i zamień w manuskrypcie' },
		});
		setIcon(searchBtn.createSpan(), 'search');
		searchBtn.createSpan({ text: 'Szukaj' });
		searchBtn.addEventListener('click', () => {
			this.toggleSearch();
			this.onStateChange?.();
		});

		// 2. Tryb skupienia (Focus mode)
		const focusBtn = rightEl.createEl('button', {
			cls: `firefly-topbar-mode-btn${this.focusMode ? ' is-active' : ''}`,
			attr: { 'aria-label': 'Tryb skupienia (Focus Mode)' },
		});
		setIcon(focusBtn.createSpan(), 'glasses');
		focusBtn.createSpan({ text: 'Skupienie' });
		focusBtn.addEventListener('click', () => {
			this.toggleFocusMode();
			this.onStateChange?.();
		});

		// 3. Czysty tekst (Plain text)
		const plainBtn = rightEl.createEl('button', {
			cls: `firefly-topbar-mode-btn${this.plainText ? ' is-active' : ''}`,
			attr: { 'aria-label': 'Czysty tekst — usuwa formatowanie znaczników linków i tagów' },
		});
		setIcon(plainBtn.createSpan(), 'file-text');
		plainBtn.createSpan({ text: 'Czysty tekst' });
		plainBtn.addEventListener('click', () => {
			this.plainText = !this.plainText;
			this.scrollArea?.classList.toggle('firefly-manuscript-plain', this.plainText);
			plainBtn.classList.toggle('is-active', this.plainText);
			this.onStateChange?.();
		});

		// 4. Blokowanie linków (Lock links)
		const lockBtn = rightEl.createEl('button', {
			cls: `firefly-topbar-mode-btn${this.lockLinks ? ' is-active' : ''}`,
			attr: { 'aria-label': 'Zablokuj linki (kursor traktuje linki i tagi atomowo)' },
		});
		setIcon(lockBtn.createSpan(), this.lockLinks ? 'lock' : 'unlock');
		lockBtn.createSpan({ text: 'Blokuj linki' });
		lockBtn.addEventListener('click', () => {
			this.lockLinks = !this.lockLinks;
			this.updateAtomicLinks();
			lockBtn.classList.toggle('is-active', this.lockLinks);
			this.onStateChange?.();
		});

		// 5. Pasek formatowania
		const fmtBtn = rightEl.createEl('button', {
			cls: `firefly-topbar-mode-btn${this.showFormattingToolbar ? ' is-active' : ''}`,
			attr: { 'aria-label': 'Pokaż/ukryj pasek narzędzi formatowania tekstu' },
		});
		setIcon(fmtBtn.createSpan(), 'type');
		fmtBtn.createSpan({ text: 'Format' });
		fmtBtn.addEventListener('click', () => {
			this.showFormattingToolbar = !this.showFormattingToolbar;
			if (this.fmtToolbarEl) {
				this.fmtToolbarEl.style.display = this.showFormattingToolbar ? '' : 'none';
			}
			fmtBtn.classList.toggle('is-active', this.showFormattingToolbar);
			this.onStateChange?.();
		});

		rightEl.createDiv('firefly-topbar-separator');

		// 6. Filtr Aktów
		const allScenes = this.reader.getAllScenes(this.plugin);
		const actsSet = new Set<string>();
		for (const s of allScenes) {
			if (s.act !== undefined && s.act !== null) actsSet.add(String(s.act));
		}
		const sortedActs = Array.from(actsSet).sort(compareActChapter);

		const actWrap = rightEl.createDiv('firefly-topbar-group');
		actWrap.createSpan({ cls: 'firefly-topbar-group-label', text: 'Akt:' });
		const actSelect = actWrap.createEl('select', { cls: 'firefly-topbar-select' });
		actSelect.addEventListener('keydown', (e: KeyboardEvent) => e.stopPropagation());

		const optAllAct = actSelect.createEl('option', { text: 'Wszystkie', value: 'all' });
		if (this.filterAct === 'all') optAllAct.selected = true;

		for (const act of sortedActs) {
			const opt = actSelect.createEl('option', { text: getActDisplayLabel(act), value: act });
			if (this.filterAct === act) opt.selected = true;
		}
		actSelect.addEventListener('change', () => {
			this.filterAct = actSelect.value;
			this.renderManuscriptContent();
		});

		// 7. Filtr Statusów
		const statusWrap = rightEl.createDiv('firefly-topbar-group');
		statusWrap.createSpan({ cls: 'firefly-topbar-group-label', text: 'Status:' });
		const statusSelect = statusWrap.createEl('select', { cls: 'firefly-topbar-select' });
		statusSelect.addEventListener('keydown', (e: KeyboardEvent) => e.stopPropagation());

		const optAllStatus = statusSelect.createEl('option', { text: 'Wszystkie', value: 'all' });
		if (this.filterStatus === 'all') optAllStatus.selected = true;

		for (const st of ['idea', 'outlined', 'draft', 'written', 'revised', 'final'] as SceneStatus[]) {
			const cfg = getStatusCfg(st);
			const opt = statusSelect.createEl('option', { text: cfg.label, value: st });
			if (this.filterStatus === st) opt.selected = true;
		}
		statusSelect.addEventListener('change', () => {
			this.filterStatus = statusSelect.value;
			this.renderManuscriptContent();
		});

		rightEl.createDiv('firefly-topbar-separator');

		// 8. Sortowanie
		const sortWrap = rightEl.createDiv('firefly-topbar-group');
		sortWrap.createSpan({ cls: 'firefly-topbar-group-label', text: 'Kolejność:' });
		const sortSelect = sortWrap.createEl('select', { cls: 'firefly-topbar-select' });
		sortSelect.addEventListener('keydown', (e: KeyboardEvent) => e.stopPropagation());

		for (const [val, label] of [
			['reading', 'Czytania'],
			['chronological', 'Chronologiczna'],
			['title', 'Tytuł'],
		] as const) {
			const opt = sortSelect.createEl('option', { text: label, value: val });
			if (this.sortMode === val) opt.selected = true;
		}
		sortSelect.addEventListener('change', () => {
			this.sortMode = sortSelect.value as typeof this.sortMode;
			this.renderManuscriptContent();
		});

		rightEl.createDiv('firefly-topbar-separator');

		// 9. Etykieta statystyk
		rightEl.createSpan({
			cls: 'firefly-topbar-group-label firefly-manuscript-topbar-stats',
			text: `${this.renderedSceneCount} scen · ${this.totalWordCount.toLocaleString()} słów`,
		});

		// 10. Przycisk Odśwież
		const refreshBtn = rightEl.createEl('button', {
			cls: 'firefly-topbar-icon-btn',
			attr: { 'aria-label': 'Odśwież manuskrypt' },
		});
		setIcon(refreshBtn, 'refresh-cw');
		refreshBtn.addEventListener('click', () => {
			this.render();
		});
	}

	private renderPlaceholder(icon: string, title: string, subtitle: string): void {
		if (!this.container) return;
		const ph = this.container.createDiv('firefly-placeholder');
		setIcon(ph.createDiv({ cls: 'firefly-placeholder-icon' }), icon);
		ph.createEl('h2', { cls: 'firefly-placeholder-title', text: title });
		ph.createEl('p', { cls: 'firefly-placeholder-subtitle', text: subtitle });
	}
}
