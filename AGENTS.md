# Firefly Plugin — Agent Guide

Obsidian plugin for narrative planning and worldbuilding.
Do not treat StoryLine or TaskGenius as the architectural source of truth.

## Quick rules

- `src/` is the real source of the app.
- Obsidian runs `main.js`, not TypeScript directly.
- If watch mode is off, keep `main.js` in sync with `src/`.
- Use vanilla Obsidian DOM APIs; no React/Vue.
- No Node.js `fs` in plugin code.
- Keep layout and area logic separate.

## Structure

```text
src/
├── main.ts
├── settings.ts
├── constants.ts
├── models/
│   ├── Area.ts
│   ├── Project.ts
│   └── Scene.ts
├── services/
│   ├── AreaManager.ts
│   ├── ProjectManager.ts
│   └── SceneReader.ts
├── layout/
│   └── FireflyLayout.ts
├── areas/
│   ├── AreaRouter.ts
│   ├── writing/
│   │   ├── WritingArea.ts
│   │   └── WritingBoard.ts
│   ├── worldbuilding/
│   ├── connections/
│   ├── databases/
│   └── dashboard/
├── views/
│   ├── FireflyMainView.ts
│   ├── FireflySidebarView.ts
│   ├── FireflyFileBrowserView.ts
│   └── ProjectSelector.ts
└── styles.css
```

## Ownership rules

- `layout/` = global shell: sidebar, topbar, main container
- `areas/<name>/` = feature-specific logic and views
- `services/` = shared logic and state
- `models/` = domain types
- `views/` = global app coordination and shared UI

Examples:
- `WritingBoard` belongs in `src/areas/writing/`
- global app shell belongs in `src/layout/`
- project/state logic belongs in `src/services/`

## Workflow

- read the target file before editing
- keep edits narrow and in the correct layer
- reload the plugin after JS changes
- reload the app after CSS changes

## Do not

- create `src/firefly` wrapper folders
- mix all area logic into one giant file
- use `innerHTML` for UI
- use React/Vue/Svelte
- treat StoryLine as authoritative architecture

## Start here

If a change is for a specific feature area, put it under `src/areas/<area>/`.
If it is app-wide shell logic, put it in `src/layout/` or `src/views/`.
If it is state/data logic, put it in `src/services/` or `src/models/`.

## Developer docs

The project also includes Obsidian developer documentation in `docs/obsidian/docs/`.
Use it as the reference for plugin APIs, view lifecycle, editor extensions, state fields, and UI patterns.
It is useful for questions about `ItemView`, `WorkspaceLeaf`, metadata caching, editor integrations, and Obsidian-specific best practices.

