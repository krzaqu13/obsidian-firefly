import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import type SceneCardsPlugin from '../../main';
import {
    FIREFLY_FILE_BROWSER_VIEW_TYPE,
    FIREFLY_EVENT_AREA_CHANGED,
} from '../constants';
import type { AreaConfig } from '../models/Area';
import type { AreaId } from '../constants';

interface FileTreeNode {
    files: TFile[];
    children: Map<string, FileTreeNode>;
}

export class FireflyFileBrowserView extends ItemView {
    private plugin: SceneCardsPlugin;
    private listEl: HTMLElement | null = null;
    private headerTitleEl: HTMLElement | null = null;
    private collapsedFoldersByArea: Map<AreaId, Set<string>> = new Map();
    private folderNotes: Set<string> = new Set();
    private initializedAreas: Set<AreaId> = new Set();

    constructor(leaf: WorkspaceLeaf, plugin: SceneCardsPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return FIREFLY_FILE_BROWSER_VIEW_TYPE; }
    getDisplayText(): string { return 'Firefly — Pliki'; }
    getIcon(): string { return 'folder-open'; }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('firefly-file-browser');

        const header = container.createDiv('firefly-browser-header');
        this.headerTitleEl = header.createSpan({ cls: 'firefly-browser-title', text: 'Pliki' });

        this.listEl = container.createDiv('firefly-browser-list');

        this.refresh();

        this.registerEvent(
            this.app.workspace.on(FIREFLY_EVENT_AREA_CHANGED as any, () => {
                this.refresh();
            }),
        );

        this.registerEvent(this.app.vault.on('create', () => this.refresh()));
        this.registerEvent(this.app.vault.on('delete', () => this.refresh()));
        this.registerEvent(this.app.vault.on('rename', () => this.refresh()));

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.highlightActiveFile();
            }),
        );
    }

    async onClose(): Promise<void> {
        this.listEl = null;
        this.headerTitleEl = null;
    }

    private refresh(): void {
        if (!this.listEl) return;
        this.listEl.empty();

        const config = this.plugin.areaManager.getCurrentAreaConfig();
        const currentAreaId = this.plugin.areaManager.getCurrentAreaId();

        if (this.headerTitleEl) {
            this.headerTitleEl.setText(config.label);
        }

        const files = this.getFilteredFiles(config);

        if (files.length === 0) {
            this.listEl.createDiv({
                cls: 'firefly-browser-empty',
                text: config.rootFolder
                    ? `Brak plików w folderze "${config.rootFolder}"`
                    : 'Brak plików pasujących do filtrów tego obszaru.',
            });
            return;
        }

        // Detect folder notes
        this.detectFolderNotes(files, config.rootFolder);

        // Initialize all folders as collapsed by default only on first load of this area
        if (!this.initializedAreas.has(currentAreaId)) {
            this.initializeCollapsedFolders(currentAreaId, files, config.rootFolder);
            this.initializedAreas.add(currentAreaId);
        }

        this.renderTree(this.listEl, files, config.rootFolder, currentAreaId);
    }

    private getFilteredFiles(config: AreaConfig): TFile[] {
        let files = this.app.vault.getMarkdownFiles();

        if (config.rootFolder) {
            const normalizedRoot = config.rootFolder
                .replace(/\\/g, '/')
                .replace(/\/$/, '');
            files = files.filter(f =>
                f.path.startsWith(normalizedRoot + '/') || f.path === normalizedRoot,
            );
        }

        if (config.allowedFileTypes.length > 0) {
            files = files.filter(f => {
                const cache = this.app.metadataCache.getFileCache(f);
                const fileType =
                    cache?.frontmatter?.['type'] ??
                    cache?.frontmatter?.['Typ Notatki'] ??
                    cache?.frontmatter?.['typ notatki'];
                return config.allowedFileTypes.includes(fileType);
            });
        }

        if (config.allowedTags.length > 0) {
            files = files.filter(f => {
                const cache = this.app.metadataCache.getFileCache(f);
                const fileTags: string[] = cache?.frontmatter?.tags ?? [];
                const normalizedFileTags = fileTags.map(t =>
                    t.replace(/^#/, '').toLowerCase(),
                );
                return config.allowedTags.some(tag =>
                    normalizedFileTags.includes(tag.replace(/^#/, '').toLowerCase()),
                );
            });
        }

        // Filter out folder notes (files that match their parent folder name)
        files = files.filter(f => {
            const pathParts = f.path.replace(/\\/g, '/').split('/');
            if (pathParts.length > 1) {
                const folderName = pathParts[pathParts.length - 2];
                const fileName = pathParts[pathParts.length - 1].replace('.md', '');
                // If the file name matches the folder name, it's a folder note - hide it
                return folderName !== fileName;
            }
            return true;
        });

        return files.sort((a, b) => a.path.localeCompare(b.path));
    }

    private renderTree(container: HTMLElement, files: TFile[], rootFolder: string, areaId: AreaId): void {
        // Build a hierarchical tree structure
        const tree = this.buildFileTree(files, rootFolder);
        this.renderTreeNode(container, tree, '', areaId);
    }

    private detectFolderNotes(files: TFile[], rootFolder: string): void {
        this.folderNotes.clear();

        // Get all markdown files in the vault (not just filtered ones)
        const allFiles = this.app.vault.getMarkdownFiles();

        for (const file of allFiles) {
            const normalizedPath = file.path.replace(/\\/g, '/');

            // Check if file is within the root folder
            if (rootFolder) {
                const normalizedRoot = rootFolder.replace(/\\/g, '/').replace(/\/$/, '');
                if (!normalizedPath.startsWith(normalizedRoot + '/')) {
                    continue;
                }
            }

            const relativePath = rootFolder
                ? normalizedPath.slice(rootFolder.replace(/\\/g, '/').replace(/\/$/, '').length + 1)
                : normalizedPath;

            const parts = relativePath.split('/');
            if (parts.length > 1) {
                const folderName = parts[parts.length - 2];
                const fileName = parts[parts.length - 1].replace('.md', '');

                // If file name matches folder name, it's a folder note
                if (folderName === fileName) {
                    // The folder path should be the path WITHOUT the last folder name
                    // e.g., for "Książka/Choć cień nadziei/Choć cień nadziei.md"
                    // the folder path should be "Książka/Choć cień nadziei"
                    const folderPath = parts.slice(0, -1).join('/');
                    this.folderNotes.add(folderPath);
                }
            }
        }
    }

    private initializeCollapsedFolders(areaId: AreaId, files: TFile[], rootFolder: string): void {
        const collapsedSet = new Set<string>();
        this.collapsedFoldersByArea.set(areaId, collapsedSet);

        const tree = this.buildFileTree(files, rootFolder);
        this.addFolderPathsToSet(collapsedSet, tree, '');
    }

    private addFolderPathsToSet(collapsedSet: Set<string>, node: FileTreeNode, folderPath: string): void {
        // Add all child folder paths to the collapsed set
        if (!node.children) {
            return;
        }

        for (const [folderName, childNode] of node.children.entries()) {
            const fullFolderPath = folderPath ? `${folderPath}/${folderName}` : folderName;
            collapsedSet.add(fullFolderPath);
            this.addFolderPathsToSet(collapsedSet, childNode, fullFolderPath);
        }
    }

    private buildFileTree(files: TFile[], rootFolder: string): FileTreeNode {
        const root: FileTreeNode = { files: [], children: new Map() };

        for (const file of files) {
            const relativePath = rootFolder
                ? file.path.slice(rootFolder.replace(/\\/g, '/').replace(/\/$/, '').length + 1)
                : file.path;

            const parts = relativePath.split('/');
            let currentNode = root;

            // Navigate/create folder structure
            for (let i = 0; i < parts.length - 1; i++) {
                const folderName = parts[i];
                if (!currentNode.children.has(folderName)) {
                    currentNode.children.set(folderName, { files: [], children: new Map() });
                }
                const nextNode = currentNode.children.get(folderName);
                if (nextNode) {
                    currentNode = nextNode;
                }
            }

            // Add file to current node
            currentNode.files.push(file);
        }

        return root;
    }

    private renderTreeNode(container: HTMLElement, node: FileTreeNode, folderPath: string, areaId: AreaId): void {
        const collapsedFolders = this.collapsedFoldersByArea.get(areaId) || new Set();

        // Render files in current node
        for (const file of node.files) {
            this.renderFileItem(container, file);
        }

        // Render child folders
        if (!node.children) {
            return;
        }

        const sortedFolders = Array.from(node.children.keys()).sort((a, b) => a.localeCompare(b));

        for (const folderName of sortedFolders) {
            const childNode = node.children.get(folderName);
            if (!childNode) continue;

            const fullFolderPath = folderPath ? `${folderPath}/${folderName}` : folderName;
            const isCollapsed = collapsedFolders.has(fullFolderPath);
            const hasFolderNote = this.folderNotes.has(fullFolderPath);

            const folderEl = container.createDiv('firefly-folder-item');
            folderEl.setAttribute('data-folder-path', fullFolderPath);

            // Chevron icon for expand/collapse
            const chevronEl = folderEl.createSpan({ cls: 'firefly-folder-chevron' });
            setIcon(chevronEl, isCollapsed ? 'chevron-right' : 'chevron-down');

            // Folder icon
            const folderIcon = folderEl.createSpan({ cls: 'firefly-folder-icon' });
            setIcon(folderIcon, 'folder');

            // Folder name
            const folderNameEl = folderEl.createSpan({ cls: 'firefly-folder-name', text: folderName });

            // Style folder name if it has a folder note
            if (hasFolderNote) {
                folderNameEl.addClass('has-folder-note');
                folderNameEl.addClass('clickable');
            }

            // Click handler for expand/collapse on chevron
            chevronEl.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.toggleFolder(fullFolderPath, areaId);
            });

            // Click handler for folder name (folder note)
            if (hasFolderNote) {
                folderNameEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this.openFolderNote(fullFolderPath);
                });
            }

            // Click handler for expand/collapse on folder item (click on folder icon or empty space)
            folderEl.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.toggleFolder(fullFolderPath, areaId);
            });

            // Children container
            const childrenContainer = container.createDiv('firefly-folder-children');
            childrenContainer.setAttribute('data-folder-parent', fullFolderPath);
            if (isCollapsed) {
                childrenContainer.style.display = 'none';
            }

            this.renderTreeNode(childrenContainer, childNode, fullFolderPath, areaId);
        }
    }

    private toggleFolder(folderPath: string, areaId: AreaId): void {
        const collapsedFolders = this.collapsedFoldersByArea.get(areaId);
        if (!collapsedFolders) return;

        const isCollapsed = collapsedFolders.has(folderPath);

        if (isCollapsed) {
            collapsedFolders.delete(folderPath);
        } else {
            collapsedFolders.add(folderPath);
        }

        // Always do a full refresh for reliability
        this.refresh();
    }

    private updateFolderUI(folderPath: string, isExpanded: boolean, areaId: AreaId): void {
        if (!this.listEl) return;

        // Find the folder element
        const folderEl = this.listEl.querySelector(`[data-folder-path="${folderPath}"]`);
        if (!folderEl) return;

        // Update chevron icon
        const chevronEl = folderEl.querySelector('.firefly-folder-chevron');
        if (chevronEl) {
            setIcon(chevronEl, isExpanded ? 'chevron-down' : 'chevron-right');
        }

        // Find and toggle children container - use querySelector to be more reliable
        const childrenContainer = folderEl.parentElement?.querySelector(`.firefly-folder-children[data-folder-parent="${folderPath}"]`);
        if (childrenContainer) {
            childrenContainer.style.display = isExpanded ? 'block' : 'none';
        }
    }

    private openFolderNote(folderPath: string): void {
        const config = this.plugin.areaManager.getCurrentAreaConfig();

        // Build the correct path: rootFolder/folderPath/folderName.md
        // folderPath might be like "Książka/Choć cień nadziei"
        const folderName = folderPath.split('/').pop()!;
        const fullPath = config.rootFolder
            ? `${config.rootFolder.replace(/\\/g, '/')}/${folderPath}/${folderName}.md`
            : `${folderPath}/${folderName}.md`;

        const file = this.app.vault.getAbstractFileByPath(fullPath);
        if (file instanceof TFile) {
            this.app.workspace.openLinkText(fullPath, '', false);
        }
    }

    private renderFileItem(container: HTMLElement, file: TFile): void {
        const activeFile = this.app.workspace.getActiveFile();
        const isActive = activeFile?.path === file.path;

        const item = container.createDiv({
            cls: `firefly-file-item${isActive ? ' is-active' : ''}`,
            attr: { 'data-path': file.path },
        });

        const iconEl = item.createSpan({ cls: 'firefly-file-icon' });
        setIcon(iconEl, 'file-text');
        item.createSpan({ cls: 'firefly-file-name', text: file.basename });

        item.addEventListener('click', (e) => {
            const newLeaf = e.ctrlKey || e.metaKey;
            this.app.workspace.openLinkText(file.path, '', newLeaf);
        });
    }

    private highlightActiveFile(): void {
        if (!this.listEl) return;
        const activeFile = this.app.workspace.getActiveFile();

        this.listEl.querySelectorAll('.firefly-file-item').forEach(el => {
            const path = el.getAttribute('data-path');
            el.classList.toggle('is-active', path === activeFile?.path);
        });
    }
}
