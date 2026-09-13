import { TFile } from 'obsidian';
import type SceneCardsPlugin from '../../../main';
import type { AreaConfig } from '../../models/Area';

export class WritingChapterList {
    private plugin: SceneCardsPlugin;

    constructor(plugin: SceneCardsPlugin) {
        this.plugin = plugin;
    }

    render(container: HTMLElement): void {
        container.empty();
        container.addClass('firefly-chapter-list-wrap');

        const title = container.createDiv({ cls: 'firefly-chapter-title', text: 'Lista rozdziałów' });
        const list = container.createDiv({ cls: 'firefly-chapter-list' });

        const files = this.getFiles();
        if (files.length === 0) {
            list.createDiv({
                cls: 'firefly-chapter-empty',
                text: 'Brak rozdziałów pasujących do aktywnego obszaru.',
            });
            return;
        }

        for (const file of files) {
            const item = list.createDiv({ cls: 'firefly-chapter-item' });
            const fileIcon = item.createSpan({ cls: 'firefly-chapter-icon' });
            item.createSpan({ cls: 'firefly-chapter-path', text: file.path });
            item.createSpan({ cls: 'firefly-chapter-name', text: file.basename });

            item.createSpan({ cls: 'firefly-chapter-sep', text: '—' });
            item.createSpan({ cls: 'firefly-chapter-wordcount', text: this.getWordCount(file) });
            fileIcon.textContent = '☰';
        }
    }

    private getFiles(): TFile[] {
        const config = this.plugin.areaManager.getCurrentAreaConfig();
        let files = this.plugin.app.vault.getMarkdownFiles();

        if (config.rootFolder) {
            const normalizedRoot = config.rootFolder.replace(/\\/g, '/').replace(/\/$/, '');
            files = files.filter(f =>
                f.path.startsWith(normalizedRoot + '/') || f.path === normalizedRoot,
            );
        }

        if (config.allowedFileTypes.length > 0) {
            files = files.filter(f => {
                const fileType = this.getFrontmatterValue(f, 'type') ?? this.getFrontmatterValue(f, 'Typ Notatki') ?? this.getFrontmatterValue(f, 'typ notatki');
                return config.allowedFileTypes.includes(fileType as string);
            });
        }

        if (config.allowedTags.length > 0) {
            files = files.filter(f => {
                const tags = this.getFrontmatterTags(f);
                return config.allowedTags.some(tag => tags.includes(tag.toLowerCase()));
            });
        }

        return files.sort((a, b) => a.path.localeCompare(b.path));
    }

    private getWordCount(file: TFile): string {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const words = cache?.frontmatter?.wordCount ?? cache?.frontmatter?.wordcount ?? 0;
        return `${Number(words) || 0} słów`;
    }

    private getFrontmatterValue(file: TFile, key: string): string | undefined {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        return cache?.frontmatter?.[key] as string | undefined;
    }

    private getFrontmatterTags(file: TFile): string[] {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const tags = cache?.frontmatter?.tags ?? [];
        return (tags as string[]).map(t => String(t).replace(/^#/, '').toLowerCase());
    }
}
