> **Superseded in part.** BUILD_PLAN.md (same folder) is the source of truth for the node
> list, chain order, harvesters, viewers and the transitions log. Read this file for the
> original visual ideas only.

# ARCHITECTURE.md — 3D Steampunk Alchemical Relational Engine

## 1. Executive Summary
This project is a self-contained **3D WebGL (Three.js) Data Flow & Relational State Visualizer** styled as a **Steampunk Alchemical-Metallurgic Refinery**. 

It models an event-ingestion, triage, enrichment, and curation pipeline. Unlike traditional 2D Sankey diagrams that only show static flow ratios, this engine represents **relational database tables (`table_net` and `table_core`) as physical 3D hydraulic zones**, where:
* **1 Discrete Energy Packet = 1 Database Row (Event Record).**
* **Liquid Height in a Vessel/Processor = Exact `COUNT(*)` of rows currently occupying that lifecycle status/stage.**
* **Pipe Bore (Radius) = Square-root scaled throughput magnitude ($r \propto \sqrt{\text{flow}}$).**

---

## 2. Three-Zone Spatial & Relational Topology

The 3D scene is divided into three physical and logical zones:

### Zone 1: `NET` (Ingestion & Triage Floor — `1x Macro Scale`)
* **Purpose:** Harvest raw events from external sources (`19hz`, `luma`, `ra`, `eventbrite`) and triage them into rejected noise (`[sump]`) vs. viable candidate ore (`[sieve]`).
* **Physical Elevation:** Foundry Floor (`Y = 0.0m`), Max Vessel Capacity = `1,200 rows`.
* **Nodes:**
  * `A1.1–A1.4 [crawler portfolio]`: 4 **Dynamos** (`[19hz]`, `[luma]`, `[ra]`, and locked `[eventbrite]`). Stateless harvesters that inject raw events into `[centrifuge]`.
  * `A2 [centrifuge]`: **Processor**. Receives raw scraped events and acts as the active triage buffer.
  * `A3 [sump]`: **Vessel**. Holds rejected noise/slag rows filtered out by `[centrifuge]`.
  * `A8 [forge]`: **Dynamo**. Stateless direct-injection engine that bypasses `[centrifuge]` and streams high-purity events directly into `[sieve]`.
  * `A4 [sieve]`: **Vessel (The Zone Bridge)**. Holds extracted ore caught by the sieve plus direct injections from `[forge]`. Acts as the physical and logical bridge between Zone 1 (`NET`) and Zone 2 (`CORE`).

### Zone 2: `CORE` (Refinement & Curation Bench — `10x Precision Scale`)
* **Purpose:** Process extracted candidate events through sequential alchemical stages to distil high-value artifacts, relics, and civilization rewards.
* **Physical Elevation:** Raised Steampunk Lab Bench (`Y = +2.6m`), Max Vessel Capacity = `160 rows` (**10x visual magnification** so the ~10% of events that pass triage fill the core vessels to readable heights).
* **Linear Serpentine Stitch Progression (`X = -8` to `+57`):**
  1. `A4 [sieve]` *(Intake Bridge)* — Matter: `(ore)`
  2. `A7 [refiner]` *(Processor)* — Matter: `(essence)`
  3. `A9 [alembic]` *(Processor)* — Matter: `(distillate)`
  4. `A10 [crucible]` *(Processor)* — Matter: `(alloy)` *(Forks waste `(dross)` to `A11 [necropolis]`)*
  5. `A12 [evaluator]` *(Vessel / Quality Gate)* — Matter: `(animus)`
  6. `A13 [arena]` *(Vessel)* — Matter: `(artifact)`
  7. `A14 [reliquary]` *(Vessel)* — Matter: `(relic / reward)`
  8. `A15 [archive]` *(Terminal Vessel)* — Matter: `(immortal_relic)`
* **Economic Circularity (`A16 [entropy market]`):**
  * A stateless **Dynamo** on the raised front hearth (`Z = +12.5`).
  * Draws `(reward)` from `[reliquary]` and pumps `(cost)` energy back upstream into `[crucible]` and `[arena]` via overhead golden arches to incentivize pipeline throughput.

### Zone 3: `VIEWER` (Read-Only Observation Gallery)
* **Purpose:** Inspect and query data across both `table_net` and `table_core` through spatial, temporal, and topological lenses without mutating or storing rows.
* **Physical Elevation:** Raised Back Gallery (`Y = +5.0m, Z = -20.0m`).
* **Bus Architecture & Nodes:**
  * `A17 [nexus]` *(Association / Topology Dynamo)*: Taps directly into `[centrifuge]`.
  * `A5 [atlas]` *(Space / Geospatial Armillary Dynamo)* & `A18 [calendar]` *(Time / Horological Astrolabe Dynamo)*: Tap into the **Core Data Bus Bar**—a glowing subterranean brass conduit spanning underneath `[sieve]` through `[reliquary]`.

---

## 3. Strict Database Accounting Invariants

Any developer or agent modifying `recomputePipeline()` or binding live backend API counts **must preserve two strict SQL invariants**:

### Invariant 1: `TABLE_CORE` Mutually Exclusive Phase Occupancy
Every event row promoted to `table_core` occupies **exactly one** lifecycle stage at any point in time. Therefore, the total row count of `table_core` is the exact sum of all storage nodes in the Core chain (including the `[sieve]` bridge and `[necropolis]` dross):

$$\text{COUNT}(\text{table\_core}) = \sum \Big( \text{sieve} + \text{refiner} + \text{alembic} + \text{crucible} + \text{necropolis} + \text{evaluator} + \text{arena} + \text{reliquary} + \text{archive} \Big)$$

### Invariant 2: `TABLE_NET` Superset Conservation
Because `table_net` tracks all ingested events across their lifecycle (whether still buffered in `[centrifuge]`, rejected into `[sump]`, or promoted into `table_core`), its total count is strictly:

$$\text{COUNT}(\text{table\_net}) = \text{COUNT}(\text{centrifuge}) + \text{COUNT}(\text{sump}) + \text{COUNT}(\text{table\_core})$$

*(Note: Stateless **Dynamos**—Crawlers, Forge, Entropy Market, Nexus, Atlas, Calendar—do not store rows and are excluded from table `SUM` invariants).*

---

## 4. Module Taxonomy & Visual Language

Every 3D node in `nodesConfig` is assigned one of three `modType` classifications:

| `modType` | Database Semantics | 3D Visual Representation | Interactive UI |
|---|---|---|---|
| **`vessel`** | **Passive State Storage:** Holds rows in a resting state (`sump`, `sieve`, `necropolis`, `evaluator`, `arena`, `reliquary`, `archive`). | Grounded cast-iron plinth, brass tie-rods, transparent glass cylinder, internal glowing liquid column, static top finial valve. | Hover tooltip showing row count & provenance breakdown. |
| **`processor`** | **Active State Operator:** Holds rows while actively transforming them (`centrifuge`, `refiner`, `alembic`, `crucible`). | Glass containment cylinder with internal liquid **plus bespoke external kinetic machinery** (planetary rotor cage, reciprocating agitator shaft, copper condenser coils, or glowing induction heater). | Hover tooltip + **`[ ⚙ PANEL ]`** button opening module console modal. |
| **`dynamo`** | **Stateless Engine / Viewer:** Operates on flows or queries tables; **stores `0` rows** (`crawlers`, `forge`, `entropy_market`, `nexus`, `atlas`, `calendar`). | **No glass cylinder and no liquid.** Pure kinetic steampunk machinery (mining gearheads, Bessemer hammer & plasma core, golden balance scale, 3-axis gyroscope, armillary sphere, or clockwork astrolabe). | **`[ ⟳ SYNC ]`** on crawlers; **`[ ⚙ PANEL ]`** on engines/viewers. |

---

## 5. Visual Design Principles & Mathematical Laws

### A. Resolving Bivariate Color (Matter State vs. Source Provenance)
The engine encodes two categorical dimensions simultaneously without visual collision:
1. **Permanent Base Rune Rings:** Every node sits on a glowing torus ring that permanently emits its **Matter State Color** along the **Blue (`prima materia`) → Teal (`ore`) → Amber/Orange (`essence/distillate/alloy`) → Magenta/Violet (`animus/artifact/relic`)** progression.
2. **Optical Lens Toggle (`currentLens`):**
   * **`'matter'` Mode (Default):** Vessel liquids render as a single unified column matching the stage's Matter State color.
   * **`'source'` Mode (Stratified Provenance):** Vessel liquids split vertically into **stacked immiscible color bands** (`[19hz]` Blue, `[luma]` Emerald, `[ra]` Amber, `[forge]` Crimson) proportional to each source's share in that stage.

### B. Solving the 3D Pipe Radius Illusion ($r \propto \sqrt{\text{flow}}$)
In 3D space, scaling cylinder radius linearly with flow ($r \propto \text{flow}$) causes a $10\times$ flow to occupy $100\times$ the cross-sectional area, visually overwhelming the scene.
* **Rule:** Pipe outer radius is computed via `getPipeRadius(pkts, isMicro)` using the square-root law:
  $$r = k \sqrt{\text{pkts}}$$
* This guarantees that the **cross-sectional area of the glass pipe ($A = \pi r^2$)** is strictly proportional to the flow volume.

### C. Solving the 10:1 Triage Scale Discrepancy
Because `[centrifuge]` rejects ~75–90% of raw events to `[sump]`, rendering Zone 2 (`CORE`) at the same `1,200-row` vertical scale as Zone 1 (`NET`) would leave all downstream core vessels nearly empty.
* **Rule:** Zone 1 uses `MACRO_CAP = 1200` on the foundry floor (`Y = 0`), while Zone 2 sits on an elevated lab bench (`Y = +2.6m`) calibrated to `MICRO_CAP = 160` (`10x` visual magnification).

---

## 6. Developer Extension Guide (How to Hook Up a Real Backend)

1. **Binding Live SQL / API Counts:**
   Replace the synthetic math in `recomputePipeline()` by passing a JSON payload from your backend into `setNodeComp(nodeId, { s_19hz, s_luma, s_ra, s_forge })` for each stage, then call `rebuildVesselLiquid()` and `rebuildPipes()`.
2. **Adding a New Crawler Source:**
   * Add a new entry to `SOURCE_COLORS` (e.g., `s_dice`).
   * Add a new `modType: "dynamo", subStyle: "crawler"` object in `nodesConfig` at `X = -44`.
   * Add a corresponding flow in `flowsConfig` connecting it to `"centrifuge"`.
3. **Wiring Module Panels:**
   * Replace the placeholder HTML inside `window.openModuleModal(nodeId)` with your live route view, iframe, or React/Vue portal mount.
