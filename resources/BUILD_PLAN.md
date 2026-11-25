# Upgrades, November 2026: build plan

Decisions (2026-11-24) from `upgrades.md`, `signal_chain.md`, `adventure_metallurgy_engine.md` and
`archetype_system.xlsx` in this folder, which are the user's own files (never commit them). This
file wins where they differ. Everything here is decided unless marked otherwise.
Environment and checks: `legacy/signal chain digital twin/BUILD_PLAN.md`, sections 0.4 to 0.6.

| Stage | Builds | Status |
|---|---|---|
| 1 | Archetypes' exploitative aspects, idol -> paragon, Cohort without its Players tab | built, uncommitted |
| 2 | Signal chain renames; locked Deposit and Assayer; Sieve and Instagram harvesters removed | built, uncommitted |
| 3 | Pantheon | built, uncommitted |
| 4 | Recurring events | built, uncommitted |
| 5 | Skills on quests | built, uncommitted |
| 6 | Assayer (net plan N1), then Deposit (N2) | next |

## 1. Archetypes and Cohort

- Juggernaut is now the **Paladin** (protects), Terraformer the **Mariner** (transports).
- The Cohort has two views, all archetypes at once: **Virtue** (constructive; warm light, haloes) and **Vice**
  (exploitative): black iron, horns, red light from below, turned runes, reversed cards.
  Vices: Berserker breaks, Golemancer warps, Pirate traffics; Warlock conspires, Rogue stalks, Trickster swindles;
  Siren lures, Blighter poisons, Demagogue inflames; Tyrant dominates, Inquisitor chains, Necromancer possesses
  (`lib/paragons.js` SHADOWS; workshopped with the user, descriptions by Claude).
- Every archetype and aspect has **variants** (kindred classes) and **exemplars** (people of history and fiction).
- A player's `aspect` is set by hand; unset counts as virtue. An exploitative one goes by that name.
- A player opens from their archetype; those without one are only in the Codex.
- Merchant + logistician, Vanguard + manager. State key `idols` -> `paragons`.
- Buff feedback already exists in the Treasury: nothing to do.

## 2. Signal chain

| Was | Is |
|---|---|
| flux, prima materia | **specimen** or **ore**, computed by completeness, in harvester and centrifuge alike |
| Hopper's ore | **concentrate** |
| Refinery | **Athanor** (essence stays) |
| distillate | **armature** |
| Alembic | **Anvil** (3D model rebuilt to match) |
| Forge (create by hand) | **Lode** (the model-making Forge keeps its name) |
| dross (Sump) | **tailings** (Necropolis keeps vestige) |
| Enricher / Resolver | **Assayer** |
| `link-bucket`, `ig-collection`, `ig-profiles` | one locked **Deposit** (later fetches links sent to Telegram) |
| Sieve | removed; the autonomous filter goes inside the centrifuge, later |

- Ore = title, start, exact location, cover and event link. End time and description are optional.
- As built: `backend/services/grade.py` (`missing` on every event); Discovery facet and lens `grade`. Node ids
  renamed and migrated (athanor, anvil, lode, assayer); panel ids `node` and `alembic` and the Alembic files keep
  their names, like `complex`. State key `anvil` (targets) is now `targets`. A row whose link is its source's own
  page has no link. The Centrifuge's Assay button comes with stage 6.
- A specimen may be passed to the Hopper by hand.
- Stage is separate from properties; each field remembers its source.
- Skipped: Caster, Engineer, Billet, Calx, Alloyer, Amalgam, Regulus, Yield, Assimilator, Mint, Reliquary.

## 3. Pantheon

- Fulfillment factor, 1 to 5, per adventure-deity link, set in the Athanor.
- Supply = the factors of **sealed** artifacts in the Treasury (not the Archive). Breaking a seal, or
  archiving (by hand), removes it. Demand is set by hand. Favor = supply - demand.
- Impressed (blue) > 3; satisfied (green) 0 to 3; hungry (orange) -3 to below 0; starving (red) < -3.
- As built: `lib/favor.js`, `components/panels/PantheonPanel.js`, `lib/cabinet/deities.js`. A link without a factor counts
  as 1 [proposed]. Demand is the deity's `details.demand`, 0 to 99; favor is computed, never stored.
- Deities are stable: each has its own place and its own **form** (`details.form`: a model, rune and accents in its Codex
  colour). Embra Nexa: computer music. Movement: dance. Family. Career (was NexaGraph). Lexa: dark games. A new deity is
  a magic circle until given one; only its altar, haze and label take its state's colour.
- Replaces fading favor, appetite, ranks and demotion in `core/ARCHITECTURE.md` (ranks may return).

## 4. Recurring events (weekly only)

- The weekly adventure stays in the Arena. **Enshrine a date** makes an artifact for that date, with its
  own verdict, plays, party aftermath and seal. Dates not done leave nothing.
- Quests don't reset and pay once; each sealed date pays the completion share.
- When the series ends: Archive if it has an artifact, else as today. [proposed]

- As built: `backend/services/series.py` (rules in its docstring), `components/SeriesDates.js`, check `scripts/check_series.py`.
  An artifact copies the series' entities, factors, stewards, model and bonded party. Objectives and buffs start over.
  A weekly adventure can't be completed whole; one that was (Swing Social) can **Continue the series**. After its last
  date a series has a week's grace before it's archived. Artifacts replace the series' dates on the Calendar.

## 5. Skills on quests

- Quests link skills. A sealed artifact lists skills practiced (done quests) and proven (plays), and the
  attributes they feed. A record only: no XP or levels.
  As built: `skills` on a roadmap action; `lib/growth.js` derives it (nothing stored). A play proves only if it came off (not
  inaccuracy or worse). A series' quests count on its first sealed date. A skill's Codex page lists where it grew.
  Mastery is parked (concept incomplete).

## 6. Assayer and Deposit

- The Assayer is piped both ways to the centrifuge, which gains **Assay** beside Purge, Keep and Feed: it sends the
  specimens that pass the **Nexus filter**; they're processed one at a time and return as ore, each a
  logged transition. One that can't be completed returns a specimen marked with what's missing.
- Harvested events are assayed only once fed. After a restart, the Assayer's contents return to the centrifuge.
- Deposit links enter as specimens and go through the centrifuge. Rest: `net/BUILD_PLAN.md`.
