# Full-Stack Integration — calibration

_Full-Stack stream, Session 2 (2026-10-11). Engine: `src/engine/fullstack.ts`. AI: the Full-Stack section of `src/engine/ai.ts`. Harness: `src/engine/__tests__/fullstack-calibration.test.ts` (skipped unless `SIM_FULLSTACK` is set)._

```bash
SIM_FULLSTACK=1 npx vitest run src/engine/__tests__/fullstack-calibration.test.ts
# options: SIM_FULLSTACK_GAMES=200  SIM_FULLSTACK_SEED=7000  SIM_FULLSTACK_OUT=report.md
```

The default run plays 600 games (200 seeds × 3 rule sets) in about 8 s on one core and prints every table below.

## Verdict

- **Thresholds stay as specified:** 1 operational AI Factory, 3 sites, 4 resource types, 4 connected Network Connections (`1F/3S/4R/4N`).
- **Unlock timing is on target:** median **5 CP** (87% of unlocks fall in the 4–6 CP band), round 10 of 14, with 4 rounds left to use it. 77% of companies unlock (not automatic: 23% never do). Every game has at least one unlock.
- **Integrated Deployment is useful but does not replace normal building:** the AI deploys 0.28 times per game, in 24.5% of games, compared with 7.5 clusters, 3.0 standard upgrades and 7.6 financed upgrades per game. Saving hard for it is neutral to slightly negative for the AI, even at lower costs (tested down to 6 resources), so it is an efficiency perk and not a dominant strategy.
- **Full-Stack does not change the pace of the game:** COMPUTE_RULES games average 14.2 rounds, against 14.1 with Financing alone. The big change from Classic (17.5 rounds) comes from Financing; see *For the lead* below.
- **`INTEGRATED_DEPLOYMENT_COST` stays at 8.** Nothing here clearly requires a change. A 7-resource option is documented below in case the owner wants rivals to use it more visibly.

## Definitions

| Term | Meaning |
| --- | --- |
| Seeds | 7000–7199: the same 200 seeds for every rule set. 4 AI companies (Parallax Labs, Helixa Bio, Ambulo Robotics, Stacksmith in seats 0–3), Quick Start, the shipped AI (`decideAIAction`). |
| Rule sets | **Classic** = no `rules` field. **Financing only** = `{ financing: true }`. **COMPUTE_RULES** = `{ financing: true, fullStack: true, marketEvents: false }`. Openings are identical across rule sets for the same seed. |
| Turns / rounds | Turns = the global turn counter at game end. Rounds = ⌈turns / 4⌉ (one round = every company has had a turn). |
| Unlock | The engine sets `Player.fullStackTurn` in the reducer hook (`updateFullStack`). The harness checks on every unlock that all four milestones hold and that the stamp equals the current turn. |
| CP at unlock | Total Compute Points, including hidden Breakthrough cards, right after the unlocking action. |
| Binding milestone | The milestone(s) that became true on the unlocking action, i.e. the last one(s) reached. "Sole binding" means it was the only one. |
| Builds | Paid actions counted per game (all companies together): clusters, standard AI Factory upgrades, financed upgrades, refinances, Integrated Deployments, Network Connections and Innovation Cards. Free connections from the Network Expansion card are not counted. |
| Virtual thresholds | Alternative milestone thresholds measured on the same COMPUTE_RULES trajectories. Indicative only: the AI's light-touch chase follows the engine thresholds. |
| Head-to-head (H2H) | For each seed and each seat, one seat plays an AI variant while the other three play the reference AI. The seat's win rate is compared with the reference-only game on the same seed. n = 800 seat-games; standard error ≈ 1.5 points around 25%. The variants were temporary local knobs and are not in the code. |

## Results (shipped engine and AI)

### Game length and builds per game

| Rule set | Finished | Turns, mean | Turns, median | Rounds, mean | Rounds, median (IQR) | Clusters | Std factories | Financed upgrades | Refinances | Integrated Deployments | Connections | Cards |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Classic | 200/200 | 68.3 | 69.0 | 17.5 | 18.0 (15.8–20.0) | 9.16 | 7.59 | 0.00 | 0.00 | 0.00 | 20.97 | 7.96 |
| Financing only | 200/200 | 54.8 | 54.0 | 14.1 | 14.0 (12.0–16.0) | 7.88 | 3.33 | 7.67 | 3.62 | 0.00 | 18.43 | 4.25 |
| COMPUTE_RULES | 200/200 | 54.9 | 54.0 | 14.2 | 14.0 (12.0–16.3) | 7.50 | 2.99 | 7.59 | 3.61 | 0.28 | 18.52 | 4.49 |

### Win share by company

| Rule set | Parallax Labs | Helixa Bio | Ambulo Robotics | Stacksmith | Winner final CP, mean | Loser final CP, mean |
| --- | --- | --- | --- | --- | --- | --- |
| Classic | 34.5% | 32.0% | 19.5% | 14.0% | 10.1 | 6.4 |
| Financing only | 28.0% | 31.0% | 24.0% | 17.0% | 10.1 | 6.3 |
| COMPUTE_RULES | 31.5% | 29.0% | 24.5% | 15.0% | 10.1 | 6.2 |

### Full-Stack unlocks (COMPUTE_RULES, 800 company-games)

| Measure | Value |
| --- | --- |
| Companies unlocking | **77.0%** (616/800) |
| Games with ≥ 1 unlock | **100%** (unlocks per game: 0: 0 · 1: 9 · 2: 42 · 3: 73 · 4: 76) |
| CP at unlock | mean 5.3, median **5** (IQR 5–6) |
| CP at unlock, distribution | 4 CP 24.5% · 5 CP 40.3% · 6 CP 22.4% · 7 CP 6.8% · 8 CP 4.5% · 9 CP 1.5% (4–6 CP: **87.2%**) |
| Round at unlock | mean 10.2, median **10** (IQR 8–12) |
| Rounds left after the unlock | median 4, mean 4.4 |
| Unlocked on a rival's turn | 21 (a financed factory completing on someone else's roll) |
| Milestones already met after the opening draft | factory 0% · sites 0% · resources **95.3%** · network 0% |

| Binding milestone (reached last) | Share of unlocks | Sole binding |
| --- | --- | --- |
| factory | 15.1% (93) | 15.1% (93) |
| sites | 13.1% (81) | 12.8% (79) |
| resources | 0.6% (4) | 0.3% (2) |
| network | 71.4% (440) | 71.4% (440) |

| Company | Unlock rate | CP at unlock, median | Round at unlock, median | Integrated Deployments / game | Win share |
| --- | --- | --- | --- | --- | --- |
| Parallax Labs | 85.0% | 5 | 10 | 0.07 | 31.5% |
| Helixa Bio | 77.0% | 5 | 11 | 0.11 | 29.0% |
| Ambulo Robotics | 76.5% | 5 | 10 | 0.03 | 24.5% |
| Stacksmith | 69.5% | 5 | 10 | 0.07 | 15.0% |

### Integrated Deployment and winning

0.28 Integrated Deployments per game. 8.9% of unlockers deploy at least once, never more than once (1.00 per deployer). At least one deployment happens in 24.5% of games.

| Group (COMPUTE_RULES) | Company-games | Win rate | Final CP, mean |
| --- | --- | --- | --- |
| Unlocked Full-Stack | 616 | 32.1% | 7.9 |
| Never unlocked | 184 | 1.1% | 4.9 |
| Deployed at least once | 55 | 65.5% | 9.6 |
| Unlocked, never deployed | 561 | 28.9% | 7.7 |

99.0% of winners had unlocked, and 18.0% of winners had deployed.

**These win rates show selection, not a Full-Stack advantage.** Counterfactual: with Full-Stack off (Financing only, same seeds), 72.1% of companies still meet all four milestones at some point (median 5 CP, round 10). 97.5% of winners meet them, and the win rate is 33.8% for companies that meet them against 2.2% for those that never do. The milestones describe a company that is building well. The status adds a reward on top of that, and does not cause the wins.

### Alternative thresholds (virtual, COMPUTE_RULES trajectories)

| Thresholds | Unlock rate | CP at unlock, median (IQR) | In 4–6 CP | Round, median | Rounds left, median | Binding: factory / sites / resources / network |
| --- | --- | --- | --- | --- | --- | --- |
| **engine (1F/3S/4R/4N)** | 77.0% | 5 (5–6) | 87.2% | 10 | 4 | 15.1% / 13.1% / 0.6% / 71.4% |
| 1F/3S/4R/3N | 84.0% | 5 (4–5) | 93.3% | 9 | 5 | 21.6% / 33.9% / 1.9% / 44.2% |
| 1F/3S/4R/5N | 59.5% | 6 (5–7) | 53.8% | 11 | 3 | 11.3% / 4.4% / 0.2% / 84.0% |
| 1F/4S/4R/4N | 57.8% | 7 (6–8) | 42.4% | 12 | 2 | 11.0% / 75.1% / 0.4% / 13.9% |
| 1F/3S/5R/4N | 57.9% | 5 (4–6) | 85.3% | 10 | 4 | 14.7% / 12.1% / 8.2% / 69.3% |

## AI tuning experiments (COMPUTE_RULES, seeds 7000–7199, cost 8)

The AI uses Integrated Deployment whenever it is legal and affordable and the best open site is worth it (`vertexValue` ≥ 3). It prefers this to both a plain cluster and a standard upgrade on the same turn. The open question was how hard it should save for it.

| Variant: deployment goal score / hold factory and financing when ≤ k short / hold cluster when ≤ k short | Deployments / game | Games with ≥ 1 | Rounds, mean | H2H seat win rate (ref 25.0%) |
| --- | --- | --- | --- | --- |
| 3.7 × factories / ≤ 1 / never (first draft) | 0.15 | 14.5% | 14.1 | 25.0% (it is the reference) |
| **4.4 × factories / ≤ 1 / ≤ 1 (shipped)** | **0.28** | **24.5%** | 14.2 | **24.9%** |
| 5.0 / ≤ 2 / ≤ 1 | 0.39 | 34.0% | 14.2 | 24.3% |
| 5.5 / ≤ 2 / ≤ 2 | 0.81 | 60.5% | 14.5 | 23.5% |
| 6.5 / ≤ 3 / ≤ 2 | 0.94 | 65.0% | 14.7 | 23.5% |

The standard upgrade's goal scores 3.4 × factories, and its cost is a subset of Integrated Deployment's. At 4.4, the deployment goal ranks first only when at most one of its extra Power, Networking and Land is missing. Saving harder triples usage but costs the saver about 1.5 points of win rate and makes every game longer, so the shipped AI saves only when it is one resource short.

**Milestone chase.** When exactly one milestone is missing and it is cheap, the AI gets a small push. For *resources*, a site touching a missing type gets +2 value. For *network*, with 1–2 connections missing, a connection that grows the largest group gets +3, plus a road goal. Measured with the 3.7 draft AI: with the chase switched off for all companies, 72.3% unlock (mean round 10.6, mean 5.5 CP). With it on, 76.3% unlock (round 10.2, 5.3 CP). In H2H, one seat without the chase wins 25.1% against the 25.0% reference, so the chase is neutral in strength and brings unlocks slightly earlier. Factory and site milestones need no push, because the AI's existing goals already pursue them.

## Cost experiments (evidence only; `constants.ts` is unchanged)

`INTEGRATED_DEPLOYMENT_COST` was changed locally for these runs and then reverted. The AI was the 3.7 first draft, plus an H2H "hard saver" (5.5 / ≤ 2 / ≤ 2) against it.

| Cost | Deployments / game | Games with ≥ 1 | Rounds, mean | Hard saver H2H (ref 25.0%) |
| --- | --- | --- | --- | --- |
| **8: 1P + 1N + 1L + 3C + 2G (shipped)** | 0.15 | 14.5% | 14.1 | 23.5% |
| 7: 1N + 1L + 3C + 2G | 0.28 | 25.5% | 14.1 | 24.3% |
| 7: 1P + 1N + 1L + 2C + 2G | 0.38 | 32.5% | 14.1 | 23.8% |
| 6: 1L + 3C + 2G (= the legacy card) | 0.51 | 43.5% | 13.8 | 25.0% |

Even at 6 resources, saving for Integrated Deployment is only break-even for the AI, so a lower price would not create a dominant strategy. Usage is limited mostly by timing: the unlock comes in round 10 of 14, and the GPUs and factory pieces compete with financed upgrades, not with the price.

## Findings

1. **Unlock timing matches the brief.** Unlocks come at 4–6 CP in 87% of cases, with 4 rounds left. 77% of companies unlock and 23% never do. The other threshold sets either unlock later and rarer (5N, 4S: median 6–7 CP, 2–3 rounds left) or slightly earlier and more often (3N: 84%).
2. **Network is the real gate (71% binding).** Factory (15%) and sites (13%) follow. The **resources milestone is almost free**: 95.3% of companies meet it straight after the opening draft. It still works as a breadth check and an early "1/4" in the UI. Raising it to 5 types (`1F/3S/5R/4N`) would cut unlocks to 58% without delaying them, so it would turn the status into opening-placement luck. Not recommended.
3. **Integrated Deployment is a real but modest reward.** It is +2 CP and a new double-output site in one move, used in a quarter of AI games, and never more than once per company. Conventional building is unaffected (7.5 clusters and 10.6 factory upgrades of both kinds per game).
4. **Full-Stack is balanced by company.** Win shares under COMPUTE_RULES (31.5 / 29.0 / 24.5 / 15.0) are closer to even than Classic's (34.5 / 32.0 / 19.5 / 14.0). Stacksmith unlocks least (69.5%), plausibly because its style (factories 1.35, expansion 0.95) favours upgrades over the connections that the network milestone needs.
5. **Off-turn unlocks happen** (21 in 200 games), as the contract anticipated: a financed factory finishing its commitment on a rival's roll.

## Recommendations

- Keep `FULLSTACK_MIN_SITES = 3`, `FULLSTACK_MIN_RESOURCE_TYPES = 4`, `FULLSTACK_MIN_NETWORK = 4` (and 1 operational factory).
- Keep `INTEGRATED_DEPLOYMENT_COST` at 8 for the release candidate. If the owner wants rivals to use Integrated Deployment visibly more often, the best option is **7 = 1P + 1N + 1L + 2C + 2G**. It is still cheaper than cluster + upgrade (9), it more than doubles usage (0.15 → 0.38 per game with the draft AI), game length is unchanged and saving stays non-dominant. It would need a `constants.ts` change, the UI cost text and the test that pins the recipe.
- UI copy: the resources milestone will usually show as already done. Describe it as "broad resource access" rather than as a challenge.
- **For the lead (Financing, not Full-Stack):** Financing alone shortens games by 20% (17.5 → 14.1 rounds), and financed upgrades outnumber standard ones about 2.3 : 1 (7.67 vs 3.33 per game). That may be intended ("Financing buys speed"), but it is the largest balance shift in COMPUTE_RULES. It also uses up factory pieces and GPUs that Integrated Deployment needs. Any Financing retune should rerun this harness.

## Always-on coverage

`src/engine/__tests__/fullstack.test.ts`, block *computer opponents under COMPUTE_RULES*: 24 AI-only COMPUTE_RULES games (seeds 1–24) finish legally and conserve all 19 × 5 resources. After every action, a company meeting all four milestones is unlocked, and nobody unlocks without them. Measured on these seeds: 74 of 96 companies unlock and 10 Integrated Deployments happen in 10 games. The asserted floors are ≥ 48 unlocks and ≥ 3 deployments. Runtime is under 1 s.
