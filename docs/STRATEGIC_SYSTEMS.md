# Strategic systems: Infrastructure Financing and Full-Stack Integration

_Status: implemented, tested and tuned on `claude/new-session-6i54u3` (Session 3, 2026-10-11). This document replaces the card-based designs in `docs/VOLTA_SPECIAL_CARDS.md`, which is kept for history._

> **Financing buys speed. Integration buys efficiency. Specialization buys focus.**
> Both systems enrich the Catan loop (roll, collect, trade, build, expand, race to 10 CP). Neither is a finance simulation.

## Game modes

| Mode | Rules | Where |
| --- | --- | --- |
| **Settlers of Compute** (default) | `COMPUTE_RULES`: Infrastructure Financing + Full-Stack Integration | New Game (default choice), Custom game |
| **Classic** | `CLASSIC_RULES`: the original Catan-inspired rules, 25-card deck | New Game → Classic, Custom game |

- `GameState.rules` holds the mode. Old saves have no `rules` field and load as Classic (`rulesOf(state)`).
- The engine default (`createGame()` with no `rules`) is Classic. That keeps the Quick Demo, every seeded AI test and every old save unchanged. The UI passes `COMPUTE_RULES` for a new game.
- **Market events** (`rules.marketEvents`) exist only as a preserved prototype on branch `s2/events` (see `recovery/`). They are not merged and not reachable in the UI.
- The legacy beta card with id `'integration'` is now titled **Expedited Deployment** (Custom game → "Special cards (beta)"), so it never collides with the earned Full-Stack status.

## Infrastructure Financing

An intentional alternative to the standard AI Factory upgrade, offered side by side in the Build menu.

| | Standard upgrade | Financed upgrade |
| --- | --- | --- |
| Cost now | 3 Capital + 2 GPUs | **1 Capital + 2 GPUs** |
| CP | +1 now (2 total) | 1 total until repaid, then +1 |
| Output | Double, now | Like a cluster until repaid, then double |
| Commitment | None | **5 committed units**, repaid from the factory's own output |
| Limit | Factory pieces | Factory pieces, and at most **2 financed factories outstanding** per company |
| Exposure | None | The outage stalls repayment; rivals see "Leveraged ×N" |

**Rules** (`src/engine/financing.ts`, `game.ts produce()`):

1. **Upgrade** (`BUILD_FINANCED_FACTORY`): an own cluster becomes `{ owner, kind: 'factory', financed: 5 }`. The cost goes to the market; a factory piece is used and the cluster piece returns.
2. **Repayment:** each time one of its hexes produces, the owner collects 1 (like a cluster), and 1 committed unit is repaid. The committed unit never leaves the market, so resources are conserved and no phantom shortage is possible. A delivery fails if that resource hits a market shortage (including the sole-claimant partial payout), and a hex under the outage pays nothing.
3. **Completion:** when the last unit is repaid, the field is removed (never 0). The factory now scores 2 CP and produces double. Completing on a rival's roll lets the owner win only at the start of their own turn; completing on their own roll can win at once.
4. **Refinance** (`REFINANCE`): on your own turn in the main phase, pay **1 Capital per unit left** to finish the factory at once. It is not an Innovation Card play and is allowed the same turn as the upgrade. It can win immediately. A full early refinance costs 1 + 5 = 6 Capital + 2 GPUs, against 3 + 2 for a standard upgrade: early repayment carries a premium.
5. **State safety:** Building objects are never mutated (always a new object). There is no new RNG use. Every reader tests `(b.financed ?? 0) > 0`, so old saves read as unfinanced.

**Constants** (`constants.ts`): `FINANCING_COST = 1 Capital + 2 GPUs`, `FINANCING_COMMITMENT = 5`, `FINANCING_MAX_OUTSTANDING = 2`, `FINANCING_MAX_COMMITMENT = 6` (the ceiling for a future market-event extension).

**Why these numbers.** The originally proposed 2 GPUs + 3 units made a financed factory effectively a full upgrade for 2 GPUs plus a delay, because the committed units come only from bonus output that would not exist without the factory. In seeded AI games, a company barred from financing won only 10.5% of games (fair share 25%). A 1-Capital stake plus a 5-unit commitment brings that company to 22.6% over 1,200 games, while games stay about 1.3 rounds shorter than Classic. The cap of 2 versus 1 made no measurable difference, so the owner's experimental cap of 2 stays. Details: `docs/BALANCE.md`.

**AI** (`ai.ts`, all gated on `rules.financing`):

- Prefers a standard upgrade whenever it can afford one.
- Finances when Capital-poor (< 3) with the GPUs, on a site with ≥ 6 weighted pips.
- Saves toward a financed-factory goal priced at its own cost (the original card rule was circular). That goal never claims the same GPUs as the Expedited Deployment card goal or the Integrated Deployment goal.
- Refinances to win, when a commitment is stalled under the outage, or with spare Capital at the end of its turn.
- Grid Disruption favors hexes next to a rival's financed factory, without double counting.

**UI:**

- **Build menu:** "AI Factory · standard" and "AI Factory · financed", each with its cost, its value line and a disabled reason.
- **Placement:** financing placement glows on your clusters. The phone confirm warns when a site has fewer than 6 unblocked pips.
- **Financing panel:** on desktop it sits in its own panel; on the phone it is in the Build sheet. It works with an empty card hand. Each commitment shows its units left as dots, the hexes it repays from (blocked ones struck through), a "Stalled" warning and a **Refinance · N Capital** button.
- **Board:** a dashed amber ring and a units-left badge mark a financed factory; both turn red and pulse when the outage stalls it. Payout chips show the real +1 and a "+1 repaid" marker.
- **Elsewhere:** the scoreboard shows "Leveraged ×N"; the end-game standings list financed factories separately; How to play explains both systems from the constants.

## Full-Stack Integration

An earned, **permanent** company status that unlocks a repeatable build: **Integrated Deployment**.

**Milestones** (`src/engine/fullstack.ts`). All four must hold at the same moment:

| Milestone | Definition |
| --- | --- |
| Operational AI Factory | At least 1 unfinanced factory. A financed one counts only once fully repaid. |
| Three infrastructure sites | At least 3 buildings: clusters and factories, financed ones included. |
| Four resource types | Your buildings touch numbered hexes of at least 4 of the 5 resource types. This is adjacency, not inventory, and the outage is ignored. |
| Connected network | At least 4 Network Connections in one connected group. A rival building cuts the group, as for Longest Network. |

The engine checks every company after every action (`updateFullStack`), so an unlock can happen on a rival's turn. The turn is stored in `Player.fullStackTurn`. The unlock is logged as a milestone and celebrated with a toast and a rival notice.

**Integrated Deployment** (`BUILD_INTEGRATED_FACTORY`) puts a full, unfinanced AI Factory directly on a legal open site on your network:

- It follows the distance rule and network connectivity, and is limited by factory pieces.
- It costs **1 Power + 1 Networking + 1 Land + 3 Capital + 2 GPUs** (8 resources in one action, against 9 resources and two actions for a cluster plus an upgrade).
- It scores **+2 CP** and recomputes Longest Network.
- It is not a card play, and it is repeatable while you have the resources, factory pieces and open sites.

**Calibration** (`docs/FULLSTACK_CALIBRATION.md`): 80% of companies unlock, at a median of 5 CP (84% within the 4–6 CP target), around round 11 of about 16.5. That leaves a median of 5 rounds to exploit it. The network milestone is the usual last one; the resource milestone is met after the opening by 95% of companies, so it reads as broad access rather than a hurdle. The AI uses Integrated Deployment sparingly (about 0.3–0.4 per game), and conventional building is not obsolete: standard and financed upgrades still dominate factory builds.

**AI** (`ai.ts`, gated on `rules.fullStack`):

- Deploys when it is legal and affordable on a good open site, before ordinary builds.
- Saves toward a deployment goal (priced at its cost) once unlocked.
- Holds back competing builds only when one resource short.
- Gives a light nudge toward a missing milestone: it values a missing resource type more, or grows its largest road group. It does not chase Full-Stack blindly.

**UI:**

- **Full-Stack panel:** desktop column, or the phone Build sheet. It shows the four milestones as a ✓ / ○ checklist with progress detail, an "N / 4" counter, the reward line, and a glowing "Unlocked" state.
- **Build menu:** an "Integrated Deployment" row explains what's missing (for example "Unlock Full-Stack Integration first (2/4 milestones).").
- **Scoreboard:** a "Full-Stack" badge.

## Grid Stability

Part of the Compute rules (`rules.gridStability`); Classic keeps every-7 disruptions and persistent outages.

**Rules:**

- **Stabilization:** after a Grid Disruption, the next **6 player dice rolls** are protected. A natural 7 in that window causes no discards, no theft and no outage move, and still produces nothing. Every roll counts, absorbed 7s included, and an absorbed 7 does not restart the window. The 7th roll can disrupt again.
- **Outages:** an outage blocks its hex for the next **4 rolls**; the roll that caused it doesn't count. It expires after the 4th roll resolves: the marker returns to the Dead Zone, the log says "Grid restored", and the hex produces from the 5th roll. 7s count down too. There is only ever one outage, because there is one marker.
- **Infrastructure Priority** bypasses stabilization, replaces the current outage, and restarts both timers. It works with no outage active and cannot stack outages.
- **Financing:** a blocked hex repays nothing. Repayment resumes after expiry, and the factory's other unblocked hexes keep repaying.

**State:** `GameState.grid = { stableRolls, outageRolls }` (`src/engine/grid.ts`), plus `lastRoll.stabilized` for an absorbed 7. All plain numbers, no RNG. The timers count down at the end of each ROLL; MOVE_DISRUPTION sets them to 6 and 4.

**Saves:**

- A save taken mid-countdown resumes exactly (tested).
- A Compute save from before Grid Stability (its `rules` has no `gridStability` key) keeps the persistent-outage, every-7 rules it started with. Rules are never switched mid-game.
- A state with the rule on but no timers starts vulnerable, and an existing outage gets a full 4-roll countdown.

**UI:**

- **Grid status chips:** "Grid vulnerable" or "Stabilizing · N rolls", plus "Outage · N rolls". They sit in the desktop turn panel and over the phone board's top-right corner.
- **Absorbed 7:** reads "Grid stable · no disruption", in cyan rather than red.
- **Board:** the outage label counts down ("OUTAGE · 2").
- **Expiry:** a quiet "Grid restored" ticker notice. There are no dialogs and nothing to acknowledge.

**Balance:** natural disruptions −55%, discards −35%, thefts −52%, a hex offline on 35% of rolls instead of about 90%, games about 1.5 rounds shorter, Financing unchanged (`docs/BALANCE.md`).

## Interactions

- **Integrated Deployment vs. Financing:** both draw on the same 4 factory pieces and on GPUs. The AI never lets two goals claim the same GPUs.
- **Order of play:** a financed factory counts as a site but not as the operational factory until repaid, so financing early can delay Full-Stack slightly.
- **Card play:** neither system uses the one-Innovation-Card-per-turn limit.

## Tests

| File | Tests |
| --- | --- |
| `financing.test.ts` | 20 |
| `fullstack.test.ts` | 25 |
| `invariants.test.ts` | deep-frozen all-AI games in every mode; save round-trip |

The opt-in balance probes are listed in `docs/BALANCE.md`.
