# Collaboration tool suite: build plan

Sources: the other files in this folder. This file holds the decisions made from them
(2026-11-23) and wins where they differ. Branch `collaborations`.

## Stages

| Stage | Builds | Status |
|---|---|---|
| 1 | contact -> player; archetype, warmth, tags, affinities | done, uncommitted |
| 2 | Parties (statuses, notes, follow-up, history), stewards, wardens, collaboration flag and facet | done, uncommitted |
| 3 | Complex panel: 3D complex, resonance mode, editing | done, uncommitted |
| 4 | Rosters in the Refinery, Crucible and a new Arena panel | done, uncommitted |
| 5 | Treasury: an aftermath and impact note per player; never required to seal | done, uncommitted |
| 6 | Cohort: cabinet of player sigils by archetype; a Sanctum machine | done, uncommitted |

## Decisions

- Statuses: resonant, charging, attuning, resisted; **bonded**, emergent; annealed, **neutralized**
  (was equilibrated), repelled. Any may follow any; natural steps are offered first; aftermath
  needs a completed adventure. Changes are logged.
- A player's place in the party is its adventure link: linking makes it resonant, unlinking removes
  it. A player discovered on seal is emergent.
- Collaboration = someone bonded, emergent or in the aftermath. Stewards don't count.
- Heralds and commissioners belong to the adventure, wardens to the site. Players and
  organizations can steward; one player can steward and be in the party.
- No site: the complex leaves the site node out.
- 12 archetypes in three groups (ops, tech, staff). Vesta's is **Cleric** (Warden is the steward).
  Idols are labels, not Codex deities.
- One skill list: Codex skills. Nothing was imported or seeded.
- Players link to deities, sites, organizations and skills (affinities). Resonance = entities shared
  with the adventure, plus 0.1 per point of warmth (a tie-breaker).
- Warmth is 0-5 by hand; annealed adds 1 and repelled takes 1, undone by a change of mind.
- Resonance is computed for everyone; resonant is stored on promotion.
- In the complex, the adventure takes its matter's colour.
- The Arena had no panel: it now lists animus adventures with their parties, adds people met as
  emergent, and completes. Its machine opens it. Buffs and equippables (`resources/upgrades.md`) are not built.
- Aftermath and impact save at once, apart from the analysis draft; read-only while sealed (Amend opens them).
- Cohort sigils: points = archetype, rings = warmth, lit once bonded or later; warmest first; empty
  archetypes are left out.
- Later: relational archetypes, power dynamics, arenas. `resources/upgrades.md` is separate.

## Where

`backend/services/party.py`, `entities.py`; `frontend/js/lib/complexGraph.js` (what to draw),
`complexScene.js` (drawing), `components/panels/ComplexPanel.js`, `components/PlayerFields.js`,
`EntityPicker.js`, `PartyRoster.js`, `AftermathPane.js`, `ArenaPanel.js`, `CohortPanel.js`, `lib/cabinet/players.js`; check with `scripts/check_party.py` (on a database copy).
