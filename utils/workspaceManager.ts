import { App } from 'obsidian';

export interface WorkspacesInstance {
    activeWorkspace: string;
    workspaces: Record<string, any>;
    saveWorkspace: (name: string) => Promise<void>;
    loadWorkspace: (name: string) => Promise<void>;
}

export class WorkspaceManager {
    constructor(private app: App) {}

    /**
     * Retrieves the native Obsidian Workspaces plugin instance if enabled.
     */
    private getWorkspacesPlugin(): WorkspacesInstance | null {
        const internalPlugins = (this.app as any).internalPlugins;
        const plugin = internalPlugins?.getPluginById?.('workspaces');

        if (plugin && plugin.enabled && plugin.instance) {
            return plugin.instance as WorkspacesInstance;
        }

        return null;
    }

    /**
     * Saves the active workspace and switches to the requested target workspace.
     * If the workspace does not exist yet, the current workspace layout is first
     * persisted under that name, and then loaded.
     */
    public async switchWorkspace(targetWorkspaceName: string): Promise<void> {
        const instance = this.getWorkspacesPlugin();

        if (!instance) {
            console.warn("[Storyline] Native 'Workspaces' plugin is disabled.");
            return;
        }

        const currentWorkspace = instance.activeWorkspace;

        if (currentWorkspace) {
            await instance.saveWorkspace(currentWorkspace);
            await new Promise((resolve) => setTimeout(resolve, 150));
        }

        if (instance.workspaces && instance.workspaces[targetWorkspaceName]) {
            await instance.loadWorkspace(targetWorkspaceName);
        } else {
            await instance.saveWorkspace(targetWorkspaceName);
            await instance.loadWorkspace(targetWorkspaceName);
        }

        this.app.workspace.trigger('layout-change');
    }
}
