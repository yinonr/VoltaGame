# Session 2 — Engine contracts and file ownership

_Lead-owned. Written before the parallel work streams started (2026-10-11). Each stream works in its own git worktree; the lead merges them into `claude/new-session-6i54u3`._

## Product direction (owner's Session 2 directive, condensed)

- Keep the Catan loop: **Roll → Collect → Trade → Build → Expand → Race to 10 CP.** New mechanics enrich it; this is not a finance simulator.
- **Financing buys speed. Integration buys efficiency. Specialization buys focus.** No universally dominant strategy.
- Priorities: (1) intentional Infrastructure Financing, (2) custom company names and clear rivals, (3) earnable Full-Stack Integration, (4) gameplay polish, (5) market events (optional, gated off by default).
- Classic Mode keeps the original rules and the 25-card deck. Old saves load as Classic.

## Rules variants

`GameState.rules?: RuleOptions` (`types.ts`): `{ financing, fullStack, marketEvents }`.

- Read it with `rulesOf(state)` (`constants.ts`). Absent = `CLASSIC_RULES` (all off).
- `createGame({ rules })` takes a partial; the engine default is Classic, so every existing test, AI seed and the Quick Demo are unchanged.
- `COMPUTE_RULES` = `{ financing: true, fullStack: true, marketEvents: false }` is the flagship "Settlers of Compute" ruleset. The UI's New Game uses it by default; Classic is a selectable mode.
- `voltaCards` (legacy beta deck option) is independent. The legacy card with id `'integration'` is now titled **Expedited Deployment** so it never collides with the earnable Full-Stack Integration status. There is **no Financing card**: financing is a build choice.

## Shared state and actions (already in `types.ts`)

| Contract | Meaning |
| --- | --- |
| `Building.financed?: number` | Committed units still owed by a financed AI Factory. Absent (never 0) when unfinanced. **Never mutate a Building in place**: write a new object. |
| `Player.fullStackTurn?: number` | Turn on which Full-Stack was unlocked. Absent = locked. Permanent. |
| `Player.name` | Display name; may be a sanitized custom name (`SeatConfig.name` → `sanitizeCompanyName`). Display-only. |
| `ProductionReport.deliveries?: Delivery[]` | `{ player, vertex, resource, left }` per committed unit delivered this roll. |
| `GameState.market?: MarketState` | `{ nextEventTurn, last }` for market events. |
| `LogKind` | adds `'finance'`, `'milestone'`, `'event'`. |
| `BUILD_FINANCED_FACTORY { vertex }` | Financed upgrade of an own cluster. Delegates to `financing.ts applyFinancedUpgrade`. |
| `REFINANCE { vertex }` | Pay off a commitment with Capital. Delegates to `financing.ts applyRefinance`. Not a card play. |
| `BUILD_INTEGRATED_FACTORY { vertex }` | Integrated Deployment. Delegates to `fullstack.ts applyIntegratedDeployment`. |

## Constants (`constants.ts`; tunable by simulation evidence)

| Constant | Initial value |
| --- | --- |
| `FINANCING_COST` | 2 GPUs |
| `FINANCING_COMMITMENT` | 3 units |
| `FINANCING_MAX_OUTSTANDING` | 2 financed factories per company at once |
| `FINANCING_MAX_COMMITMENT` | 5 units (ceiling after market-event extensions) |
| `INTEGRATED_DEPLOYMENT_COST` | 1 Power + 1 Networking + 1 Land + 3 Capital + 2 GPUs = 8 resources (vs. 9 via cluster + upgrade) |
| `MAX_COMPANY_NAME` | 24 characters |

## Module map

| Module | Purpose |
| --- | --- |
| `mutate.ts` | `GameError`, `addLog`, `pay`, `gainFromBank`, `nameOf`, `announceLongest`. Shared by the reducer and feature modules; avoids import cycles. `game.ts` re-exports `GameError` and `addLog`. |
| `financing.ts` | `isFinanced`, `outputMultiplier` (done), `financedVertices` (done), `legalFinancingVertices`, `checkFinancedUpgrade`, `refinanceCost`, `checkRefinance`, `applyFinancedUpgrade`, `applyRefinance`. |
| `fullstack.ts` | `hasFullStack` (done), `fullStackProgress`, `updateFullStack` (reducer-tail hook, all players), `legalIntegratedVertices`, `checkIntegratedDeployment`, `applyIntegratedDeployment`. |
| `events.ts` | `applyMarketEvents(s)` — called on every END_TURN after the new current player is set. No-op unless `rules.marketEvents`. Must not consume `s.rng`. |
| `rules.ts` | `turnCheck` is now exported (main-phase gate). |

Already switched to `outputMultiplier`: `game.ts produce()` (owed amount only — the pending-delivery logic is still to do), `evaluation.ts productionPips`, `ai.ts chooseDisruption` + `disruptionHurtsMe`, `Board.tsx` payout chip. `scoring.ts` already has `financedFactories` with `publicTotal = clusters + financedFactories + 2 × factories + bonuses`; the end-game standings show financed factories separately.

## Financing rules (fixed by the directive + the reviewed card spec)

1. **Upgrade:** own cluster, a free factory piece, `FINANCING_COST`, fewer than `FINANCING_MAX_OUTSTANDING` outstanding, `rules.financing` on, main phase of own turn. Result: `{ owner, kind: 'factory', financed: FINANCING_COMMITMENT }`; cost to the market; the cluster piece returns to supply.
2. **Production while financed:** the factory produces like a cluster (1). Its would-be bonus unit is a *committed unit* that never leaves the market. `produce()` records a pending delivery per payout; after the unchanged shortage check, a delivery succeeds only if that resource is not in `shortages` (including the sole-claimant branch). A successful delivery writes a **new** Building with `financed - 1` (field removed at 0). A hex under the outage pays nothing, so the commitment stalls.
3. **Scoring:** 1 CP while financed; 2 CP and double output once the field is gone.
4. **Completion on a rival's roll** can put the owner on 10 CP, but they win only at the start of their own turn (existing `checkVictory` behavior).
5. **Refinance:** main phase, own turn, own financed factory, pay `financed` × Capital to the market, field removed, immediate `checkVictory` via the reducer tail. Not a card play; allowed the same turn as the upgrade (total = a standard upgrade).
6. **Determinism:** no new RNG use.

## Full-Stack Integration (initial definitions; Full-Stack stream calibrates by simulation)

Milestones (all four unlock it; permanent):

1. **Operational AI Factory:** at least one *unfinanced* AI Factory.
2. **Three infrastructure sites:** at least 3 buildings (clusters + factories, financed included).
3. **Four resource types:** owned buildings touch numbered hexes of at least 4 of the 5 resource types (adjacency, not inventory; the outage marker is ignored).
4. **Connected network:** at least 4 Network Connections in one connected group (rival buildings cut it, as for Longest Network).

Reward — **Integrated Deployment**, repeatable: an unfinanced AI Factory directly on a legal open network site (`legalClusterVertices`), paying `INTEGRATED_DEPLOYMENT_COST`, using a factory piece (no cluster piece), +2 CP, Longest Network recomputed. Not a card play. Target unlock around 4–6 CP.

## Market events (experimental, gated)

`rules.marketEvents` only. Deterministic timing derived from the seed (never `s.rng`), infrequent, resolved automatically (no new phase, no player prompt), no bankruptcy, commitments capped at `FINANCING_MAX_COMMITMENT`, at least one broadly positive event.

## Invariants every stream must keep

- `applyAction` never mutates its input. Total of each resource across hands + market = 19.
- Classic games (no `rules`) behave exactly as before: same dice, same AI decisions, same Quick Demo.
- Old saves (no `rules`, `financed`, `fullStackTurn`, `deliveries`, `market`) load and play as Classic.
- `npx tsc -b` and `npx vitest run` pass before every commit.

## File ownership (phase 1)

| Stream | Owns | May touch (small, named regions only) |
| --- | --- | --- |
| **A — Financing engine + AI** | `financing.ts`, `game.ts` (`produce()` and the ROLL logging), `scoring.ts`, `evaluation.ts`, `__tests__/financing.test.ts` | `ai.ts` except `tradeTowards` |
| **B — Full-Stack engine** | `fullstack.ts`, `__tests__/fullstack.test.ts`, Full-Stack simulation notes | none of `ai.ts`/`game.ts` (hooks already wired) |
| **C — Company identity + new-game flow + public branding** | `App.tsx`, `TitleScreen.tsx`, new `NewGameScreen.tsx`, `brand.tsx`, `useGame.ts`, `styles/identity.css` | `panels.tsx` `Scoreboard`; `GameScreen.tsx` header/top chips/banner; `modals.tsx` `IntroModal` |
| **D — Gameplay polish** | `Board.tsx`, `mobile.tsx`, new `feedback.tsx`, `styles/polish.css` | `panels.tsx` `DiceDisplay`/`HandPanel`; `GameScreen.tsx` (mount points only); `modals.tsx` `WinnerModal`; `ai.ts` `tradeTowards` (offer rate-limit) |
| **E — Simulation harness** | `src/sim/*`, `__tests__/simulate.test.ts` | — |
| **Q — QA / adversarial** | `__tests__/invariants.test.ts`, `__tests__/fuzz.test.ts` | — (report bugs, don't fix others' files) |
| **F — Market events** | `events.ts`, `__tests__/events.test.ts`, `styles/events.css` | `types.ts` `MarketEventType` union only |

Phase 2 (after the lead merges phase 1): one stream for Financing + Full-Stack **UI** (desktop + mobile), one for **AI** (Full-Stack strategy, interplay, tuning), then balance simulations, adversarial review, browser QA and docs.
