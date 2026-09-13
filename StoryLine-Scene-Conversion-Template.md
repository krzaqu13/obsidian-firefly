# StoryLine — AI Scene Conversion Template

Use this template to convert existing scene content (from other writing tools,
documents, or plain text) into StoryLine's markdown format. Feed this document
to an AI along with your existing scenes, and ask it to produce one `.md` file
per scene.

---

## How StoryLine stores scenes

Each scene is a **standalone markdown file** with YAML frontmatter.
All metadata lives in the `---` frontmatter block; the actual scene prose goes
in the markdown body below it.

**File layout inside a project:**

```
MyProject/
  MyProject.md              ← project file
  Scenes/
    01 - The Beginning.md   ← scene
    02 - The Chase.md       ← scene
    03 - Revelations.md     ← scene
  Characters/
    ...
  Locations/
    ...
```

### Rules

1. **Filename = scene title** (e.g. `01 - The Beginning.md` or `The Chase.md`).
   A number prefix helps keep files sorted but isn't required.
2. The `type` field must be `scene`.
3. Omit any field that has no data — do **not** include empty strings or empty lists.
4. List fields (like `characters`, `tags`) use YAML list syntax.
5. Character references use `[[wikilink]]` syntax so StoryLine can detect them.
6. Everything after the closing `---` is the scene prose (the actual manuscript text).
7. The `notes` field is for editorial comments — it goes in frontmatter, not in the body.
8. `wordcount` is calculated automatically by StoryLine — you can include it or leave it out.

---

## Scene Template — Full Example

**File:** `Scenes/01 - The Beginning.md`

```yaml
---
type: scene
title: "The Beginning"

# ── Structure ──────────────────────────────────────
act: 1
chapter: 1
# sequence: reading order — the order this scene appears in the manuscript
sequence: 1
# chronologicalOrder: the order this event happens in story time
# (only needed for non-linear narratives like flashbacks)
# chronologicalOrder: 1

# ── Point of View & Characters ─────────────────────
pov: "Elara Dawnstrike"
characters:
  - "[[Elara Dawnstrike]]"
  - "[[Tobias Dawnstrike]]"
  - "[[Ser Aldwin]]"

# ── Setting ────────────────────────────────────────
location: "[[The Iron Citadel]]"
storyDate: "Day 1"
storyTime: "morning"

# ── Status ─────────────────────────────────────────
# Options: idea | outlined | draft | written | revised | final
status: draft

# ── Story Content ──────────────────────────────────
conflict: "Elara must decide whether to trust Ser Aldwin's warning or follow her brother into the Citadel."
emotion: "tense"
# intensity: character arc intensity from -10 (setback) to +10 (breakthrough)
intensity: 3

# ── Plotlines & Themes ─────────────────────────────
tags:
  - "main-quest"
  - "sibling-bond"
  - "trust"

# ── Word Counts ────────────────────────────────────
# wordcount is auto-calculated, but you can set a target
target_wordcount: 1500

# ── Setup / Payoff Links ──────────────────────────
# Reference other scene filenames to track foreshadowing & resolution
# setup_scenes:
#   - "Scenes/00 - Prologue.md"
# payoff_scenes:
#   - "Scenes/05 - The Betrayal.md"

# ── Timeline Mode (optional) ──────────────────────
# Only needed for non-linear narratives.
# Options: linear | flashback | flash_forward | parallel | frame |
#          simultaneous | timeskip | dream | mythic | circular
# timeline_mode: linear
# timeline_strand: "main"

# ── Notes (editorial, not part of manuscript) ──────
notes: "This scene needs more sensory detail. Consider adding the smell of sulfur from the vents."
---

The Iron Citadel loomed above them, its black towers cutting into a sky the color of old bruises. Smoke curled from the geothermal vents at its base, carrying the faint stench of sulfur across the plateau.

"You don't have to do this," Ser Aldwin said, his hand resting on the pommel of his sword. He hadn't drawn it, but his fingers were white.

Elara watched her brother cross the bridge ahead of them, his back straight, his stride confident. Tobias had always walked like that — like the world owed him a clear path.

"Yes," she said. "I do."

She followed him across.

*Everything below the frontmatter closing `---` is the scene's manuscript text. Write as much or as little as you need. Use standard markdown formatting — headings, emphasis, blockquotes, line breaks — all work fine.*
```

---

## Minimal Scene — Just an Idea

For scenes that are still just concepts, you can use minimal frontmatter:

```yaml
---
type: scene
title: "The Betrayal"
act: 2
chapter: 7
status: idea
conflict: "Kael reveals he's been working with the Ash Council all along."
tags:
  - "betrayal"
  - "main-quest"
notes: "This should be a major turning point. POV might work better from Kael's perspective."
---
```

---

## Outlined Scene — Planning Stage

```yaml
---
type: scene
title: "The Escape from Port Veyra"
act: 2
chapter: 9
sequence: 14
pov: "Elara Dawnstrike"
characters:
  - "[[Elara Dawnstrike]]"
  - "[[Lyra Voss]]"
  - "[[The Merchant Prince]]"
location: "[[Port Veyra]]"
storyDate: "Day 12"
storyTime: "night"
status: outlined
conflict: "Elara and Lyra must escape the Merchant Prince's compound before his guards discover their theft."
emotion: "urgent"
intensity: 6
tags:
  - "main-quest"
  - "heist"
  - "elara-lyra"
target_wordcount: 2000
setup_scenes:
  - "Scenes/12 - The Deal.md"
notes: "Fast pacing. Short paragraphs. Focus on physical action, minimal internal monologue."
---

## Scene Outline

- Elara picks the lock on the archive room
- Lyra keeps watch and spots a patrol
- They find the map but it's incomplete — the Merchant Prince has the other half
- Chase through the harbour district
- Escape by boat, but Lyra is injured
```

---

## Flashback Scene

For non-linear narratives, set `timeline_mode` and optionally `chronologicalOrder`:

```yaml
---
type: scene
title: "The Fall of Sunhaven"
act: 2
chapter: 8
sequence: 12
chronologicalOrder: 1
pov: "Elara Dawnstrike"
characters:
  - "[[Elara Dawnstrike]]"
  - "[[Commander Aldric Dawnstrike]]"
location: "[[Sunhaven]]"
storyDate: "11 years ago"
storyTime: "evening"
status: draft
conflict: "Young Elara must choose between obeying her father's order to run or staying to fight."
emotion: "devastating"
intensity: -8
tags:
  - "backstory"
  - "father-daughter"
timeline_mode: flashback
notes: "This is the core trauma. Keep it visceral but don't over-explain."
---

She was seventeen, and the sky was on fire.
```

---

## Conversion Instructions for the AI

When you give this template to your AI, include a prompt like:

> I'm using an Obsidian plugin called StoryLine. Below are templates showing
> the exact YAML frontmatter format for scenes.
> 
> Please convert the following source material into StoryLine-compatible
> `.md` files. Rules:
> 
> 1. One file per scene.
> 2. Use the exact field names shown in the templates (camelCase where shown).
> 3. The `type` field must be `scene`.
> 4. Omit any field that has no data — do not include empty strings or empty lists.
> 5. Use YAML list syntax for array fields (`characters`, `tags`, `setup_scenes`, etc.).
> 6. Wrap character references in `[[double brackets]]` inside the `characters` list.
> 7. The `location` field should also use `[[double brackets]]`.
> 8. Put the scene's prose (manuscript text) in the markdown body after the closing `---`.
> 9. If the source has editorial notes or comments, put those in the `notes` frontmatter field — not in the body.
> 10. Set `status` based on how complete the scene is: `idea`, `outlined`, `draft`, `written`, `revised`, or `final`.
> 11. If scenes have a clear reading order, number them with `sequence`.
> 12. The filename should be `<Sequence> - <Title>.md` (e.g. `01 - The Beginning.md`).
> 13. Suggest appropriate `tags` based on themes, plotlines, or story threads.
> 14. If the story has non-linear elements (flashbacks, dreams, etc.), set `timeline_mode` accordingly.
> 
> Here is my source material:
> [paste your existing scenes here]

---

## Quick Field Reference

| Field                | Type          | Description                                                     |
| -------------------- | ------------- | --------------------------------------------------------------- |
| `type`               | string        | Must be `scene` (required)                                      |
| `title`              | string        | Scene title (required)                                          |
| `act`                | number/string | Act number or name                                              |
| `chapter`            | number/string | Chapter number or name                                          |
| `sequence`           | number        | Reading order (manuscript order)                                |
| `chronologicalOrder` | number        | In-story chronological order                                    |
| `pov`                | string        | Point of view character name                                    |
| `characters`         | string[]      | Characters present (`[[wikilinks]]`)                            |
| `location`           | string        | Scene location (`[[wikilink]]`)                                 |
| `storyDate`          | string        | Date in story (`"2026-02-17"` or `"Day 3"`)                     |
| `storyTime`          | string        | Time in story (`"14:00"` or `"evening"`)                        |
| `status`             | string        | `idea` / `outlined` / `draft` / `written` / `revised` / `final` |
| `conflict`           | string        | Main conflict or tension in the scene                           |
| `emotion`            | string        | Emotional tone (e.g. "tense", "hopeful", "devastating")         |
| `intensity`          | number        | Arc intensity from −10 (setback) to +10 (breakthrough)          |
| `wordcount`          | number        | Actual word count (auto-calculated)                             |
| `target_wordcount`   | number        | Target word count for this scene                                |
| `tags`               | string[]      | Plotlines, themes, story threads                                |
| `setup_scenes`       | string[]      | Scenes this one foreshadows (file paths)                        |
| `payoff_scenes`      | string[]      | Scenes that resolve this one (file paths)                       |
| `timeline_mode`      | string        | See timeline modes below                                        |
| `timeline_strand`    | string        | Named strand for parallel/frame narratives                      |
| `notes`              | string        | Editorial notes (frontmatter, not manuscript)                   |
| (body)               | markdown      | Scene prose — everything after the closing `---`                |

### Status progression

`idea` → `outlined` → `draft` → `written` → `revised` → `final`

### Timeline modes

| Mode            | When to use                                             |
| --------------- | ------------------------------------------------------- |
| `linear`        | Default — scene follows normal timeline                 |
| `flashback`     | Past event shown out of order                           |
| `flash_forward` | Future event shown early                                |
| `parallel`      | Separate parallel timeline (use with `timeline_strand`) |
| `frame`         | Framing narrative layer (use with `timeline_strand`)    |
| `simultaneous`  | Same moment as another scene, different POV             |
| `timeskip`      | Intentional time gap                                    |
| `dream`         | Dream, vision, or hallucination                         |
| `mythic`        | Myth, legend, or story-within-a-story                   |
| `circular`      | Scene echoes or returns to an earlier moment            |
