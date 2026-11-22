# Upgrades — plan

The user's wishlist (`resources/upgrades.md`, their own file: never commit it) consolidated
into stages, with their answers (2026-11-21). Written so a new session can pick it up.

## 0. Resume here

**State (2026-11-21):** **U1 to U7 and review round 1 are built and committed.** The
backlog (section 2) is next, to plan with the user.
The "as built" notes below each stage say what changed and what wasn't verified.

- Environment, checks, test server on a database copy, the headless screenshot recipe and
  the user's working style: `resources/signal chain digital twin/BUILD_PLAN.md`, section 0
  (it applies to the whole app, not only the twin).
- Build a stage whole, run the checks, take screenshots, update this file, then let the
  user review. Commit only when they say so; leave `resources/upgrades.md`,
  `resources/19hz.ipynb` and `data/adventure.db` out of every commit.
- Backend edits restart the user's server (auto-reload) and run `init_db` on the real
  database: new columns must go through `_add_missing_columns` and stay idempotent.

## 1. Stages

Order: small app-wide fixes first, then the Nexus, the Alembic rule, the time model, views,
chrome, the Codex. The backlog (section 2) is planned later, not built here.

### U1. Cards and type

- **Titles in normal case**, not full caps: trading cards (`.tcard-title` in
  `frontend/styles.css`), Alembic action labels, anywhere else a title is uppercased
  (68 `text-transform: uppercase` rules: keep them for labels and chrome, drop them for
  titles).
- **The cover image always shows**:
  - Nexus: see U2 (the card and its cover become one).
  - Crucible (`QuestsPanel.js`): its card shows the cover image.
  - Maps: a cover thumbnail on Atlas markers is a maybe (the wishlist has a "?"); try it
    once U2's image path exists and show the user.

**U1 as built (2026-11-21):** `text-transform: uppercase` dropped (and letter-spacing
tightened to 0.02em) on the title rules: `.tcard-title`, `.lm-title` (Atlas cards),
`.cls-card-banner` (Nexus cards), `.alm-label span` (Alembic actions), `.scr-title`,
`.ql-title`; labels and chrome stay in caps. Crucible (`QuestsPanel.js`): `QuestHeader`
shows the cover image with the title over it (`.ql-cover`), plain title when there's none
or it fails to load. Not done yet: covers on Atlas markers (a maybe, after U2's image
proxy). Headless screenshots don't load external images, so the covers themselves are
unverified.

### U2. Nexus (`ClassifierPanel.js`, `lib/classifierScene.js`, `lib/classifierGraph.js`)

- **Portal → spherical region.** Drop the portal's rings, disc and swirl
  (`_buildPortal`). Draw a faint sphere around the centre: every galaxy inside passes, every
  one outside doesn't. The layout already pulls passing galaxies to `PORTAL_ORBIT`; make the
  sphere's radius fit them (and keep failing ones outside it).
- **One card per item.** Today an item is a sprite card (`_cardTexture`) and, up close, a
  separate HTML card with the cover image (`_card`, `CARD_DISTANCE`, `MAX_CARDS`). Merge
  them: the 3D card carries the cover image at every distance. Cover URLs are on other
  sites, and WebGL can't use an image without CORS, hence the question in section 3.
- **Cards still when idle.** They drift because each galaxy bobs (`bob = sin(time…)`) and
  its cards orbit it (`spin = time * 0.15`, in `_frame`). Remove both: cards move only when
  the topology changes (filters, layers, collapse, items). Also check the one-minute
  `tick` (items turning past) doesn't re-run the layout and nudge everything.
- **Un-collapsing should bring the cards back** (bug): collapsing hides galaxies
  (`g.hidden` in `classifierGraph.js`); find why they don't come back with their cards.
- **Refinery edits show at once.** After "Done" in the Refinery editor, the Nexus lags.
  `updateAdventure` already applies the server's record to the store; diagnose where the
  delay comes from (the editor's save timing, the Nexus memo's inputs, or the layout).
- **Animated clustering:** when the topology changes, galaxies glide to their new places
  (they already lerp; make re-clustering read as a deliberate motion, not a jump).
- **Parent stars as icons:** replace the plain spheres with a sigil showing what the star
  is (the facet: matter, source, city, type, pillar, site, contact, …), in the magic-circle
  style the user likes (`lib/magicCircle.js`).

**U2 as built:** `lib/classifierScene.js`: the portal became the region, a fresnel sphere
(`REGION_R` = 110, exported from `classifierGraph.js`) with an equator line and the pass
count above it; the layout keeps passing galaxies inside it and failing ones (and every
star: new `STAR_SHELL`) outside, with a final clamp. One card per item: a canvas texture
(240×340: foil frame, title, cover, matter strip) drawn when its galaxy first opens up and
redrawn when the item's title, cover, colour or matter change (that was the Refinery
"delay": the old HTML cards were cached forever); the HTML cards and their CSS are gone.
Covers load through **`/api/cover?url=`** (`backend/services/covers.py`,
`routers/media.py`): public hosts only (resolved IPs checked, every redirect hop too),
images only, 8 MB max, cached in `data/covers/` (gitignored). Galaxies no longer bob or
spin; the layout re-runs only when the topology key (stars, roles, collapse, galaxies,
passes, sizes) changes, and bodies glide there (eased, 1.4 s). Stars are medallion icons
(`lib/starIcons.js`, canvas line drawings per facet: source, city, registration, each
type, matter, pillar, site, contact, organization, skill, date, ring, seal). **The
un-collapse bug** was an id clash: a galaxy linked to exactly one star had that star's id,
so it never got a position and sat hidden at the centre; galaxy ids are now
`galaxy:…`. ⌂ button: `scene.fit()`. Not done: Atlas cover thumbnails (the maybe).

### U3. Alembic: colours follow the roadmap, and the roadmap moves the phase

The user's rule (2026-11-21):

- **Distillate (Alembic, `decomposing`):** every action is yellow. This is the stage of
  distilling actions.
- **The first action marked complete** starts building: the adventure becomes **alloy**
  (Crucible, `constructing`). Incomplete actions turn orange; complete ones turn red.
- **When everything is complete** and the adventure is promoted to animus, artifact or
  relic, every action takes the colour of that matter.
- **It reverses.** Marking an action incomplete again on an animus (or later) adventure
  sends the whole adventure back to alloy. (See section 3 for unmarking the last
  complete action.)

Build:
- Server: `backend/services/roadmap.py` (`set_roadmap`) works out the phase after each
  save and moves the adventure with `_set_phase` (`triage.py`), so the transitions log, the
  twin's slugs and the broadcasts follow on their own. Only for adventures in
  `decomposing` or later; never for `killed` (or `queued` / `classifying`).
- `triage.set_phase` (moves by hand) must agree with the rule (section 3).
- Frontend: `lib/alembicScene.js` colours by (phase, action state); locked / ready / done
  stay readable by brightness and fill, not hue. `AlembicPanel.js`'s Promote button keeps
  working; the Crucible's quest list takes the same colours.
- Checks: extend `scripts/check_transitions.py` with roadmap edits (first complete →
  constructing, last uncomplete on consuming → constructing, …) and their log entries.

**U3 as built:** `backend/services/roadmap.py`: `phase_for(phase, roadmap)` runs after
every save (`save_roadmap`) and moves the adventure with `_set_phase` (logged and
broadcast like any move). `triage.set_phase`: by hand to consuming, completed or
decommissioned marks every action done. Frontend: `roadmapColors(phase)` in
`lib/roadmap.js` (todo/done colours), `AlembicScene.setColors` (looks, lit pipes, packets,
sparks; the import is `alembicScene.js?v=3`), the panel's `--todo` / `--done`. Checks:
`check_transitions.py` walks the whole rule. **Existing data is not migrated**: Cyberdeck
(0/3) and Step Sensor (0/10) are alloy with nothing done and drop to distillate on their
next roadmap save; ask the user before moving them.

### U4. The time model: Refinery editor and Calendar

Backend (`Adventure` in `backend/db/models.py`, `schemas/adventures.py`,
`services/adventures.py`, new columns via `_add_missing_columns`):
- `all_day` (bool): the event spans whole days, from its start date to its end date.
- `recurrence` (JSON or null): `{"freq": "weekly", "days": [0..6], "until": date|null}`.
  Weekly only for now (the user: enough).
- `costs`, `rewards` (text, for now).
- `sweep_missed` (`triage.py`) must not kill a recurring event after its first
  occurrence: it ends at `until`, or never.

Refinery editor (`AdventureEditor.js`):
- **Time:** a one-off / weekly switch. 24-hour clock (00:00–24:00), minutes snap to
  quarter hours. A whole-day toggle: pick a date range, no times. Weekly: the weekdays,
  start and end time, an optional end date.
- **Address:** accept Plus Codes as well as `lat, lon` (see section 3).
- **Costs and rewards:** two text fields.

Calendar (`CalendarPanel.js`, `calendarLayout.js`):
- **Month view** next to the week view.
- **All-day events** as banners at the top of each day they span, not filling the day.
- **Weekly events** appear on every occurrence in view.
- The date-range filter (`filters.js`, `passes`) counts an item as in range when any
  occurrence falls in it.

**U4 as built:** columns `all_day`, `recurrence`, `costs`, `rewards` (nullable; the user's
server added them to the real database on reload). `Recurrence` schema (weekly; days
0–6; until). Raw events send `all_day: false, recurrence: null`. `sweep_missed` refines
in Python (`_really_ended`): all-day ends after its last day, weekly after `until` (+2
days, every zone) or never. Frontend: `lib/occurrences.js` (first occurrence, occurrences
in a range, span) drives `filters.js` (`inDateRange`, the Seal), `calendarLayout.js`
(`layoutWeek` → `{ days, banners, bannerRows }`, `layoutMonth`) and `formatEventWhen`
(24-hour; all-day and weekly forms). Calendar: Week / Month switch (localStorage
`calendar-view`), all-day banner row, month grid (4 entries a day, then "+N more"; the
day number opens its week). Editor: `WhenEditor` (one-off / weekly, timed / all day,
hour + quarter-hour selects, 24:00 for ends, weekday chips, until), Costs and Rewards
fields, "Coordinates or Plus Code". **Plus Codes**: `backend/services/geo.py` (Open
Location Code decode, short-code recovery, Nominatim geocoding of the locality, cached)
and `GET /api/geo/plus-code?q=`; checked on Zurich, Irvine and Sydney codes. Times are
the viewer's local time (weekly occurrences keep the first one's local time of day).

### U5. Views

- **Atlas:** remove the arcs, a leftover of the old map (`_buildArcs` in
  `lib/levelMap.js`: curved lines with travelling packets from the first marker to all
  others), and everything that only served them.
- **Home buttons:** a ⌂ "frame everything" on the Atlas, the Nexus and the Alembic, like
  the Signal Chain's.
- **Clicking a card focuses the Refinery:** selecting an item by clicking its card brings
  the Refinery panel to the top of its tab stack (`showPanel('node')`), see section 3.

**U5 as built:** `_buildArcs` and everything it fed are gone from `lib/levelMap.js`.
⌂ buttons (`.view-home`): Atlas (`LevelMap.fitAll`, below MapLibre's zoom controls), Nexus
(`scene.fit`), Alembic (`scene.fit(analysis)`). Card clicks: `selectItem` calls
`showPanel('node')` for sources classifier, calendar, map, quests, codex (the Refinery
comes to the top of its stack, or reopens; `showPanel` also makes it the panel in use).

### U6. Panel chrome (`PanelGroup.js`, `PanelTitle.js`, `styles.css`)

- **Info panels:** hovering a panel's rune icon shows what the panel is for (its
  question, its matter in and out, a line or two of help).
- **Hover animation:** the corner ornaments (`Corners`) lift slightly with a short
  mechanical motion, like a steampunk machine starting up.
- **Layout presets**, like Blender: one click switches the dock to a saved arrangement
  (see section 3). The layout lives on the server (`backend/services/workspace.py`).

**U6 as built:** rune icon hover (and keyboard focus): `.panel-info` popover with the
panel's name, flow and a line of help (`PANEL_HELP` in `PanelTitle.js`). Hover: corner
plates lift 3 px (`translate`, overshoot easing) and their gears turn 90° in six steps;
off under reduced motion. Layouts: `LayoutMenu.js` in the header (save under a name,
replace by name, switch, delete); stored as `layout_presets` in `app_state`
(`LayoutPresets` schema), store `layoutPresets` / `saveLayoutPreset` /
`applyLayoutPreset` (unknown panels dropped, pop-outs docked) / `deleteLayoutPreset`.
Not verified in a screenshot: the hover effects (headless has no hover).

### U7. Codex: new object types

- **Organization** (organizations and networks) and **skill**.
- Backend: `OBJECT_TYPES` in `models.py`, validation in `services/objects.py`.
- Frontend: `OBJECT_TYPES` in `lifecycle.js` (label, plural, glyph, hint), the object
  facets in `filters.js` and the lenses in `lib/lens.js` (`OBJECT_LENSES`), the Codex panel,
  the Nexus layers.

**U7 as built:** `organization` (⎔) and `skill` (✧) in `OBJECT_TYPES` (backend and
`lifecycle.js`), object facets and lenses (`filters.js`, `lens.js`, `FacetKey` / `LensKey`
in `schemas/state.py` and `global.d.ts`), star icons. Basic fields only (name,
description, link), as the Codex already does for pillars. Codex object names still show
in caps (U1 covered adventure and action titles only).

### Review round 1 (2026-11-21)

- Crucible: the cover runs down the left side of each card (`QuestCover`, `.ql-cover`,
  `.ql-body`), not across the top.
- Nexus: clusters burst into their cards and gather back, animated (`open`, eased over
  `BURST_S` = 0.55 s: cards fly out from the centre and grow, the body shrinks and fades;
  highlight scale `m.k` applied per frame). Its ⌂ moved to the stage's bottom-right
  (the lens row covered it).
- Codex: sites take Plus Codes too. Shared helper `lib/places.js` (`readPlace`,
  `parseCoords`, `coordsText`) used by the Codex and the Refinery.
- All panels: the rune's info popover opens over the panel content (`.glass > .plate`
  z-index 3).
- Signal Chain: transparent canvas, no ground plane: the panel's glass shows through like
  the other scenes.
- Panel flows (`PANELS_METADATA` in `backend/services/workspace.py`): Atlas matter ⟶
  space, Nexus matter ⟶ topology (matching the twin's dynamo sub-lines).

## 2. Backlog (plan later, not built in this pass)

- More visuals besides the leviathan: other fish; an aquarium, a terrarium.
- New modules: a steering wheel; the Entropy Market (costs and rewards from U4 feed it);
  the Treasury (trophies, achievements, rewards, a feedback survey); a collaborations
  tool suite.

## 3. Decisions (the user, 2026-11-21)

1. **U3, the phase rule's edges:**
   - Completing the last action on an alloy adventure: **keep the Promote button** (no
     automatic promotion).
   - Unmarking the only complete action on an alloy adventure: **back to distillate**.
   - Moving an adventure to animus or beyond by hand while actions are incomplete:
     **allowed, and every action is marked complete** (so the rule holds).
   - An adventure with no roadmap: phases move by hand as today.
2. **U2, cover images:** a server endpoint fetches and caches cover images, so the 3D
   cards load them from the app's own origin.
3. **U4, Plus Codes:** must support short codes with a locality, e.g.
   `M4RP+3R Irvine, California`: geocode the locality (server side, a public geocoder such
   as OpenStreetMap Nominatim, with a generic User-Agent and nothing about the user), then
   recover the full code near it and decode it to lat/lon. Any short code with any
   locality, in that format (the example is just an example); full codes decode offline.
4. **U5, card click → Refinery:** from every panel, and the Refinery reopens if closed.
5. **U6, presets:** the user saves their own; no built-in presets.
6. **U7, fields:** organizations and skills both get the basic fields only: name,
   description, link.
