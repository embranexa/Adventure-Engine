# Signal Chain — build plan

A new dock module showing the whole pipeline as a 3D refinery. Every row in the database
is a packet of matter, every stage is a machine, and every panel attaches to its machine.
Filters and lenses are **light**, never plumbing.

This plan **replaces ARCHITECTURE.md** where they disagree (node list, chain order,
viewers). The core chain order comes from signal_chain.md. Treat ARCHITECTURE.md's look as
a loose guide only.

---

## 1. Concept

### Two channels

| Channel | Carries | Can change |
|---|---|---|
| **Pipes** | matter, meaning rows (events, adventures) | only by a real stage change in the database |
| **Light** (wires and beams) | filter and lens | only how the refinery *looks* |

Because of this rule, the counting rules hold whatever filter is on.

### Nodes

**Zone NET: foundry floor (`events` table)**

| Node | Kind | Holds | Controls / panel on click |
|---|---|---|---|
| **harvester: luma** | processor | its events `harvested` (flux) | **Harvest** · **Feed** · **Siphon** |
| harvesters: 19hz, ra, eventbrite | processor, **locked** | — | unlock on their own once a crawler for them is registered in `CRAWLERS` |
| **centrifuge** | processor | events `new` (prima materia) | **Purge**; click → Nexus, Discovery mode on |
| **sump** | vessel | events `ignored` *with no adventure* (shade) | Nexus, Discovery with shades shown |
| **forge** | dynamo | — (hand-made adventures enter the chain here) | Refiner + create dialog |

#### Harvester and centrifuge controls

| Button | On | Does | Database change |
|---|---|---|---|
| **Harvest** | harvester | sync the source; only events never harvested before come in, and the vessel fills | insert as `harvested` (an existing event is refreshed and keeps its state) |
| **Feed** | harvester | pour its stored events into the centrifuge for discovery | that source's `harvested` → `new` |
| **Siphon** | harvester | draw that source's events back out of the centrifuge | that source's `new` → `harvested` |
| **Purge** | centrifuge | send everything left in the centrifuge to the sump (confirm, showing the count) | all `new` → `ignored` |

Example workflow:
1. Harvest every source, and watch the harvesters fill.
2. Feed ra. Click the centrifuge to open Discovery, pass a few to the hopper, then Purge the rest.
3. Feed luma and 19hz together, then Siphon luma back to look at just 19hz.

Discovery already shows only `new` events, so the centrifuge is what you're discovering.
The harvesters are a staging area that Discovery never sees. The inbox indicator
(ModeSwitch) counts what's in the centrifuge. Until the twin exists, Discovery has a
**harvester bar** in the top bar with the same four buttons.

**Zone CORE: lab bench (`adventures` table, one row per phase)**

| Node | Kind | Holds (phase / matter) | Panel on click |
|---|---|---|---|
| **hopper** | vessel (bridge between the zones) | `queued` / ore | — |
| **refiner** | processor | `classifying` / essence | Refiner (node card) |
| **alembic** | processor | `decomposing` / distillate | Alembic (Scripter as a sibling tab) |
| **crucible** | processor | `constructing` / alloy | Crucible (quests) |
| **arena** | processor | `consuming` / animus | — (no panel yet) |
| **treasury** | vessel | `completed` / artifact | — |
| **archive** | vessel (end of the chain) | `decommissioned` / relic | — |
| **necropolis** | vessel (side branch) | `killed` / vestige | — |
| **codex** | cabinet (holds objects, not rows) | objects, one jar per type | Codex |
| entropy market | dynamo, **locked** | — | — |

**Zone VIEWER: back gallery (reads both tables)**

| Node | Kind | Panel on click |
|---|---|---|
| **nexus** | lantern: projects the filter and lens | Nexus |
| **atlas** | armillary sphere: sensor wired to the lantern | Atlas |
| **calendar** | astrolabe: sensor wired to the lantern | Calendar |

Clicking a **machine** opens or focuses its panel. Clicking a vessel's **base rune ring**
toggles that stage in the filter (the twin's own filter control, the way dragging on the
calendar sets a date range). Vessels that hold rows get a hover tooltip with counts and a
breakdown by the current lens.

### Counting rules (checked on every recount, in dev builds)

```
count(adventures) = hopper + refiner + alembic + crucible + arena + treasury + archive + necropolis
count(events)     = Σ harvesters + centrifuge + sump + count(adventures with an event)
```

The sump counts only ignored events **with no adventure**. Killing a crawled adventure also
marks its event `ignored`, but that row's packet is in the necropolis, so counting it in
the sump too would count it twice. Hand-made adventures (from the forge) have no event, so
they appear in the first rule but not the second.

### Light: filter, lens, selection

- **Filter = the lantern's shutters.** Rows that pass the **applied** filter are lit: glowing
  liquid, bright packets. The rest are dark ghost liquid stacked above, and dim packets.
  Each zone uses only the facets that apply to it (a type, matter or object facet is
  ignored in NET), using the facet `modes` already in filters.js.
- **Lens = the lantern's coloured glass wheel.** One facet picks the colours. `stage` is
  the default ("matter"). Lit liquid splits into bands per lens value, and packets take
  their row's colour. A row with several values (object facets) adds `1/n` to each band,
  so the bands still add up to the right total.
- **Draft pending** (the Nexus draft differs from the applied filter): the lantern's hood
  closes and the status lamp blinks amber. The beam doesn't change.
- **Pass through**: the hood opens and the beam sweeps the refinery once, relighting it.
- **Date range / ring changes** (these apply immediately in the app): a pulse runs along
  the copper wire from the calendar or atlas into the lantern, then the relight happens.
- **Selection**: a narrow spotlight follows the selected row's packet or vessel.

### Codex conveyor

The codex is a cabinet of glass jars (⟁ pillars, ⌖ sites, ☉ contacts) that fill with the
object count. A **chain conveyor**, visually unlike the liquid pipes, runs into the refiner.
Linking an object to an adventure sends a small token in that type's colour along it.
Unlinking sends one back, dimmed.

---

## 2. Data: the transitions log

Packets are **real stage changes**. The database only stores current state today, so
we add a log.

### Table `transitions`

| Column | Type | Notes |
|---|---|---|
| `id` | int, autoincrement | gives a total order for replay |
| `at` | UTCDateTime | |
| `entity` | `event` \| `adventure` \| `link` | which kind of packet |
| `row_id` | uuid | event id, adventure id, or object id for `link` |
| `ref_id` | uuid, null | for `link`: the adventure |
| `from_node` | str | node id (harvesters are `harvester:<name>`), or `outside` / `forge` / `codex` |
| `to_node` | str | node id |
| `synthetic` | bool, server_default false | backfilled, not observed |

The client looks up facet values (for lens colours) on the row in the store by `row_id`.
They are not copied into the log.

### Recording: two paths

1. **Row-by-row changes (automatic).** A SQLAlchemy **`before_flush`** listener in a new
   `backend/services/transitions.py` checks what changed on Event, Adventure and
   AdventureObject and adds Transition rows in the same transaction. This catches
   kill, revive, the sweeper and hand moves without editing each one.
2. **Bulk statements (explicit).** Harvest (`insert … on conflict`), Feed, Siphon and Purge
   change many rows with a single SQL statement, which `before_flush` never sees. They
   call `record_bulk(session, rows, from, to)` themselves:
   - Feed, Siphon and Purge select the ids they're about to move, then update them.
   - Harvest finds which `api_id`s are new by querying the existing ones before the insert.

| Change | Transition |
|---|---|
| Harvest inserts an event *(bulk)* | `outside` → `harvester:<source>` |
| Feed *(bulk)* | `harvester:<source>` → centrifuge |
| Siphon *(bulk)* | centrifuge → `harvester:<source>` |
| Purge *(bulk)* | centrifuge → sump |
| Event.review `new` → `ignored` (Ignore one event) | centrifuge → sump |
| other Event.review changes | none (the adventure's own row records it) |
| new Adventure, with an event that was `new` | centrifuge → `node(phase)` |
| new Adventure, with an event that was `ignored` | sump → `node(phase)` |
| new Adventure, no event | forge → `node(phase)` |
| Adventure.phase `a` → `b` | `node(a)` → `node(b)` (covers kill, revive, sweeper, hand moves) |
| new AdventureObject | codex → refiner (`entity=link`) |
| deleted AdventureObject | refiner → codex (`entity=link`) |

An `after_commit` listener queues a `transitions` websocket broadcast with the new rows.
The phase → node map lives in one place on each side: `models.py` (`PHASE_NODES`) and
lifecycle.js.

### API

- **WS `transitions`** `{transitions: [...]}`: live, after each commit.
- **GET `/api/transitions?since_id=&limit=`**: replay on load (the last 24 h, capped at 500).
  The twin plays these back quickly so it doesn't open frozen.
- **GET `/api/transitions/flows?days=7`**: count per edge `(from_node, to_node)` over the
  window. This drives pipe width (`r = k·√count`). It's refetched when a `transitions`
  message arrives (debounced).

Levels need **no endpoint**: the store already holds every event, adventure and object,
so the twin counts them on the client and filters with filters.js.

### Backfill (runs once, in `init_db`)

Without history, every pipe starts at zero width. For each existing row, write one
`synthetic` transition from where it came in to its current node, timestamped from
`first_seen` / `reviewed_at` / `phase_changed_at`. The replay skips synthetic rows; flows
include them only until the window has enough real data (or always: decide when we see it).

---

## 3. Frontend structure

Same pattern as the Alembic: a typed panel component wrapping an imperative, untyped
Three.js scene.

| File | Role |
|---|---|
| `js/lib/twinTopology.js` | pure: node list (id, zone, kind, position, panel, locked), edges, phase/review → node |
| `js/lib/twinModel.js` | pure: `(events, adventures, objects, filters, lens) → { nodes: {total, lit, bands}, check }`; dev check of the counting rules |
| `js/lib/lens.js` | pure: `lensColor(facet, value)`. Stage → lifecycle colours; type and source → fixed colours; other facets → a fixed palette by value; unknown → grey |
| `js/lib/twinScene.js` | Three.js: machines, liquid, pipes, packets (`InstancedMesh`), light layer, picking. `update(model)`, `play(transitions)`, `setFlows(flows)`, `dispose()` |
| `js/components/panels/SignalChainPanel.js` | React boundary: subscribes to the store, routes clicks to `showPanel` / `setMode` / filter toggles, tooltips |
| store additions | `transitions` feed slice, `flows`, `lens` (saved with the filters, applied **immediately**: no draft) |
| `backend/services/workspace.py` | panel `signal_chain`, kind `twin`, name "Signal Chain", icon gear, flow `["flux", "relic"]` |

**Performance:** render only while the tab is visible and the page has focus (pause the
animation loop otherwise). Respect `isResizing()`. Draw packets as one `InstancedMesh`
capped at about 400 live at once. When a burst is larger (a sync bringing 200 events), merge
it into slugs labelled with a count.

---

## 4. Phases

Each phase ends with something you can look at.

### Phase 0: names and cleanup ✅
- lifecycle.js modules: Sensorium → **Centrifuge**, Limbo → **Sump**, Nexus (classifying) →
  **Refiner**. Hopper and Treasury stay.
- Centrifuge matter: omen → **prima materia**. Add the harvester stage (matter **flux**).
- Panels: the **Refiner** takes the classification role, so its title flow becomes
  ore → essence. The **Nexus** keeps its name; it is now the lantern (filters and lens),
  so its flow changes to something like matter → light.
- UI says **harvester**, never crawler. The backend `crawlers/` package keeps its name
  (it's the code that scrapes).
- Update the comments in models.py and the related wording in classifier.md.
- Point ARCHITECTURE.md at this plan as the source of truth.

### Phase 1: harvesters and the transitions log (backend) ✅
- New review state `harvested`, before `new`. Harvest inserts as `harvested`. Existing
  `new` events stay in the centrifuge, so no data migration is needed.
- Endpoints: `POST /api/sources/{name}/feed`, `/siphon`, `POST /api/events/purge`.
- Transitions table, `before_flush` / `after_commit` listeners, `record_bulk`, WS message,
  replay and flows endpoints, backfill.
- Check: `scripts/check_transitions.py` (run it on a copy of the database). It harvests,
  feeds, siphons, purges, passes, ignores, kills, revives, links and sweeps. After each step
  it checks both counting rules, checks that replaying the step's transitions gives the new
  node counts, and checks that every transition was broadcast.

### Phase 2: model (frontend, no 3D yet) ✅
- `twinTopology`, `twinModel`, `lens`, store slices.
- Check: the Signal Chain panel shows the model as plain tables for now (held, lit, lens
  bars with ghosts, 7-day flows per node and pipe, latest moves). Machine names open their
  panels. `scripts/check_twin_model.mjs <server url>` checks the model on live data under
  every lens. A hand move that skips stages counts on each chain pipe it passes.

### Phase 3: scene v1, the refinery
- Three zones; simple placeholder shapes per machine kind; liquid levels (NET and
  CORE at separate scales); pipes with √ width; live packets plus replay; hover tooltips;
  click → panel; locked machines dimmed and padlocked.
- Harvester and centrifuge buttons (Harvest / Feed / Siphon / Purge) as in-scene
  controls, plus a harvester filling up while it syncs.

### Phase 4: light layer
- Lit/ghost liquid, lens bands, packet colours, the lantern with hood, status lamp, beam
  sweep, copper wires plus pulses from the atlas and calendar, selection spotlight, base-ring
  stage toggle.
- A lens control in the Nexus (clicking a facet header sets the lens), plus a small lens
  wheel on the twin.

### Phase 5: codex cabinet and conveyor
- Jars per type, chain conveyor, link/unlink tokens.

### Phase 6: lens in other views
- Calendar blocks, Atlas pins and Nexus stars coloured by the lens.

### Phase 7: machine detail and polish
- Proper machines (centrifuge rotor cage, alembic condenser coils, crucible induction glow,
  lantern optics, armillary, astrolabe). Bottleneck highlight: a vessel glows when its
  level is high relative to what flows out of it.

### Phase 8: pop-out windows (a general dock feature)
- Any panel can detach into a separate browser window: `window.open` plus a React portal
  into the child document, sharing the same store. Copy stylesheets across. Scenes use the
  child window's `requestAnimationFrame`, `devicePixelRatio` and `ResizeObserver`.
  Closing the child window puts the panel back in the dock.
- Check for `window.` / `document.` assumptions in scenes and panels first.

---

## 5. Open points (small; decide along the way)
- Should Feed and Purge act only on **lit** rows (those passing the applied filter)? That
  would let you feed just one city's ra events, for example. Default: everything.
- There's no sump → centrifuge path (reviving a shade sends it to the hopper). Add a
  "Reclaim" later if a purge needs undoing in bulk.
- Should harvested or centrifuge events whose time has passed be vented to the sump
  automatically (the sweeper only handles adventures today)?
- Whether synthetic backfill rows count toward pipe widths permanently.
- Panel name: "Signal Chain" for now.
