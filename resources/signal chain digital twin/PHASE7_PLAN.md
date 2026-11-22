# Signal Chain Twin: Phase 7 Integration Plan

## Resume here (read first in a new session)

**State (2026-11-21):** **Phase 7 is built.** 7a and 7b are committed; 7c, 7d and 7e
are built and **not committed**: the user commits at the end ("we'll commit at the end"),
after their review of the whole phase. Expect a follow-up round of feedback; then ask
before committing (leave the user's own files out: see Gotchas).

**Before touching code:**
1. Read `BUILD_PLAN.md` section 0 (environment, test server on a database copy, the
   headless screenshot recipe, how to stop servers, the user's working style, names). Its
   phase notes before phase 7 are partly stale for the 3D scene; this file wins.
2. Open `atelier.html` (this folder) in a browser or read it: it is the approved design.
   Port from it rather than reinventing.
3. Read the code: `frontend/js/lib/twin/twinScene.js` (the scene; large, read in parts),
   `twin/machines.js`, `twin/zones.js`, `twin/textures.js`, `twin/materials.js`,
   `frontend/js/lib/twinTopology.js`, `frontend/js/components/panels/SignalChainPanel.js`.

**How the pieces fit now:**
- `SignalChainPanel.js` builds the data (`nodes`, `pipes`, `levels`, `colors`,
  `stageFilter`, `light`, `codex`, `flows`, ...) and calls `scene.update(data)`,
  `scene.play(transitions)`, `scene.setSelection(nodeId, color)`, `scene.setBloom(on)`,
  `scene.relight({ from })`. The scene calls back `onActivate(id)` (open panel),
  `onRing(id)` (cycle the stage filter), `onCommand(cmd, id)` (harvest, feed, siphon,
  purge), `onLens(step)`.
- `twinScene.js`: `layout()` (positions incl. the manifold), `_buildZones`,
  `_addMachine` (calls `buildMachine`; machines scaled by `MACHINE_SCALE` 1.5), `update`
  (hearts via `machine.heart.setBands(bands, total, cap)`, rims via `machine.setRim`),
  `_frame` (calls `machine.frame(dt, t, ease)`), `this.inUse` (a Set of node ids whose
  machine should work; empty until 7d), the old pipes (`pipePath`, built in `_rebuild`,
  bore animated in `_frame`), old packets (`play`, `_launch`, `packetMesh`), the old beam
  and wires (`_buildLight`, `_buildWires`, `relight`, `_frameBeam`, pulses), and the old
  selection circle (`setSelection`, `_frameCircle`).
- `machines.js`: `buildMachine(shop, node, ctx)` with ctx `{ color, working(), spin(),
  objects(), pending() }`. Base meshes carry `userData.ring`, body meshes `userData.id`
  (only for nodes with an action). `FOOT` = base radius per body; `PLINTH_H` = 3.4.

**7c:** built; see Progress below for what changed and what's left to verify.

**7d:** built; see Progress below.

**7e:** built; see Progress below.

**Gotchas met so far:**
- The headless screenshot copies the WebGL canvas over the page, which hides HTML labels;
  take a second shot without it if labels matter.
- The twin's canvas was opaque for bloom; with bloom removed it's transparent again (the panel's glass shows through), and the ground plane is gone.
- `git add` by name; never `git add -A` (the user's `resources/19hz.ipynb`,
  `resources/upgrades.md` stay out).
- The user's server auto-reloads on backend changes only; frontend edits need a hard
  refresh.


2026-11-21. Mirrors the Claude Doc of the same name. The design reference is
`atelier.html` in this folder: the approved prototype ("Signal Chain Atelier").
Open it in a browser (it loads three.js 0.170 from jsDelivr).

## Summary

Phase 7 rebuilds the Signal Chain's 3D view to match the approved prototype, in five
stages (7a to 7e), each built whole and checked.

- **What changes:** the 3D scene in `frontend/js/lib/twinScene.js`, a few rules in the
  topology and model, the click handling in `SignalChainPanel.js`, and one new store
  signal (which panel is in use). The Table view, the transitions log, the counting rules
  and the backend stay as they are.
- **The reference:** the prototype source (about 1,500 lines, three.js 0.170, the same
  version the app vendors) is `atelier.html` here. Machine bodies, textures and shaders
  port from it almost as written.
- **The outcome:** ornate glass-hearted machines on dark plinths, floor pipes that light
  only during real moves, silver zone walls over engraved floors, the Temper, and machines
  that work while their panel is in use.

## What the prototype settled

| Area | Decision |
| --- | --- |
| Machines | Ornate brass, gilt and copper bodies; matter colour only as accents (rings, gems, trays) |
| Vessels | Every matter-holding machine is built around a glass cylinder heart; its liquid height is the row count, split into lens bands, with ghost liquid on top for filtered-out rows |
| Dynamos | Forge, Codex, Entropy Market, Nexus, Atlas and Calendar have no heart |
| Vessel scale | Per zone: a Net heart is full at 120 rows, a Core heart at 12 |
| Temper | A glass-and-iron cylinder around the middle of the Centrifuge to Hopper pipe; its taper steps the pipe from Net width to Core width, and rings run down it during a move |
| Plinth | Dark stone under every machine; carries the pipe ports and the filter rim; machines with a panel have a magic circle turning on it |
| Clicks | Machine opens its panel; base applies the filter; machines without a panel ignore clicks |
| Filter rim | Dim normally; off-white for include; bright red for exclude |
| Selection | A magic circle on the floor in the row's matter colour; the old one closes, the new one opens |
| Panel in use | The machine itself moves (gears, pistons, hammer, boiling, stirrer); no light effects; everything else stands still |
| Pipes | On the floor: straight when aligned, a flat S-bend otherwise; dark until a move sends a short slug of light through |
| Special pipes | Codex to Refinery is a gilt plate conveyor; Entropy Market to Crucible, Arena and Treasury are gold-banded pipes |
| Routing | Harvesters merge into one trunk at a manifold; revives run Sump to Centrifuge to Hopper; kills run along the chain to the Crucible, then to the Necropolis |
| Zones | Silver walls of light, curved corner posts, a floor plaque mid near-edge; Net and Core floors are one engraved oval each, the Gallery has three medallions |
| Layout | Forge, Codex and Entropy Market on the near side; Sump and Necropolis on the far side; viewer row Atlas, Nexus, Calendar |
| Net actions | Harvest, Feed, Siphon and Purge are buttons in the machine's floating label |
| Names | Shade becomes dross; the gearbox is the Temper; dynamo sub-lines: Forge prima materia, Atlas space, Calendar time, Nexus topology |

## How it maps onto the code

The 1,250-line `twinScene.js` becomes a short orchestrator plus modules in
`frontend/js/lib/twin/`. The pure model and the React panel change only at their edges.

| File | Change |
| --- | --- |
| `store.js` | Adds the panel-in-use signal (focused tab or window; Forge = Refinery create dialog open) |
| `twinTopology.js` | Manifold for the harvesters, market pipes, kill and revive routes; no outside pipes, no sump to hopper pipe, one necropolis pipe (from the crucible) |
| `twinModel.js` | Levels, bands and flows unchanged; adds the zone capacities (120 / 12) |
| `SignalChainPanel.js` | Memos for model, light, selection, panel in use; clicks: machine opens panel, base filters; Net action buttons |
| `lib/twin/twinScene.js` | Renderer, environment map, bloom, camera, labels, orchestration |
| `lib/twin/zones.js` | Walls, corner posts, plaques, engraved floors |
| `lib/twin/machines.js` | Heart, plinth, the 17 bodies and their mechanisms |
| `lib/twin/pipes.js` | Floor pipes, slug shader, Temper, plate conveyor, market pipes |
| `lib/twin/selection.js` | Floor circle open and close |
| `lib/twin/textures.js` | Runes, magic circles (reusing `magicCircle.js`), floors, globe |

The panel still hands the scene one data object per change and gets events back
(activate, ring, command). `resizing.js` (`viewOf`) keeps pop-out windows working.

## Progress

- **7a (foundation): built 2026-11-21, committed.** Vendored the four addons
  (`frontend/vendor/three-*.js`, entries in `scripts/vendor_deps.py` and the import map;
  only the new ones were fetched). New modules: `lib/twin/materials.js` (materials and
  shape helpers), `lib/twin/textures.js` (runes, sigils, plaques, engraved floors),
  `lib/twin/zones.js` (walls, corner posts, floors, plaques). `twinScene.js`: environment
  map, warm key and cool rim lights, ACES tone mapping, bloom through EffectComposer with a
  **Glow** switch on the panel (localStorage `signal-chain.bloom`), an opaque dark ground
  (bloom needs it; the panel's glass no longer shows through), every zone on the floor, the
  new layout with the manifold, zones built from the machine positions; the old slabs,
  grid and HTML zone labels are gone. `twinTopology.js`: manifold, market pipes, one
  necropolis pipe, no outside or sump-to-hopper pipes; `route` is a shortest path over
  plain pipes (outside moves get an empty route). `check_twin_model.mjs` pins the new
  routes. Still as before (later stages): machines, pipes, packets, the lantern, beam and
  wires. `twinScene.js` moved into `lib/twin/` in 7b.
- **7b (machines): built 2026-11-21, committed.** `lib/twin/machines.js`:
  `makeShop` (extra materials, magic-circle, rune, dot and globe textures),
  `buildMachine(shop, node, ctx)` (base + heart + body; returns `group`, `height`,
  `heart.setBands`, `setRim`, `frame`, `dispose`) and the 17 bodies ported from the
  prototype, mechanisms included (they move only while `ctx.working()`, empty until 7d).
  The heart is animated: band shares in a unit-height group scaled to `rows / cap`
  (fixed caps 120 Net / 12 Core, an orange overflow ring when over). The base: dark stone,
  the filter rim (`setRim(mode)`: dim, off-white include, red exclude) for matter-holding
  machines, a turning magic circle for machines with a panel. Clicks: base meshes carry
  `userData.ring` (filter), body meshes `userData.id` only when the node has an action
  (open its panel); machines without a panel ignore clicks. Locked machines stand dark.
  The Nexus prism dims and pulses amber while a filter draft is pending (the cue kept from
  the lantern). Harvest spins the harvester's rotor (while syncing); Purge spins the
  Centrifuge. Labels: the count line in the machine's colour (`4 ore`, `1 of 4 essence
  lit`, `locked`, `8 objects`) and dynamo sub-lines (Forge prima materia, Atlas space,
  Calendar time, Nexus topology). The scene moved to `lib/twin/twinScene.js` (import path
  in `SignalChainPanel.js`); the old lantern builder, liquid segments, rotors and arrival
  glows are gone. Pipes, packets, the beam and the wires are still the old ones.
- **7c (pipes and motion): built 2026-11-21, not committed.** New `lib/twin/pipes.js`:
  `buildPipes(shop, { pipes, positions, nodes, colors })` returns `group`, `ports` (node id
  -> port angles), `temperAt`, `launch(steps, color, delay)`, `frame(dt)`, `dispose`.
  Floor pipes at y 2.4 (straight or a flat S-bend, ending at the bases), Net pipes wide
  (both ends in the Net, the manifold counts), Core narrow; market pipes gold glass with
  brass/gilt bands; the Codex conveyor (iron rails, gilt plates moving only during a link
  or unlink); brass collars and iron saddles on long pipes; the manifold hub. Slugs: the
  prototype's `slugFrag` shader, 4 per pipe, extra moves wait their turn (not dropped);
  each runs the route's steps in turn at 110 units/s, in the row's lens colour (stage
  lens: the colour of the machine it leaves, lightened), dimmed when the row fails the
  filter. Replay-on-open and bursts (8 per move, 0.12 s apart) kept. The Temper on the
  Centrifuge -> Hopper pipe (wide glass up to it, narrow after; rings run only while a slug
  is in that pipe) with its label `Temper / 120 : 12 scale`. `machines.js`: `ctx.ports`
  draws a flanged socket per pipe; `lighter` exported. New `lib/twin/selection.js`: the
  floor circle spins open on the new machine and shut on the old one. The panel's
  `selection` now passes the **matter** colour (`nodeColor` of the holding machine; it was
  the lens colour); the scene lightens it. Removed from `twinScene.js`: `pipePath`,
  packets (`packetMesh`, `_launch`'s polyline), pipe bores, the old selection circle.
  Checks: type check (only the old MapPanel error), `check_twin_model.mjs`,
  `check_transitions.py` all pass; screenshots show pipes, ports, conveyor, market pipes,
  the Temper and slugs in flight (a revive leaving the Sump). Not caught in a still: a slug
  inside the Temper, the conveyor moving, the selection open/close.
- **7d (panel in use): built 2026-11-21, not committed.** The user's rules: **strict**.
  Only the focused panel counts; focusing the Signal Chain itself leaves every machine
  still; the Forge works only while the Refinery edits an adventure it has just made
  (`editingAdventureId === selectedItemId`), not while it shows the New buttons.
  `store.js`: `focusedGroup` (the dock leaf last clicked or focused: `onPointerDownCapture`
  / `onFocusCapture` on `PanelGroup`), `focusedPopout` (set by the pop-out window's
  `focus`, cleared on `blur`, in `Popout.js`), `focusGroup(id)` (`popout:<panel>` for a
  pop-out), `blurPopout`, and the pure selector `panelInUse(state)` (the focused pop-out's
  panel, else the focused group's active tab in `dockedTree`). `showPanel` focuses the
  group it shows the panel in, so clicking a machine sets its panel in use.
  `SignalChainPanel.js`: `PANEL_MACHINES` (the table under Behaviour details) and
  `scene.setInUse(ids)`. `machines.js`: each machine has a `pace` (0..1, smoothstepped,
  0.5 s each way); `busy()` = 3 x pace and every `on ? speed : 0` became `speed x pace`,
  so mechanisms wind up and down. Reduced motion (`prefers-reduced-motion`): machines get
  dt 0 (mechanisms and base circles still; hearts, the Nexus pending cue, slugs and the
  selection still move). Checked: type check; `panelInUse` through every focus case in the
  page (click group, tab switch, twin, showPanel, pop-out focus and blur). Not checked:
  the motion itself and a real pop-out window (headless can't); the user checks live.
  Follow-ups from the user (2026-11-21): the Scripter panel also works the Crucible; the
  Nexus machine opens the Nexus panel **in Adventures mode** (its action has `mode`).
- **7e (cleanup): built 2026-11-21, not committed.** Removed from `twinScene.js`: the
  beam (`_buildLight`, `_coneGeo`, `_frameBeam`, `_sweeping`, `_sweepSpan`), the copper
  wires and pulses (`_buildWires`, `relight`), the glow sprites (`_sharedAssets`, `_glow`),
  `lightGroup`, the empty `zoneLabels`, and the hearts' delayed relight (`relightAt`,
  `pendingBands`): a filter or lens change shows at once. `SignalChainPanel.js`:
  `relightCause` and the `scene.relight` call are gone; the `light` memo keeps only the
  lens and the pending count (the Nexus prism's amber cue stays). Shade became **dross**:
  `REVIEW_STAGES.ignored.matter`, the sump's matter, the Ignore button ("Ignore → Dross"),
  the Discovery toggle ("Show dross"), comments, backend docstrings (`events.py`,
  `triage.py`, `models.py`), `classifier.md`, BUILD_PLAN.md. Internal names kept:
  `showShades` / `toggleShades`, the action flag `shades`, CSS `.shade-toggle` /
  `--m-shade`, `SHADE` in `alembicScene.js`. `check_transitions.py`: the feed, siphon and
  purge steps now count what the luma harvester already holds in the copied database (they
  assumed it empty and broke once real luma events were harvested). Checks: type check,
  `check_twin_model.mjs`, `check_transitions.py` pass; a screenshot after lens and filter
  changes shows no errors and "Dross" in the matter gauge.
- **Follow-ups after 7e (2026-11-21):** the Nexus panel works the Centrifuge and Sump only
  in **Discovery** (in Adventures it works the Nexus alone). **Bloom removed**, at the
  user's request (the Glow switch and its localStorage key are gone; the scene renders
  straight through the renderer, no EffectComposer). The four postprocessing addons stay
  vendored and in the import map, unused (`scripts/vendor_deps.py`), in case glow returns.

## Build stages

Each stage ends with the checks and a screenshot round with the user. Commit only when
the user asks (not one commit per stage).

1. **7a: Foundation.** Vendor the four three.js addons (RoomEnvironment, EffectComposer
   with RenderPass, UnrealBloomPass, OutputPass) through `scripts/vendor_deps.py` and the
   import map. Split `twinScene.js` into the `lib/twin/` modules. Add the renderer setup
   (tone mapping, environment map, bloom), materials and canvas textures. Replace the
   platforms with zones: walls, corner posts, plaques, engraved floors. Apply the new
   layout and topology (manifold, routing, market pipes). Machines stay as today's simple
   bodies for now.
   - Checks: `check_twin_model.mjs` updated for the new pipes and routes; type check;
     screenshots of the empty zones.
2. **7b: Machines.** Port the heart, plinth and every machine body. Wire the filter rim,
   the panel circle and the locked look. Labels get matter colours, sub-lines and the Net
   action buttons. Clicks switch to machine opens panel, base filters.
   - Checks: every lens and filter in the twin; the counting check still passes.
3. **7c: Pipes and motion.** Floor pipes with the slug shader replace today's packets. Add
   the Temper, the plate conveyor, the gold-banded market pipes, and the selection open
   and close.
   - Checks: `check_transitions.py` moves shown as slugs on a test server; the Temper
     during a Feed to Hopper.
4. **7d: Panel in use.** Add the store signal, the panel-to-machine map, and each
   machine's mechanism. Machines stand still otherwise.
   - Checks: open each panel in the dock and in a pop-out window; confirm the right
     machine works.
5. **7e: Cleanup.** Rename shade to dross in `lifecycle.js` and the docs. Remove the
   lantern hood, beam, wires and slabs (keeping a pending-draft cue on the Nexus). Finish
   BUILD_PLAN.md and the code map.

## Behaviour details

| Interaction | What the app does | Existing code it uses |
| --- | --- | --- |
| Click a machine | Opens its panel (Centrifuge and Sump open the Nexus in Discovery, the Nexus machine opens it in Adventures; the Forge opens the Refinery's create dialog) | `onActivate` and `showPanel` |
| Click a base | Cycles that stage's filter: include, exclude, off; applies at once | `toggleRing` and `cycleStage` |
| Click a machine with no panel | Nothing | none |
| Harvest, Feed, Siphon, Purge in a label | Run the source action; Harvest disabled for an hour after a harvest; Purge asks to confirm | `runCommand`, `HARVEST_FRESH_MS`, `confirmHere` |
| Click a pipe | Nothing (the prototype's test trigger goes) | none |
| Select a row in any panel | The floor circle closes on the old machine and opens on the new one, in the row's matter colour | the `selection` memo, with a transition in the scene |
| A transition arrives | A slug runs along each pipe step of its route, in its lens colour | `play`, `route`, `packetStyle` |

**Panel in use.** A panel counts as in use when it is the active tab of the focused dock
group, or the focused pop-out window. The Forge counts as in use while the Refinery's
create dialog is open.

| Panel | Machines that work |
| --- | --- |
| Nexus (`classifier`) | Nexus; also Centrifuge and Sump in Discovery |
| Refinery (`node`) | Refinery; the Forge while the create dialog is open |
| Alembic | Alembic |
| Crucible (`quests`), Scripter | Crucible |
| Codex | Codex |
| Atlas (`map`) | Atlas |
| Calendar | Calendar |

**Vessels.** Heart height comes from the model's existing `levels` (total, lit, bands),
divided by the zone's capacity and capped at full, with an overflow mark at the top when
full. Lens bands and ghost liquid come from those same values, so the counting rules are
untouched.

**Reduced motion.** Mechanisms and the turning circles stop. Slugs still run, because they
carry information.

## Risks, performance and testing

| Risk | Mitigation |
| --- | --- |
| Too many draw calls (rivets, tubes, coins, pipe collars) | Merge static geometry per machine and per zone; instancing for repeats; shared material cache |
| Bloom cost, or no GPU (software rendering) | A bloom switch on the panel, on by default, remembered per viewer |
| Rebuilding everything on each lens or filter change | Rebuild only the hearts and filter rims; bodies, pipes and zones are built once |
| Labels overlapping (Hopper, Temper, Codex) | Hand-tuned offsets, as in the prototype; hide sub-lines at far zoom |
| Pop-out windows | Keep `viewOf` for frames, pixel ratio and resize; the composer resizes with the canvas |
| Panel-in-use flicker as focus moves | Ease mechanisms in and out over about half a second |

Testing at each stage: `check_twin_model.mjs` (extended for the manifold, market pipes and
new routes), `check_transitions.py` on a database copy, the type check (one known old error
in `MapPanel.js`), headless screenshots (HTML over WebGL needs a second shot without the
canvas copy). Only the user can check clicks, motion and performance in their real browser.

## Decisions on the open questions (2026-11-21)

1. **Phase 4 light layer:** drop the beam sweep and the copper wires; keep a pending-draft
   cue on the Nexus.
2. **Panel in use:** the focused panel only.
3. **Packets:** slugs fully replace today's packets; Codex links show only as the plate
   conveyor moving.
4. **Vessel scale:** fixed 120 / 12, with an overflow mark at the top when full.
5. **Bloom:** a switch on the panel, on by default. (Later removed by the user: no bloom.)
6. **Commits:** not one per stage; commit when the user asks.
