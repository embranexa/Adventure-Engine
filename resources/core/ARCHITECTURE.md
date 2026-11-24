# Core zone: architecture

What the Treasury, the Agora and the systems around them are for. Concept stage:
none of this is built except the renames listed under Vocabulary. `atelier.html` (this folder)
is an interactive prototype of every part; its rules and numbers are suggestions.

Markers: **[decided]** the user has said so. **[proposed]** suggested, not confirmed.
**[open]** needs an answer before it can be built.

## Objectives

1. **Make finishing mean something.** A completed adventure leaves a lasting record: what
   happened, what went well or badly, what to do differently, what was gained and lost.
2. **Make hard things worth starting.** Measure difficulty and resistance, and reward work
   in proportion, with rewards that are redeemed for pleasures in real life.
3. **Learn from endings.** Finished adventures yield lessons; dead ones yield causes.
4. **Show growth.** Skills level up, deities rise and fall in rank, equipment is gained, and
   the unexplored becomes explored.
5. **Stay light.** Logging must cost less than it gives back.

The tone is a classic RPG quest system: quests, trials, gear, skill trees, ceremonies.

## The parts

| Part | Role |
|---|---|
| **Treasury** | Trophy room: a gallery of artifacts, each a completed adventure |
| **Agora** | Economy: credits earned, credits spent, the ledger of both |
| **Vault** | The Agora's store of guarded assets, in a gallery like the Treasury's |
| **Necropolis** | Dead adventures, with the epitaph saying why each died |
| **Codex** | The entities that adventures serve, use and discover |

The Treasury says what an adventure *meant*; the Agora says what *moved*. Gains and losses
are stored once, in the Agora's ledger, tagged with their adventure. **[proposed]**

## Sanctum

A new signal chain zone for machines that handle what is not primary matter. **[decided]**
Members: Codex, Cohort (2026-11-23), Inventory, Agora (formerly Entropy Market), plus Pantheon and Mastery, shown
locked for now. **[decided]** Built on the signal chain 2026-11-22 with no pipes or
moves, by the user's choice; only the Codex works. Pipe topology: **[open]** (`sanctum-board.html`). Inventory holds
items' effects and displays the items, so no adventure is counted twice. **[proposed]**
Renamed in code: `entropy_market` -> `agora`. Entity links are still logged (codex <-> refinery)
but not drawn.

## Flow

    Alembic     set effort, resistance and the payout lever
       |
    Crucible    bounty locks; ticking actions pays the action share
       |
    Arena       do it
       |
    Treasury    survey -> enshrine -> completion share paid, gains recorded, favor granted
       |
    Codex       newly discovered entities

Killing an adventure at any point sends it to the Necropolis with an epitaph.

## Treasury

- Completing an adventure makes an artifact that is not yet sealed. Completion is never
  blocked; the larger payout waits for the survey. **[proposed]**
- **Sealing** an artifact, and the gallery as a trophy and achievement room. **[decided]**
- Vocabulary: *seal* = submit the survey, *enshrine* = the whole ceremony, *crown* = a level
  up. The user offered all three words; this split of them is **[proposed]**.
- The enshrine panel is modelled on chess game analysis **[decided]**: a list of moves, each
  with its score, relevant skills and better alternative; discovered entities; itemized gains
  and losses under themed names; and general notes as text.
  - Moves are classified with chess terminology and icons, as close to chess.com's as
    possible. **[decided]** Its eleven classes: Brilliant !!, Great !, Best (star), Excellent
    (thumb), Good (check), Book, Forced (arrow), Inaccuracy ?!, Mistake ?, Miss (x), Blunder ??,
    as white symbols on colored circles. Icon colors vary between sources.
  - A win-chance graph, accuracy and turning point. The negative steps are midpoints of
    chess.com's expected-points ranges (inaccuracy .05-.10, mistake .10-.20; blunder .20+ is
    set at .35). Miss, the positive steps and the accuracy weights are invented. **[proposed]**
  - Gains are **spoils**, losses **tithes**. The verdict is the only required answer. **[proposed]**
  - The verdict is separate from the moves, and is a 2D matrix like the moral alignment chart:
    defeat to success, boring to exciting. **[decided]** Three steps per axis and the nine cell
    names (Triumph, Thriller, Slog...) are **[proposed]**.
  - A skill is learned only after the move succeeds in live play. For now, feedback has no
    effect on skill levels. **[decided]** Recorded through **open lines**
    (a better line not yet played, offered on later adventures): liked by the user as an
    advanced, later phase.
- Performances also require a link to the performance. **[decided]**
- Past better lines resurface on new adventures sharing an entity. **[proposed]**
- What an artifact is depends on its type **[decided]**:
  - **Item:** the item itself is the reward. It may be equipment, and part of a gear set.
  - **Performance:** the performance, through its link.
  - **Event:** connections made and entities discovered.
- A performance is enshrined once. **[decided]**
- Gallery: a 2D grid of 3D models, like trophies on a shelf. The cabinet is minimalist and a
  little glassmorphic, like the signal chain's housings: it gives the trophies room to breathe
  and shine. **[decided]** Between the heavy bookcase and a bare glass case:
  slender columns, arched frames, a small crest, thin frosted glass walls **[decided]**. The housing is monochrome, no gold;
  color is only for accents and magic inscriptions. **[decided]** Unenshrined artifacts stand under
  glass. **[proposed]**

## Agora

- The credits are **ambrosia**. They reward hard things. Difficulty and resistance are measured. **[decided]**
- Bounty = effort (1-5) x resistance (0-3) x 10, fixed on leaving the Alembic. **[proposed]**
- **Hybrid payout** **[decided]:** actions pay a smaller share, enshrining the larger one.
  The ratio may be a lever in the Alembic. The bounty is a fixed total, so splitting actions
  never earns more. Suggested default 30/70. **[proposed]**
- Undoing reverses: un-ticking an action or un-completing an adventure takes the payment
  back through a new ledger entry. The ledger is append-only. **[proposed]**
- Paid for doing, not for succeeding. **[proposed]**

- The panel tracks ambrosia. Nectar and elixir are both locked. **[decided]** What unlocks
  them is left undecided for now (user's choice); they just stay locked. The prototype shows two chained
  vessels either side of an ambrosia amphora whose level is the balance.

## Vault

- Holds assets that **already exist** but are guarded: locked, and leveraged to motivate and
  reward progress. **[decided]**
- Something being built is not in the Vault, because it does not exist yet (the Step Sensor,
  for example). **[decided]**
- **Ambrosia** is the one currency; **elixirs** and **nectar** are two types of treat it
  unlocks. **[decided, for now]** What separates an elixir from nectar is **[open]**
  (suggestion: elixirs restore, nectar delights).

## Equipment, skills and locks

- **Equipment:** some items are equippable and belong to a gear set. Items linked to the
  same deity form that deity's set **[decided, probably always true]**, so a set needs no
  entity type of its own. **[proposed]**
- The panel is the **Inventory** (formerly Gear). **[decided]** It uses the same shelf layout as
  the Treasury **[decided, probably]** and labels each item by its matter. **[decided]** Items gain a
  **purpose** field, and possibly the skills they boost, buffs and debuffs. **[decided: purpose;
  probable: the rest]** Each effect is a description, a target (a skill, favor or other) and a
  signed percentage **[proposed]**,
  active while the item is owned: there is no equipping. **[decided]**
- **Skills:** a skill tree with levels. Filling a level's XP opens a **trial**, an adventure
  that proves it; enshrining the trial triggers the crowning ceremony. **[decided: trials,
  ceremonies; proposed: the XP rules]**
- XP rules are **[open]**: the earlier "XP = effort" proposal is dropped, since skills come from
  live play. Credits reward resistance.
- **Locks:** hard or soft requirements on an adventure, such as equipment: some performances
  need the Step Sensor. **[decided]** Other kinds of requirement (skill level, artifact,
  credits) are **[proposed]**. An adventure may itself be a reward: **probably yes**.
- Adventures stay on one level: a requirement is a gate, not a parent. **[proposed]**

## Covers and models

- Covers become 3D **cards** in a housing, the way the machines house their liquid. The card
  itself is not in liquid. **[decided]** Vessel per type: lantern (event), spinning record in a
  ring (performance), dome (item). No cover: the adventure's sigil. **[proposed]**
- Cards sway within a short bearing range (about 22 degrees each way) so the cover stays
  visible; they never spin. **[decided]**
- Only items have models. **[decided]** An item's model replaces its cover in every panel that
  shows one: quest log, node card, Nexus cards. **[decided]** An item without one uses a default
  model **[decided]**: the 3D card with its cover, or its sigil. **[proposed]** Events and
  performances keep their covers there.
- The sealing animation is a magic circle unfolding. **[decided]**
- Easiest way to get a model: prompting Claude. **[decided as the preference]** Interface: a
  **commission** queued in the app, worked by a Claude session, then accepted or sent back.
  Run by a `/forge` skill first; a headless or API run can replace it later. **[proposed]**
  The app never needs it: without a model, the card shows.
- A model is a **recipe**: data, never code. Named parts from known shapes (box, plane, cyl,
  sphere, torus, gem, gear, lathe, tube, extrude, loop, pill), placement, and a material role
  (steel, dark, brass, copper, pale, tint = deity color, glow, glass, screen). Parts can be
  hidden, resized and re-materialed by hand. GLB import covers sculpted shapes. **[proposed]**
- A part may be tied to a Crucible action: a blueprint until the action is done, then
  solid. **[proposed]**
- Many small live models share one renderer that copies into each panel's canvas. **[proposed]**

## Deities

- A **deity** (formerly pillar) is a demand signal that adventures fulfil. **[decided]**
- Deities have **tiers or ranks**, not levels: promotion like at a job, and demotion for
  slacking off. **[decided]**
- Enshrining raises **favor** with the adventure's deities; favor fades over time and rank
  follows it. Promotion is a ceremony. Demotion comes after a warning and a grace period, and
  costs rank, never ambrosia. A deity can be made **dormant**. A hungry deity suggests the
  adventures that feed it. **[decided]**
- The fading rate differs per deity. **[decided]** Called **appetite**. **[proposed name]**

## Discovery

- A Treasury to Codex pipe carries the entities an adventure discovered. **[suggested by the
  user; visual and data design open]**
- **Fog of war** belongs to *topological* space (the Nexus) more than geographic space (the
  Atlas). **[decided]** It shows the limits of the explored frontier and the sense that there is more
  beyond. **[decided]** Enshrining clears it; it dims and never hides. **[proposed]**

## Necropolis

- Killing asks for an **epitaph**: why it died. **[decided]** Causes (lost interest, no time,
  too costly, blocked, superseded, outside my control) plus a note; the missed-event sweeper
  fills in *missed*. Optional and unpaid. **[proposed]**

## Vocabulary

Renamed 2026-11-22 in code, API, database and interface:

| Old | New |
|---|---|
| object (virtual object) | **entity** |
| pillar | **deity** |
| song | **performance** |

Entity types: deity, site, player (contact until 2026-11-23), organization, skill, spell. Adventure types: event, item,
performance, battle. A performance can have a date and place (a gig) or none (a song) **[decided, built 2026-11-23; battles too]**. The transitions log's `entity` column became `subject`, so *entity* only ever
means a Codex entity.

## Build order **[decided]**

Branch `core-zone`. Each stage is usable on its own.

| Stage | Builds | Status |
|---|---|---|
| 1 | Shared cabinet (`frontend/js/lib/cabinet/`), Necropolis, epitaphs | done (2026-11-23) |
| 2 | Treasury: vessels, cards, enshrine panel, verdict matrix, sealing | done (2026-11-23) |
| 3 | Inventory: purpose, effects, model recipes; models in quests, node card and Nexus. Partitioned by gear set **[decided]** | done (2026-11-23) |
| 3b | The Forge: describe an item and Claude models it, in the app | done (2026-11-23) |
| 4 | Agora: bounty in the Alembic, payouts, ledger | done (2026-11-23) |

- **Abandon** in the Necropolis deletes a dead adventure for good. **[decided]** A crawled one's
  event stays as dross in the Sump, so it can be reviewed again.
- Epitaph toast after a kill, optional; the sweeper writes *missed*. **[decided]**
- Discovered entities are created on seal. **[decided]** Sealed records can be amended;
  payouts never change. **[decided]** Old completions earn no ambrosia. **[decided]**
- Left for later: favor, skills, gear-set bonuses, locks, open lines, GLB.
- A site discovered at an event is added to the Codex but not linked: an event has one site (its
  where). Archiving or killing keeps a seal; moving back out of the Treasury breaks it. **[proposed]**
- In the Nexus, an item without a model keeps its flat cover (a 3D card inside a card reads poorly);
  quests and the node card use the default 3D card. **[proposed]**
- Recipes are checked by `backend/services/items.py` and drawn by `frontend/js/lib/cabinet/recipe.js`.
  To add one from a session: `PUT /api/adventures/{id}/item` with `{"model": [...]}`.
- **The Forge** **[decided]** (`backend/services/forge.py`) runs `claude -p` with no tools, settings or
  session; the reply must pass the recipe checks (one retry with the error). It's a proposal until
  accepted. `FORGE_MODEL` (default opus) and `CLAUDE_BIN` are environment settings. Nothing needs it.
  Not built: letting it see its own render and correct it.
- Models keep turning; only covers sway. **[decided]**
- **Ledger rules** (`backend/services/ledger.py`) **[proposed]**: a bounty is settable up to the Alembic and
  locks at the Crucible; `settle` pays the difference between what's due and what's in the ledger, so it
  can run after any change. Un-ticking an action and breaking a seal reverse; killing and abandoning keep.
  Elixir and nectar are shown locked; nothing spends ambrosia yet.
- Un-ticking an action of a sealed artifact also breaks its seal (it goes back to the Crucible).

## Upgrades round (2026-11-23) **[decided unless marked]**

From `resources/upgrades.md`. Check: `scripts/check_upgrades.py` (on a database copy).

- **Targets** (the Crucible): ready quests from any adventure, in your order (app state `anvil`). Done ones leave;
  locked ones can't be targeted. Targeting one makes its adventure alloy (the build begins); dropping the last
  target before any quest is done makes it distillate again.
- **Objectives** on any adventure: primary or bonus; open, achieved or failed. Set in the Refinery, ticked in
  the Arena and Treasury. All primary ones settled suggest an outcome; they never set the verdict or bounty.
- **Battle**: like a performance, plus adversaries (players, organizations, or anything named). No link needed
  to seal. An adversary isn't in the party; in the Complex they face the adventure on a red edge.
- **Spell**: a Codex entity, a kind of play. It can't be linked to anything: its skills are those of the sealed plays that name it, so
  they come from the Treasury alone. *Play* is the Treasury's word for
  what was a move (the table and API still say `moves`); a play can name one spell, which fills in its known skills.
- **Effects** are buffs or debuffs to skills, rated 1-3 (percentages, favor and "other" are gone).
- **Preparations** (the Arena): free text with effects, or owned items of the adventure's gear set (sharing a
  deity). They count when checked. Informational: nothing else uses them, and not ambrosia.
- **Feedback** (the Treasury): each effect at work judged helped / no effect / hurt, plus any added.
- A player has a free-text **role** per adventure. Archetypes have **no buffs**.
- **Idols** (the Cohort): a statue and a card per archetype, editable description, skills (app state `idols`).
  Suggested skills become Codex skills only when clicked.
- The **Combinator** (was the Complex panel and machine; id still `complex`; adventure -> collaboration) is a Core machine before the Refinery, with no pipes. The Sanctum's floor follows its machine count.
- **Models for every adventure type** (reverses "only items have models"): forged in the Refinery, under the card's
  Cover / Model switch (saved per adventure; items always show theirs). They show in the Refinery, Crucible, Arena,
  Nexus cards, inside the Treasury's vessels, and standing on the Atlas in place of the tower (`lib/mapModels.js`).
  Parts not tied to a quest are always solid, except an item's.
- **Quests**: the Alembic's actions, in the interface. A title is a verb (mandatory) and a subject.
