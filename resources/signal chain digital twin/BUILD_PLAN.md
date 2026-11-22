# Signal Chain — build plan

A new dock module showing the whole pipeline as a 3D model. Every row in the database
is a packet of matter, every stage is a machine, and every panel attaches to its machine.
Filters and lenses are **light**, never plumbing.

This plan **replaces ARCHITECTURE.md** where they disagree (node list, chain order,
viewers). The core chain order comes from signal_chain.md. Treat ARCHITECTURE.md's look as
a loose guide only.

---

## 0. Status and how to resume (read this first)

This section is written so a new session with **no memory** can pick the work up. Read
all of section 0, then the phase you're about to build in section 4.

### 0.1 What this is

Adventure Engine (repo root: `~/Desktop/Adventure Engine`) is a FastAPI + SQLite backend
(`backend/`, `server.py`) with a no-build React frontend (`frontend/`: ES modules, an
import map in `index.html`, `html` tagged templates, a zustand store, Three.js scenes).
It finds events (crawled by "harvesters") and turns them into **adventures** that move
through phases. The theme is alchemical: every module is a machine, and every row is
matter.

The **Signal Chain** is a dock panel (`signal_chain`) showing that whole pipeline as a
3D digital twin. This file is its plan. `ARCHITECTURE.md` (same folder) is the original
spec, superseded wherever they disagree. `signal_chain.md` gives the chain order.

### 0.2 Where we are (2026-11-21)

Phases 0–4, 6 and 8 are built and committed. Phase 5 (the codex conveyor) is
**skipped** (the user decided 2026-11-21: unclear value). **Now: phase 7, the
aesthetics rebuild.** Its design was prototyped and approved as `atelier.html` (this
folder), and its integration plan, with the user's answers, is **`PHASE7_PLAN.md`**
(this folder). Stages 7a and 7b are done; read its "Resume here" section first, then
continue with stage 7c. Commit only when the user asks
(not one commit per stage).

| Commit | What |
|---|---|
| `b7dd63e` | phases 0–2: names, harvesters, transitions log, twin model (tables) |
| `cdfcea2` | phase 3: the 3D view |
| `a32d99e` | phase 4 (the light layer) plus the user's follow-ups: base buttons, magic circle selection, Net platform, Refiner → Refinery, Harvest cooldown, object colours |
| `20c12f0` | phase 6: lens colours in Nexus, Calendar, Atlas; the twin tooltip removed |
| `a426947` | phase 8: pop-out windows |

Run `git log --oneline -5` and `git status` first. Later commits may exist that this
file doesn't mention yet.

**Leave the user's own files out of every commit:** `resources/19hz.ipynb`,
`resources/upgrades.md`, `resources/adventure.db` (stage files by name or with
`git add -u`; never `git add -A`).

### 0.3 First steps in a new session

1. Read this section and the next phase in section 4. Skim section 1 (concept).
2. Read the files in the code map (0.7) for the area you'll touch. `twin/twinScene.js` is
   large (~1250 lines): read it in parts.
3. Before building, give the user **a short plan plus the open questions** for the phase
   (listed with the phase in section 4), and wait for answers.
4. Build the whole phase, then run the checks (0.6) and take a screenshot.
5. Update this file (status, the phase's "as built" notes, the code map), then **ask
   before committing**.

### 0.4 Working with the user

- **They decide the concept and the names.** Raise new names and behaviours with them; don't
  invent them silently. If you have to interpret an ambiguous answer, say how you read it.
- They like a short plan or a few questions before a big step, then whole phases built
  at once, then a summary of what changed and what you couldn't verify.
- **Ask before committing.** They say "commit" explicitly each time.
- **They love magic circles** (sacred geometry: concentric rings, polygrams, rune bands,
  counter-rotating layers). Whenever a marker, highlight or flourish is needed, reach for
  one and reuse `frontend/js/lib/magicCircle.js`.
- They give short feedback lists after looking at the result: expect a follow-up round
  after each phase.

### 0.5 Names (decided; use exactly these)

| Use | Never | Notes |
|---|---|---|
| **harvester** | crawler (in the UI) | the backend package `backend/crawlers/` keeps its name |
| **centrifuge** | sensorium | events `new`; matter **prima materia** (never "omen" in the UI; the internal `kind: 'omen'` stays) |
| **sump** | limbo | events `ignored` with no adventure; matter **shade** |
| **hopper** | — | `queued`; ore |
| **Refinery** | Refiner | the `classifying` machine **and** its panel (node card); node id `refinery`. Because of this, "refinery" never names the whole twin: the twin's 3D tab is "3D" |
| **Nexus** | — | the lantern: filters and lens (panel `classifier`) |
| **Treasury** | reliquary | `completed`; artifact |
| — | evaluator | deleted from the concept |
| **site** | venue (for objects) | Codex object types: pillar, site, contact; "type", not "kind" |
| **base button** | base ring | the rune collar at each vessel's base |

Some older comments call the whole app "the refinery" (the theme: `styles.css`,
`lifecycle.js`, `triage.py`, `global.d.ts`). That's left as is.

### 0.6 Environment and checks

- Python: the conda env `adventure-net` (`~/miniconda3/envs/adventure-net/bin/python`).
  The default `python3` lacks the app's dependencies (it's fine for small scripts).
- The user runs the app as `python server.py` (port 8000, **auto-reload**). The real
  database is `data/adventure.db`.
  - **Caution:** because of auto-reload, editing backend code restarts the user's server.
    `init_db` then runs at once on the real database (new columns from
    `_add_missing_columns`, one-off data migrations in `backend/db/setup.py`). Keep
    migrations idempotent and safe, and tell the user when one has run.
- Test against a **copy**: `cp data/adventure.db <scratch>/copy.db` and set
  `ADVENTURE_DB_PATH=<scratch>/copy.db`. Never write to the real database in a test.
  Test server: `ADVENTURE_DB_PATH=… <env python> -m uvicorn server:app --port 8766`.
- The workspace layout lives in server memory (it resets to `DEFAULT_LAYOUT_TREE` in
  `backend/services/workspace.py` on restart). Set it on a test server with
  `PUT /api/workspace/layout {"tree": …}`. Tree format: a leaf is
  `{"id","type":"leaf","tabs":[…],"activeTab"}`; a split is
  `{"id","type":"split","direction":"horizontal"|"vertical","ratio":<percent>,"first":…,"second":…}`.
  Panel ids: `signal_chain`, `classifier` (Nexus), `node` (Refinery), `codex`, `map`,
  `calendar`, `alembic`, `quests`, `scripter`.
- Type check the frontend (no Node project; VS Code's bundled TypeScript works):
  `node ~/.vscode/extensions/sumneko.lua-3.19.2-linux-x64/client/node_modules/typescript/lib/tsc.js -p frontend/jsconfig.json`.
  **One error is expected** and older than this work (MapPanel.js line 206).
- Run pure frontend modules in Node with `node --experimental-default-type=module`
  (there's no package.json).
- **Stopping background processes:** find the PID in one command
  (`ps -eo pid,args | grep "port 876[6]"`), then `kill <pid>` in a separate command.
  `pkill -f`, or a `ps | grep` in the *same* command line as the pattern, matches your own
  shell and kills it (exit 144).

**Checks** (run all after each phase):
- `ADVENTURE_DB_PATH=<copy> <env python> scripts/check_transitions.py`: every move
  end-to-end, the counting rules, log replay, broadcasts. Needs a fresh copy each run.
- `node --experimental-default-type=module scripts/check_twin_model.mjs http://127.0.0.1:8000`:
  the model on live data under every lens. Read-only, so it's safe against the real server.
- **Screenshots** (`scripts/twin_screenshot.py`; the docstring has the details):
  1. A Firefox profile with WebGL forced on: `<scratch>/ffprof/user.js` with
     `webgl.force-enabled`, `webgl.disabled=false`, `gfx.webrender.software`,
     `layers.acceleration.force-enabled` (all true except `webgl.disabled`).
  2. A test server on 8766 (above), and the layout you want.
  3. `python3 scripts/twin_screenshot.py &` (proxy on 8799). Env: `W`, `H`, `DELAY`,
     `CAPTURE_S`, and `EVAL` (JS run in the page after `EVAL_S` s), for example
     `EVAL="import('/frontend/js/store.js').then(function(m){var s=m.useWorkspaceStore.getState();s.setMode('adventures');s.setLens('pillar');s.selectItem('<adventure id>','twin');})"`.
     Writes (the app saving its state) pass through to the app server.
  4. `firefox --headless --profile <scratch>/ffprof --no-remote --window-size=W,H --screenshot <scratch>/shot.png http://localhost:8799/__wrap`
  5. Look at the PNG. The red box at the bottom lists canvas pixel counts and any JS
     errors.
  - Timed effects (the beam sweep, wire pulses, packets) are hard to catch. Say so when
    you couldn't see them.
  - There's no PIL in either Python. To look at one drawing up close (for example a
    magic circle), serve a tiny HTML page from a scratch folder
    (`python3 -m http.server`) and screenshot that.

### 0.7 Code map

| Area | Files |
|---|---|
| Harvest, feed, siphon, purge | `backend/services/sync.py` (harvest; sets `last_sync_time`), `backend/services/triage.py`, `backend/routers/sources.py`, `backend/routers/events.py` |
| Transitions log | `backend/services/transitions.py` (listeners, `record_many`, backfill, `REFINERY_NODE`), `backend/routers/transitions.py`, `Transition` plus `PHASE_NODES` / `*_NODE` in `backend/db/models.py` |
| DB startup and migrations | `backend/db/setup.py` (`init_db`: create tables, add missing columns, the refiner → refinery rename, backfill) |
| Virtual objects (Codex) | `backend/services/objects.py` (`_apply` validates fields incl. `color` `#rrggbb`), `backend/schemas/objects.py`, `object_to_dict` in `backend/db/queries.py`, `VirtualObject` in models.py |
| Names and colours | `frontend/js/lifecycle.js` (`REVIEW_STAGES`, `PHASE_STAGES`, `PHASE_NODES`, `OBJECT_TYPES`) |
| Filters | `frontend/js/filters.js` (`FACETS`, `passes`, `pendingChanges`, object names and chosen colours via `setObjectNames` / `chosenObjectColor`) |
| Lens and colours | `frontend/js/lib/lens.js` (`LENSES`, `lensValues`, `lensColor`, `lensLabel`, `PALETTE`, `objectColor(id)` = chosen colour or a default from the id) |
| Twin, pure | `frontend/js/lib/twinTopology.js` (nodes, pipes, `route`, `nodeStage` = the stage a base button toggles), `frontend/js/lib/twinModel.js` (levels, lit, bands, `eventNode`, `pipeFlows`, the counting check) |
| Twin, 3D (phase 7: see PHASE7_PLAN.md) | `frontend/js/lib/twin/twinScene.js` (the scene), `twin/machines.js` (bodies, heart, base), `twin/zones.js`, `twin/textures.js`, `twin/materials.js`. Pre-phase-7 notes, partly stale: `layout()` (hand-placed positions), `_buildStage` (slabs: Net, Core, Gallery), `_addMachine` (per kind; the base button collar; the codex cabinet and jars), `_buildLantern`, `_buildWires`, `_buildLight` (beam, magic circle), `update` (no hover tooltip: removed in phase 6), `relight`, `setSelection`, `play` / `_launch` (packets), `_frame*` |
| Twin, panel | `frontend/js/components/panels/SignalChainPanel.js`: the React boundary. `runAction`, `runCommand`, `toggleRing`, `turnLens`, `relightCause`, and memos for `light`, `stageFilter`, `packetStyle`, `fresh`, `selection`; the Table view (`TwinTable`) |
| Magic circles (shared) | `frontend/js/lib/magicCircle.js` (`magicCircleCanvases(size)` → `{ outer, inner }` white canvases to tint and counter-rotate) |
| Pop-out windows | `frontend/js/components/Popout.js` (`popOut`, `mountPopout`, `PopoutShell`), `dockedTree` / `poppedOut` / `popOut` / `dockPopout` / `popoutHooks` in `store.js`, `frontend/js/lib/windows.js` (`focusedWindow`, `confirmHere`), `viewOf` in `lib/resizing.js`; the ⧉ / ⇲ buttons in `PanelGroup.js` |
| Harvest cooldown | `frontend/js/lib/harvest.js` (`HARVEST_FRESH_MS` = 1 h, `freshMinutes`, `freshTitle`) |
| Nexus | `frontend/js/components/panels/ClassifierPanel.js` (the Lens row = the layer: `lensLayers`), `frontend/js/lib/classifierGraph.js` (stars: `facetColor`; `ROLE_COLORS` = the role cue), `frontend/js/lib/classifierScene.js` (`_styleStar`: role sigil = magic circle) |
| Calendar, Atlas lens colour | `itemLensColor` in `CalendarPanel.js` (`CalendarBlock`) and `MapPanel.js` (`tinted`) |
| Codex | `frontend/js/components/panels/CodexPanel.js` (`ColorPicker`, tinted glyphs) |
| Store | `frontend/js/store.js`: `transitions`, `flows`, `loadTransitions`, `addTransitions`, `setLens`, `cycleStage` (applies at once), `feedSource`, `siphonSource`, `purgeCentrifuge`, `setObjects`; `filters.lens` in `DEFAULT_FILTERS` (`filters.js`) and `backend/schemas/state.py`; types in `frontend/types/global.d.ts` |
| Interim Discovery controls | `HarvesterBar` in `frontend/js/components/ModeSwitch.js` (same harvest cooldown; can go once the twin is in use) |
| Styles | `frontend/styles.css` (twin: `.sc-*`, `.twin-*`; Codex picker: `.cx-colors`, `.cx-swatch`) |

---

## 1. Concept

### Two channels

| Channel | Carries | Can change |
|---|---|---|
| **Pipes** | matter, meaning rows (events, adventures) | only by a real stage change in the database |
| **Light** (wires and beams) | filter and lens | only how the twin *looks* |

Because of this rule, the counting rules hold whatever filter is on.

### Nodes

**Zone NET: foundry floor (`events` table)**

| Node | Kind | Holds | Controls / panel on click |
|---|---|---|---|
| **harvester: luma** | processor | its events `harvested` (flux) | **Harvest** · **Feed** · **Siphon** |
| harvesters: 19hz, ra, eventbrite | processor, **locked** | — | unlock on their own once a crawler for them is registered in `CRAWLERS` |
| **centrifuge** | processor | events `new` (prima materia) | **Purge**; click → Nexus, Discovery mode on |
| **sump** | vessel | events `ignored` *with no adventure* (shade) | Nexus, Discovery with shades shown |
| **forge** | dynamo | — (hand-made adventures enter the chain here) | Refinery + create dialog |

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
| **refinery** | processor | `classifying` / essence | Refinery (node card) |
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

Clicking a **machine** opens or focuses its panel. Pressing a vessel's **base button** (a
rune collar round its plinth) cycles that stage in the applied filter, include → exclude →
off, at once: it's the twin's own filter control, the way dragging on the calendar sets a
date range. Vessels that hold rows get a hover tooltip with counts and a
breakdown by the current lens.

### Counting rules (checked on every recount, in dev builds)

```
count(adventures) = hopper + refinery + alembic + crucible + arena + treasury + archive + necropolis
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
- **Pass through**: the hood opens and the beam sweeps the twin once, relighting it.
- **Date range / ring changes** (these apply immediately in the app): a pulse runs along
  the copper wire from the calendar or atlas into the lantern, then the relight happens.
- **Selection**: a magic circle at the base of the machine holding the selected row, in
  that row's lens colour.
- **Other views follow the lens** (phase 6): Nexus stars are always in their value's lens
  colour, whatever the filter; Calendar blocks and Atlas pins take their row's lens colour
  (under Matter that's the stage colour, as before).

### Codex conveyor

The codex is a cabinet of glass jars (⟁ pillars, ⌖ sites, ☉ contacts) that fill with the
object count. A **chain conveyor**, visually unlike the liquid pipes, runs into the refinery.
Linking an object to an adventure sends a small token along it (colour: to decide in
phase 5, probably the object's own colour). Unlinking sends one back, dimmed.

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
   call `record_many(session, entity, ids, from, to)` themselves. So do the Codex link
   deletes (`_delete_links` in `services/objects.py`):
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
| new AdventureObject | codex → refinery (`entity=link`) |
| deleted AdventureObject | refinery → codex (`entity=link`) |

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

Without history, every pipe starts at zero width. As built: for each existing row, write
its *likely path* to its current node as `synthetic` transitions, one per pipe. For
example, an adventure in the crucible gets centrifuge→hopper→refinery→alembic→crucible.
They are timestamped from `first_seen` / `created_at` / `reviewed_at` /
`phase_changed_at`. The backfill is done once, guarded by the app_state key
`transitions_backfilled`. The replay skips synthetic rows. Flows include them, but they
carry real timestamps, so they age out of the 7-day window on their own.

---

## 3. Frontend structure

Same pattern as the Alembic: a typed panel component wrapping an imperative, untyped
Three.js scene.

| File | Role |
|---|---|
| `js/lib/twinTopology.js` | pure: node list (id, zone, kind, position, panel, locked), edges, phase/review → node |
| `js/lib/twinModel.js` | pure: `twinModel({ rawEvents, adventures, objects, filters, lens, now }) → { levels: {id: {total, lit, bands}}, codex: {total, byType}, check }`; the counting rules |
| `js/lib/lens.js` | pure: `lensColor(lens, value)`. Stage → lifecycle colours; type and source → fixed colours; object facets → `objectColor`; other facets → a fixed palette by value; unknown → grey |
| `js/lib/twinScene.js` | Three.js: machines, liquid, pipes, packets (`InstancedMesh`), the lantern, wires, beam, magic circle, picking, labels and tooltip. API: `update({ nodes, pipes, levels, codex, flows, colors, sources, io, centrifugeBySource, stageFilter, light, packetStyle, fresh })`, `relight({ from })` (call before `update`), `setSelection(nodeId, color)`, `play(transitions, { replay })`, `fit()`, `dispose()`. Callbacks: `onActivate(nodeId)`, `onCommand(cmd, nodeId)`, `onRing(nodeId)` (base button), `onLens(step)` |
| `js/components/panels/SignalChainPanel.js` | React boundary: subscribes to the store, computes what the scene shows, routes callbacks to `showPanel` / `setMode` / `cycleStage` / `setLens` / harvester commands |
| store additions | `transitions` feed slice, `flows`, `lens` (saved with the filters, applied **immediately**: no draft) |
| `backend/services/workspace.py` | panel `signal_chain`, kind `twin`, name "Signal Chain", icon gear, flow `["flux", "relic"]` |

**Performance (as built):** an inactive dock tab unmounts its panel, which disposes the
scene, so nothing renders in the background (reopening replays the latest moves). The
loop holds still while a splitter is dragged (`isResizing()`). Packets are one
`InstancedMesh`, capped at 400 live at once. A burst of the same move draws at most 8
packets, the last one bigger.

---

## 4. Phases

Each phase ends with something you can look at.

### Phase 0: names and cleanup ✅
- lifecycle.js modules: Sensorium → **Centrifuge**, Limbo → **Sump**, Nexus (classifying) →
  **Refinery**. Hopper and Treasury stay.
- Centrifuge matter: omen → **prima materia**. Add the harvester stage (matter **flux**).
- Panels: the **Refinery** takes the classification role, so its title flow becomes
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
- Transitions table, `before_flush` / `after_commit` listeners, `record_many`, WS message,
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

### Phase 3: scene v1, the 3D view ✅
- Three zones; simple placeholder shapes per machine kind; liquid levels (NET and
  CORE at separate scales); pipes with √ width; live packets plus replay; hover tooltips;
  click → panel; locked machines dimmed and padlocked.
- Harvester and centrifuge buttons (Harvest / Feed / Siphon / Purge) as in-scene
  controls, plus a harvester filling up while it syncs.
- As built: `js/lib/twinScene.js`. The panel has two views, **3D** and **Table**
  (the phase 2 tables, kept for analytics); the choice is remembered per browser. ⌂
  frames everything. Packets travel at about 55 units/s, and each hop takes at least
  1.2 s. Bursts of the same move draw at most 8 packets, the last one bigger. On open,
  the latest 40 moves replay over about 5 s. Each zone's liquid has its own scale (the
  tallest vessel is 80% full; at least 20 rows for the net and 6 for the core).
- Headless screenshots: Firefox's `--screenshot` doesn't capture WebGL or run
  `requestAnimationFrame`. To look at the scene from a script, copy the canvas into a 2D
  canvas first (with `preserveDrawingBuffer`).

### Phase 4: light layer ✅
- As built (decided with the user 2026-11-20):
  - **The lens is the Nexus's layer.** The old "Layers" row is now "Lens" (single choice).
    The lens facet shows as stars; Matter shows the stage (phases in Adventures, review
    states in Discovery). Active filters still always show. The twin has a ◀ lens ▶ wheel
    on the lantern's label; the header select shows in the Table view only.
  - **Base buttons apply at once** (`cycleStage` in the store: include → exclude → off,
    mirrored into the draft). Harvesters share `review: harvested` (`nodeStage` in
    twinTopology.js). Each vessel's base is a rune collar button (big hit area) that
    lifts on hover and dips when pressed; white = included, red = excluded.
  - Relight: `relightCause` in SignalChainPanel compares applied filters. Date range →
    pulse down the calendar's wire, ring → the atlas's, facet / Seal / lens → straight to
    the beam. The beam sweeps left to right over 1.6 s; each machine takes its new liquid
    as the beam passes.
  - Packets: under the stage lens they keep the machine's colour; under any other lens
    they take the row's colour. Dim and smaller when the row fails the applied filter.
  - Selection: a **magic circle** (two counter-rotating layers) at the base of the
    machine holding the selected row, in the row's lens colour. (Replaced a spotlight;
    the user loves magic circles: reuse `magicCircle.js`.)
  - The Net has its own raised platform (`NET_Y` = 8).
  - Harvest is off (disabled, no hover) for an hour after a harvest; the reason shows in
    the harvester's tooltip.
  - Object colours: chosen in the Codex (presets, any colour, Auto). They colour Nexus
    object stars (unless excluded) and the object lenses.
  - Not checked in a screenshot (timing): the beam sweep and wire pulse. Look at these
    live.
- Also done then: Refiner → **Refinery** (the node id too; `init_db` renames logged
  `refiner` moves), the 3D view tab is now "3D", objects got a `color` column, and the
  Nexus model recomputes when objects load (it used to keep "Deleted object" labels).
- How the user's answers were read: "lens and layers are the same" → one Lens row (the
  Nexus can no longer show several facets as stars at once; active filters still show).
  "Grey out harvest" → disabled, with no hover and no click.

### Phase 5: codex cabinet and conveyor ⏭ skipped
- Skipped by the user (2026-11-21): "idek what's going on with the conveyor belt". What
  exists from phase 3 stays (cabinet, jars, the brown conveyor pipe, brass link packets).
  Don't build the rest unless the user brings it back. The notes below are kept in case
  they do.
- Jars per type, chain conveyor, link/unlink tokens.
- Already there:
  - The cabinet: `_addMachine`, `node.kind === 'cabinet'` in twinScene.js. Three jars
    (`rec.jars`, order pillar / site / contact) filled by count in `update()`
    (`rec.jarTargets`) and eased in `_frame`. They're all brass now.
  - The conveyor: the pipe `codex~refinery` with `kind: 'conveyor'` (`twinPipes` in
    twinTopology.js), drawn in `_rebuild` as a brown pipe (`conveyor` flag on the pipe
    record).
  - Link packets: transitions with `entity: 'link'` (`row_id` = object id, `ref_id` =
    adventure id; `codex → refinery` = link, `refinery → codex` = unlink). `_launch`
    draws them brass, smaller (1.4) and slower (0.6×).
  - Object colours exist: `objectColor(id)` in lens.js. The panel can pass a style for
    link transitions through `packetStyle` (it returns `null` for links today), or the
    scene can take an object-colour map.
- To do: a chain look for the conveyor (links or a moving belt instead of a tube); link
  tokens in their object's colour; unlink tokens dimmed; jars per type in a colour (or
  banded by their objects' colours); maybe the cabinet opening or a jar flaring when a
  token arrives.
- **Ask the user first:** (1) token colour: the object's own colour, or one colour per
  type? (2) Should the jars show the objects' colours (bands per object) or one colour
  per type? (3) What should the chain look like (links, a belt, glyph tiles)? Is a magic
  circle on the cabinet welcome (likely yes; see 0.4)?

### Phase 6: lens in other views, plus the tooltip fix ✅
- From the user's notes (`resources/upgrades.md`, "[signal chain]"): "cities, sources, etc
  need coloring on nexus too" and "hover panels cover base ring hitbox".
- **Nexus stars in their lens colour.** Today only object stars have a colour
  (`starColor` in `classifierGraph.js`: object colour unless excluded; other facets are
  grey when off, white when included, dark when excluded). Give every facet value its
  `lensColor(facet, value)` (lens.js already has fixed colours for source and type and a
  palette for the rest; the stage facets `phase` / `review` use the lifecycle colours).
  Keep the include/exclude state readable some other way than colour (the ＋/－ label
  prefix, the ring and ping already differ per role in `_styleStar` in
  classifierScene.js).
- **Calendar blocks and Atlas pins** coloured by the current lens (`filters.lens`), using
  `lensValues(item, lens)[0]` and `lensColor`. Today they use matter (stage) colours. Find
  where: the calendar panel and the map panel or scene under `frontend/js/components/panels/`
  and `frontend/js/lib/`.
- **Tooltip fix:** the twin's hover tooltip (`.twin-tip`, placed in `_placeLabels` in
  twinScene.js at the label position + 8px, below the label) hangs over the vessel and
  hides its base button. It has `pointer-events: none`, so it doesn't block clicks, but
  it covers the target. Move it beside the machine (for example to the right of the label,
  flipping left near the panel's edge).
- **Ask the user first:** (1) Should included and excluded stars keep a colour cue (for
  example a white or red halo ring, like the base buttons) now that the star itself is in
  its lens colour? (2) Should the Calendar and Atlas follow the lens always, or only when
  it isn't Matter? (3) Where should the tooltip go: right of the machine, or fixed in a
  corner?
- Checks: type check, `check_twin_model.mjs`, and screenshots of the Nexus, Calendar and
  Atlas under the Source and City lenses (use `EVAL` to `setLens`).
- **User's answers (2026-11-21):** (1) stars are always coloured correctly (lens colour);
  include / exclude needs a separate mechanism. (2) Calendar and Atlas always follow the
  lens (Matter = the stage colours anyway). (3) Remove the hover tooltip altogether.
- **As built:**
  - `lens.js`: `facetColor(facet, value)` (any facet; `phase` / `review` → stage colours)
    and `itemLensColor(item, lens)` (one row's colour; `item.color` under Matter).
  - Nexus stars (`classifierGraph.js`): facet stars use `facetColor`; date and ring stars
    have fixed identity colours (`DATE_COLOR` gold-tan, `RING_COLOR` cyan); the seal stays
    gold / grey. `ROLE_COLORS` now means the role cue: include white, exclude red
    `#e0524a` (same as the twin's base buttons), seal gold.
  - **Role cue** (`classifierScene.js`, interpreted by Claude): a small **magic circle**
    (`magicCircle.js`, 256 px, two counter-rotating layers, flat under the star, scale 46)
    in the role colour, plus the ping ring in the role colour. Off stars have none. The
    label keeps ＋ / － and its frame; the excluded label's dashed border is now red.
  - Calendar (`CalendarPanel.js`): blocks take `itemLensColor`; the block's subtitle shows
    the lens value (e.g. the city) instead of the matter name when the lens isn't Matter.
  - Atlas (`MapPanel.js`): `updateNodes` gets the items with `color` replaced by the lens
    colour (memoised on items, lens and objects).
  - Twin tooltip removed (`twinScene.js` `_renderTooltip`, `.twin-tip*` styles). The
    scene's `io` data is now only used by the Table view.
  - Not verified: Atlas pins up close (the screenshots were too zoomed out to see pin
    colours), and the excluded sigil is faint at the default zoom.

### Phase 7: machine detail and polish → see `PHASE7_PLAN.md` (supersedes the notes below)
- The user's "[signal chain] better aesthetics" note.
- Proper machines (centrifuge rotor cage, alembic condenser coils, crucible induction glow,
  lantern optics, armillary, astrolabe). Bottleneck highlight: a vessel glows when its
  level is high relative to what flows out of it.

### Phase 8: pop-out windows (a general dock feature) ✅
- Any panel can detach into a separate browser window sharing the same store. Closing the
  window puts the panel back in the dock.
- **User's answers (2026-11-21):** on reload, popped-out panels go back into the dock (no
  "reopen windows" prompt); no drag-out (the ⧉ button only); one panel per window; the
  window shows the full housing.
- **As built:**
  - The panel **stays in the saved tree**; `poppedOut` (store, not saved) hides it from
    the main dock through `dockedTree(tree, popped)` (app.js), which collapses a group
    left empty. So reloading, or closing the window, puts it back exactly where it was.
  - `Popout.js`: `popOut(panelId, rect)` runs in the ⧉ click (browsers allow
    `window.open` only in a click), opens a `popup` window at the panel's size and place,
    then `mountPopout` writes a standards-mode skeleton (`doc.write` with a doctype; a
    blank window is in quirks mode otherwise), a `<base>` for the app's origin, copies of
    the main head's stylesheets (later ones too, via a MutationObserver: the map's CSS
    loads on demand), and renders `PopoutShell` (a `PanelGroup` with `popout`) in its
    **own React root**. Not a portal: the vendored react-dom bundle doesn't export
    `createPortal`; a second root reading the same zustand store works the same.
  - It renders only **after the stylesheets load** (max 3 s): the Atlas sized itself to an
    unstyled, zero-height box otherwise.
  - Closing the window (`pagehide`) → `dockPopout`. ⇲ (Dock), ✕ (close panel) and Reset
    layout remove it from `poppedOut`; a store subscription then closes the window. The
    main page's `pagehide` closes every window. `showPanel` on a popped-out panel focuses
    its window (`popoutHooks.focus`).
  - Scenes (`twinScene`, `classifierScene`, `alembicScene`, `levelMap`) take
    `this.view = viewOf(parent)` and use its `requestAnimationFrame`,
    `cancelAnimationFrame`, `devicePixelRatio`, `ResizeObserver`, `performance.now` and
    `getComputedStyle`, so a popped-out scene animates while the main tab is hidden.
    `deferredResize(fn, view)`.
  - `windows.js`: `confirmHere` (Purge, delete object, type change) and `focusedWindow`
    (Calendar drag's pointerup, Alembic's Esc) act in the window the user is working in.
  - **Testing:** headless Firefox can't screenshot a second window, so the test mounts
    into an **iframe** (same cross-document situation: own document, frames, clock). The
    iframe must be mounted on its `load` (an iframe without `src` loads about:blank
    asynchronously and wipes it). Patch the iframe's `requestAnimationFrame` to a timer,
    like the screenshot hook does. Its own canvas copy covers HTML on top of WebGL, so
    check HUD elements in a second shot without the copy.
  - Seen working (iframe): Twin, Nexus and Atlas popped out with their housings; the main
    dock collapsing the emptied group; ⇲ putting the Atlas back in its old group.
  - **Not verified:** a real `window.open` window (size, position, pop-up blocker,
    `doc.write` into it) in the user's browser; OrbitControls / MapLibre dragging inside a
    real window (MapLibre listens on its own `window` for some drags).

---

## 5. Open points (small; decide along the way)
- **Not yet seen live:** the beam sweep and the wire pulse (phase 4). Ask the user
  whether they look right, or catch them in a screenshot by changing the lens through
  `EVAL` just before the capture.
- The user keeps a wider wishlist in `resources/upgrades.md` (their file: read it, never
  commit it). Outside the twin: Nexus bugs (un-collapsing doesn't reveal cards, the cover
  image doesn't always show, slow updates from the Refinery, the portal, rotating cards),
  Refinery fields (address input, rewards, event time rules), an Atlas with stray lines and
  auto-home, a Calendar month view, no full caps in titles, panel hover ornaments, Codex
  cover images and new object types, and new modules. Its "rename the Nexus to
  centrifuge?" clashes with the Centrifuge machine (Net, events `new`): raise this if it
  comes up. Codex colour is done.
- Should Feed and Purge act only on **lit** rows (those passing the applied filter)? That
  would let you feed just one city's ra events, for example. Default: everything.
- There's no sump → centrifuge path (reviving a shade sends it to the hopper). Add a
  "Reclaim" later if a purge needs undoing in bulk.
- Should harvested or centrifuge events whose time has passed be vented to the sump
  automatically (the sweeper only handles adventures today)?
- Whether synthetic backfill rows count toward pipe widths permanently.
- Panel name: "Signal Chain" for now. Its title question is "all"; the Refinery's is "why" and
  the Nexus's "which" (chosen by Claude, not yet confirmed by the user).
- Harvesters, forge and gallery positions are hand-placed in `layout()` in twinScene.js;
  they were tuned against screenshots at 1500×900. The Net platform slab (`_buildStage`)
  is sized to them: move it if they move.
- The Nexus's Lens row allows one facet as stars. If the user misses showing several at
  once, add multi-select back for stars only.
- Object colours on Calendar blocks and Atlas pins: done in phase 6 (any object lens uses
  the object's Codex colour).
