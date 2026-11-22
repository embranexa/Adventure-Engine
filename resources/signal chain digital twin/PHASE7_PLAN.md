# Signal Chain Twin: Phase 7 Integration Plan

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
| Click a machine | Opens its panel (Centrifuge and Sump open the Nexus in Discovery; the Forge opens the Refinery's create dialog) | `onActivate` and `showPanel` |
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
| Nexus (`classifier`) | Centrifuge, Sump, Nexus |
| Refinery (`node`) | Refinery; the Forge while the create dialog is open |
| Alembic | Alembic |
| Crucible (`quests`) | Crucible |
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
5. **Bloom:** a switch on the panel, on by default.
6. **Commits:** not one per stage; commit when the user asks.
