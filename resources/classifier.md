# Classifier & Discovery — design

Status: concept agreed 2026-11-19; parts 1–3 built, then restyled (see sections 6–7).
Related: `features.md` (adventure lifecycle phases, panel list).

## 1. Purpose

Adventures are the core objects of Adventure Engine. The **classifier** (the **Nexus**, formerly the Assay) is a
3D view of the knowledge graph around them: adventures plus the virtual objects they are
associated with. Applying filters there (and in the calendar and map) carves the full
pool of adventures into a subset, which every other module then works with.

**Discovery mode** is where raw crawled events get reviewed: the few worth keeping pass
through and become adventures; the rest are rejected.

## 2. Theme: the refinery

Adventure Engine is a technomantic refinery. The app's modules are the **machines**,
and adventures are the **matter** they process. Each stage changes what the adventure
*is* (its matter) and *where* it is (its module). Active stages are machines; resting
stages are vessels or places.

| Stage | Module | Matter | Stored value | Moves here |
|---|---|---|---|---|
| crawling | **Sensorium** | **omen** | raw: `new` | when a crawler syncs it |
| discovery review | **Augur** | judges omens | — | (Discovery mode) |
| rejected | **Limbo** | **shade** | raw: `ignored` | ignore in Discovery |
| passed, waiting | **Hopper** | **ore** | `queued` | pass in Discovery |
| classification | **Nexus** | **essence** | `classifying` | by hand |
| decomposition | **Alembic** | **distillate** | `decomposing` | by hand |
| construction | **Crucible** | **alloy** | `constructing` | by hand |
| consumption | **Arena** | **animus** | `consuming` | by hand |
| completed | **Treasury** | **artifact** | `completed` | by hand |
| killed (incl. missed) | **Necropolis** | **vestige** | `killed` | kill, or automatically when missed |
| decommissioned | **Archive** | **relic** | `decommissioned` | by hand |

- The database stores the plain values; the interface shows the themed names, so
  names can change later without touching stored data.
- **Arena** is the one stage that isn't a machine: it's real life, where the refined
  adventure leaves the factory.
- Read as a journey: omen (Sensorium) → judged by the Augur → ore (Hopper) → essence
  (Nexus) → distillate (Alembic) → alloy (Crucible) → animus (Arena) → artifact
  (Treasury) → relic (Archive). Side paths: shade (Limbo), vestige (Necropolis).
- The future analyzer (the **Spectrometer**) can chart the count of adventures per stage.
- Module ↔ panel: Sensorium = crawler and sync, Augur = Discovery mode and inbox,
  Nexus = classifier, Alembic = action roadmap, Crucible = quest log, Arena = real life.
- Matter colors run cold to warm along the lifecycle: omen slate, ore blue, essence cyan,
  distillate amber, alloy orange, animus red, artifact violet; side paths are desaturated
  (shade grey, vestige ash, relic bronze). Every view colors items by stage
  (`frontend/js/lifecycle.js`, `frontend/styles.css`).

## 3. Core objects

### Raw events (omens)
Everything the crawlers pull in (Luma, Resident Advisor, ...), stored separately from
adventures, with a review state: `new` (omen in the Sensorium), `passed` (became an
adventure) or `ignored` (shade in Limbo).

- Re-syncing never resets a review: events are matched by (source, source id).
- Most raw events are expected to end up in Limbo.

### Adventures
A separate table: events that passed through, plus adventures created by hand.

- `type`: event, song, item, ... (type-specific fields come later).
- `phase`: the stage in the table above (`queued` ... `decommissioned`).
- Stats (HP/ATK/DEF, element, rarity, ...) start empty and are set by hand in the node card.
- Adventures sit on **one level**: an adventure is never the parent of another.
- An adventure made from a raw event **links** to it (no copy). Source updates (new time,
  sold out, cancelled) flow through, while the user's own fields live on the adventure.
  If the source drops the event, the adventure keeps the last version it saw.

### Parents (virtual objects)
Objects that adventures are associated with, used to categorize and filter them.

- **Derived** — come from adventure fields and link automatically: source, city, venue,
  derived statuses (e.g. registration: open / waitlist / sold out), phase, ...
- **Explicit** — created and linked by hand: pillars (e.g. NexaGraph, Embra Nexa;
  genres count as pillars), people, ... Linking works from both the node card and the
  classifier. *(Next round, not the first build.)*
- **Keywords** — derived by parsing descriptive fields. *(Later: needs event
  descriptions, which the Luma listing API doesn't include.)*
- **Filter objects** — a filter made in another module (a map radius, a calendar date
  range) always appears in the classifier as a virtual object too.

Statuses come in several kinds, each its own parent type: derived statuses, and the
lifecycle phase. More explicit status fields come later.

## 4. State changes

```
raw event:  new ──pass──▶ passed ◀──revive── ignored
             │              │                   ▲
             │              └───────kill────────┤
             └─────────────ignore───────────────┘
```

- **Pass** (omen → ore): creates the linked adventure in the Hopper.
- **Ignore** (omen → shade): the raw event goes to Limbo.
- **Kill** (any adventure → vestige): the adventure moves to the Necropolis and its raw
  event becomes ignored. Nothing is deleted: its fields (stats, links) and the phase it
  was in are kept. Kill works from any stage.
- **Revive** (shade → passed): the raw event becomes passed. If it has an adventure in
  the Necropolis, that adventure is restored to its previous phase with all its data;
  otherwise a new adventure is created in the Hopper, the same as a first pass.
- **Missed events**: an adventure whose event ends before it reaches the Arena (still in
  the Hopper, Nexus, Alembic or Crucible) moves to the Necropolis automatically.
- **Decommission** (artifact → relic): by hand, for completed adventures old enough to
  be irrelevant.
- Pass, ignore, kill and revive will also work **in bulk on a filtered set** (later).

## 5. Discovery mode and the inbox

- One global switch flips between **two separate pools**:
  - **Adventures** (normal use): only adventures. Raw events are never in this pool.
  - **Discovery** (the Augur): only raw events. Shows omens (`new`) by default, with a
    toggle to also show shades (`ignored`) so they can be revived.
- Filters work the same way in both modes, applied to that mode's pool.
- In Discovery, the node card gets **Pass** / **Ignore** / **Revive** buttons; in
  Adventures, it gets **Kill**.
- An **inbox indicator** shows the number of omens from recent syncs and the time of the
  last sync.

## 6. Filters

### Logic
- Each parent can be set to **include**, **exclude** or **off** (cycle by clicking).
- Parents of the **same type combine with OR** (Luma OR RA); **different types combine
  with AND** (Luma AND this date range).
- The result is **one global subset**. The calendar and map always show the same subset.
- **Draft and pass-through (as built):** the Nexus edits a *draft*. Facet and Hermetic Seal
  changes stay pending (shown in the Nexus's filter tray and status light) until **Pass
  through** sends the draft's subset to the calendar and map; **Discard** drops them.
  Ranges made in the calendar or map (date range, proximity ring) apply immediately.
  The separate Filters panel was removed: the Nexus's tray replaces it.
- Collapsing a parent in the classifier is visual only. It never filters.
- The applied filter and the draft are both saved on the server (`filters`,
  `filters_draft`), so they survive a reload.

### Views filter themselves, separately from navigation
Every view applies the shared filter, including its own filter type. Navigating
(paging weeks, panning or zooming the map) **never** changes a filter; filters are only
changed through their own controls.

### Filter controls
- **Map — proximity ring:** one radial "orbital" control: a center point plus a draggable
  radius, shown on the map. Only one ring at a time. Units: miles or km. Saved places
  (e.g. home) can be used as quick centers. *(Commute-time rings later: needs routing or
  traffic data from an outside service.)*
- **City:** a separate derived filter type.
- **Calendar:** drag across days to set a date range. (Presets and time-of-day later.)

### Hermetic Seal (hidden by default, Adventures mode)
An always-present **exclude** filter, shown in the classifier as its own star. It seals
away adventures that are **past** (end time has passed), in the **Treasury**, the
**Necropolis** or the **Archive**. Switching it off shows everything, like any other
filter. Omens and shades never appear in Adventures mode, so it doesn't cover them.

## 7. Classifier visualization

A hybrid look: **space at a distance, trading cards up close.**

- **Adventures are bodies** drifting in space.
- **Parents are stars**; each pulls in the adventures linked to it.
- **Active filters are stronger stars (lenses)**: include pulls hard, exclude pushes away,
  each ringed in the color of its role.
- **The result is a portal** at the center. Adventures that pass every active filter are
  drawn into its orbit, and the portal shows the count sent on to the other modules.
  Everything else drifts outward and dims.
- **Galaxies are Venn regions:** adventures are grouped by exactly which visible parents
  they link to (only Luma = one galaxy; Luma + Downtown = another, between those stars).
- **Detail changes with zoom:** zoomed out, each galaxy is one glowing body showing its
  count; zooming in breaks it into its adventures. Exploring the classifier is like
  travelling through space.
- **As built (restyle):** no space imagery. Parents are particles (core, counter-rotating
  rings, orbiting spark, pulse) in monochrome roles: include white, exclude dim, Seal gold.
  Adventures are small trading cards in their matter color; clusters far away show a
  floating count. A faint ritual circle marks the floor and a few motes rise.
- **Up close, adventures are cards** showing the cover image and title (more fields later).
  As built, cards are HTML overlays positioned over the 3D scene (like the map's cards),
  so any image URL works without the backend fetching and re-serving images.
- **Which stars show:** always the active filters, the Hermetic Seal and the portal; other
  parent types are layers you switch on.
- **Shared selection and hover** with the node card, calendar and map.
- **Interaction (as built):** click a star to cycle its filter (include → exclude → off; the
  Seal toggles), right-click a star to collapse it, click a galaxy to fly in, click an
  adventure to select it everywhere. A Layers bar chooses which parent types show as stars.
- A custom three.js scene (not `3d-force-graph`, which isn't built for swapping detail by
  zoom level), using three r170 loaded as an ES module only when the panel opens; the map
  keeps its own older copy. Code: `frontend/js/lib/classifierGraph.js` (model + layout) and
  `frontend/js/lib/classifierScene.js` (scene).

## 8. Build order

1. **Data model and triage:** raw event review states, the adventures table and phases,
   pass / ignore / kill / revive, automatic Necropolis for missed events, Discovery mode,
   the inbox indicator, and the calendar and map switched to show adventures.
2. **Filter engine:** shared filter state, include / exclude logic, the map proximity
   ring with saved places, city filter, calendar day-range drag, the Hermetic Seal, and
   saving the filter on the server.
3. **Classifier:** the space view with stars, Venn galaxies, zoom detail, the portal,
   cards up close and shared selection.

Later rounds: explicit parents (pillars, people) and linking, manual adventure creation,
bulk actions by filter, keywords, saved and named filters, text filter expressions,
calendar presets and time-of-day, commute-time rings, the Spectrometer (analyzer).
