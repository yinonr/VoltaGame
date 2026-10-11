# Balance report: Settlers of Compute rules vs. Classic

_Session 3, 2026-10-11, branch `claude/new-session-6i54u3`, constants as committed in `8b392bb` and later._

## Method and limits

- All numbers come from **seeded all-AI games**: 4 companies, Quick Start opening, the heuristic AI in `src/engine/ai.ts` on every seat. Seeds, sample sizes and commands are listed with each table, and every run is reproducible.
- **Win share** is the share of decided games a company or group won. The fair share is 25% with 4 players.
- **Debt-free probe** (`financing-balance.test.ts`): in each game one rotating seat decides as if Financing did not exist, while the other three may finance. If Financing is fair, that seat still wins about 25%.
- **Limits:**
  - The AI is a heuristic, so these results measure the rules as this AI plays them, not optimal play.
  - In the simulations seat 0 is an AI, not a human.
  - Company styles differ, so win share by company is not expected to be flat.
  - With 200 games, ±3 percentage points of noise is normal; with 1,200 games it is about ±1.3.

## Infrastructure Financing tuning

All rows use the debt-free probe, 200 games each, seeds 9300–9499.

| Upfront cost | Commitment | Cap | Avg rounds | Financed upgrades / game | Debt-free seat wins |
| --- | --- | --- | --- | --- | --- |
| 2 GPUs (as first proposed) | 3 | 2 | 14.2 | 5.8 | **10.5%** |
| 2 GPUs | 3 | 1 | 14.4 | 5.4 | 11.0% |
| 2 GPUs | 4 | 1 | 15.1 | 5.3 | 14.5% |
| 1 Capital + 2 GPUs | 3 | 2 | 15.7 | 5.2 | 19.0% |
| 1 Capital + 2 GPUs | 3 | 1 | 15.8 | 4.7 | 21.5% |
| 1 Capital + 2 GPUs | 4 | 2 | 16.0 | 5.2 | 22.5% |
| 1 Capital + 2 GPUs | 4 | 1 | 16.1 | 4.7 | 23.0% |

Pooled over 1,200 games (seed blocks 9300 ×200, 12000 ×300, 15000 ×300, 20000 ×400), on the merged build with Full-Stack and the polish changes:

| Upfront cost | Commitment | Cap | Debt-free seat wins | Avg rounds |
| --- | --- | --- | --- | --- |
| 1 Capital + 2 GPUs | 4 | 2 | 19.2% (230/1200) | 16.0 |
| 1 Capital + 2 GPUs | 4 | 1 | 22.6% (181/800) | 16.1 |
| **1 Capital + 2 GPUs** | **5** | **2** | **22.6% (271/1200)** | **16.2** |

**Decision:** 1 Capital + 2 GPUs, a 5-unit commitment, at most 2 outstanding.

- **Why the original numbers failed:** at 2 GPUs + 3 units, Financing was close to a free factory. The committed units come only from bonus output, so the financed factory gave up nothing a cluster would have produced.
- **The cap barely matters.** Cost and commitment length are the levers, so the owner's experimental cap of 2 stays.
- **The result:** debt-free play remains competitive (about 23% against a fair 25%), and Financing still buys speed (16.2 rounds against 17.5–18.1 for Classic).

## Classic vs. the new rules (final constants)

200 games per configuration, seeds 30000–30199. Reproduce with `SIM=1 SIM_CONFIGS=classic,financing,fullstack,compute SIM_GAMES=200 SIM_SEED=30000 npx vitest run simulate`.

| | Classic | Financing only | Full-Stack only | **Compute rules** |
| --- | --- | --- | --- | --- |
| Finished / stalled / illegal AI moves | 200 / 0 / 0 | 200 / 0 / 0 | 200 / 0 / 0 | 200 / 0 / 0 |
| Game length, rounds (mean / median) | 18.1 / 18 | 16.5 / 17 | 18.4 / 18 | **16.7 / 17** |
| Close games (runner-up ≥ 8 CP) | 60.0% | 60.0% | 62.5% | 62.5% |
| Win share: Parallax / Helixa / Ambulo / Stacksmith | 28.5 / 36.0 / 21.0 / 14.5 | 27.5 / 32.0 / 22.5 / 18.0 | 26.0 / 34.0 / 22.0 / 18.0 | 29.0 / 33.0 / 22.5 / 15.5 |
| Standard factory upgrades / game | 7.5 | 3.3 | 7.2 | 3.0 |
| Financed upgrades / game | — | 7.6 | — | 7.5 |
| Innovation Cards bought / game | 7.4 | 3.8 | 7.6 | 3.9 |
| Priority Access held at end | 29.5% | 8.5% | 30.5% | 9.0% |

### Infrastructure Financing in play (Compute rules)

| Measure | Value |
| --- | --- |
| Games with at least 1 financed upgrade | 100% |
| Companies that financed | 87.1% |
| Commitments completed / refinanced / still outstanding at the end | 620 / 567 / 310 |
| Rounds to complete a commitment (mean / median) | 4.4 / 4 |
| Rounds to refinance (mean / median) | 3.7 / 3 |
| Capital per refinance (mean) | 1.8 |
| Outage-blocked rolls per commitment | 0.37 |
| Shortage-missed payouts per commitment | 0.01 |
| Companies peaking at 2 outstanding | 43% |
| Peaking at 1 | 44% |
| Never financing | 13% |
| Win rate of companies that financed | 26.4% |
| Win rate of companies that never financed | 15.5% |

The last row is a selection effect: these companies mostly had no Capital or GPUs to finance with. The controlled debt-free probe above (22.6%) is the fair comparison.

### Full-Stack Integration in play (Compute rules)

Source: `docs/FULLSTACK_CALIBRATION.md` (seeds 7000–7199), rerun with the final constants.

| Measure | Value |
| --- | --- |
| Companies that unlock | 80.0% |
| Games with at least 1 unlock | 100% |
| CP at unlock (median) | 5 (IQR 4–6) |
| Unlocks in the 4–6 CP target | 84.4% |
| Round at unlock (median) | 11 |
| Rounds left after the unlock (median) | 5 |
| Last milestone reached | network 67%, factory 21%, sites 12% |
| Integrated Deployments per game | 0.28 (0.40 in the seed-30000 run) |
| Unlockers who deploy at least once | 8.8% |

- **Winners almost always unlocked (97–100%).** That is mostly selection: in the counterfactual with Full-Stack off, 97% of winners meet the milestones anyway.
- **Integrated Deployment is modest in AI hands.** It is limited by timing (unlock in round 11 of about 16) and by Financing competing for GPUs and factory pieces.
  - A cheaper recipe raised usage in the calibration experiment: at 7 resources (2 Capital), 0.38 deployments per game; at 6 (no Power or Networking), 0.51.
  - Neither cheaper recipe made it dominant. The intended 8-resource recipe stays.

## The owner's questions

| Question | Answer from the data |
| --- | --- |
| Is Financing always optimal? | **No, after tuning.** A company that never finances wins about 23% (fair 25%). Before tuning it won 10.5%. |
| Is avoiding debt worthwhile? | **Yes.** Debt-free factories produce double from the first roll and can't be stalled by the outage. Financed factories are visibly exposed: stalled repayment, "Leveraged" badges, and the AI targets them with the outage. |
| Is a cap of 2 financed factories excessive? | **Not measurably.** Cap 2 and cap 1 differ by less than the noise. 43% of companies reach 2 outstanding at some point. |
| Does Full-Stack unlock early enough? | **Yes.** Median 5 CP, round 11, with a median of 5 rounds left. |
| Does Integrated Deployment make conventional building obsolete? | **No.** 0.3–0.4 per game, against about 10.5 standard plus financed upgrades. |
| Can territorial specialists still win? | **Yes, at a lower rate.** The most specialized third of openings wins 18.7% under Compute rules, against 21.7% in Classic and a fair 25%. Broad openings do best in both. |
| Can innovation-focused companies still win? | **Yes.** Helixa (the card-focused rival) wins 33% (36% in Classic). Companies buying 3–4 cards win 41%. Cards are bought less often overall (3.9 against 7.4 per game), because GPUs go to factories. |
| Does either mechanic create runaway leaders? | **No sign of it.** Runner-up CP (7.6) and the close-game rate (62.5%) match Classic. |

## Grid Stability (final sprint)

Grid Stability is part of the Compute rules: after a disruption the next 6 rolls are protected, and an outage lasts 4 rolls. 300 games per row per seed block (blocks 30000 and 12000; 600 games per row in total). Reproduce with `GRID_BALANCE=/tmp/grid.md N=300 S0=30000 npx vitest run grid-balance`.

| Per game (mean of both blocks) | Classic | Compute, no Grid Stability | **Compute + Grid Stability** |
| --- | --- | --- | --- |
| Game length, rounds | 18.1 | 16.6 | **15.0** |
| Natural disruptions | 11.7 | 10.8 | **4.9** (−55%) |
| 7s absorbed by the stabilizing grid | — | — | 4.9 |
| Infrastructure Priority plays | 3.1 | 1.6 | 1.0 |
| Rolls with a hex offline | 91% | 91% | **35%** |
| Average outage length (rolls) | persistent | persistent | 3.4 (rule: 4; Priority and new disruptions can end one early) |
| Discards | 6.5 | 5.5 | **3.5** |
| Thefts | 14.5 | 12.3 | **5.9** |
| Financed upgrades / refinances | — | 7.2 / 2.8 | 7.1 / 2.5 |
| Rounds to repay a commitment | — | 4.4 | 4.1 |
| Full-Stack unlock rate / Integrated Deployments | — | 81% / 0.38 | 80% / 0.38 |
| Win share P / H / A / S (%) | 28 / 34 / 22 / 17 | 31 / 31 / 22 / 17 | 33 / 29 / 21 / 18 |
| Stalls | 0 | 0 | 0 |

**Debt-free probe under Grid Stability** (rerun after the QA fixes): 22.5% (135/600; fair 25%), against 22.6% without it. Financing did **not** get stronger, so no economy change was made.

**Reading:**

- **Interruptions are halved.** Natural disruptions drop 55%, discards 35% and thefts 52%.
- **Outages are now temporary.** A hex is offline on 35% of rolls, down from about 90%, and every outage is visibly temporary.
- **7s still matter.** About 5 real disruptions per game remain, and Infrastructure Priority still moves the outage at will.
- **Games are about 1.5 rounds shorter.** That is the main side effect: production flows more freely.
- **Win shares** move within noise. Helixa (cards) dips slightly as Priority plays fall.

## Caveats and follow-ups

- **Card economy.** Financing roughly halves Innovation Card purchases and Priority Access (29.5% → 9%). That is a real shift in the card economy. Watch it in human playtests.
- **Stacksmith** (the factory-focused rival) is the weakest company in every mode (14.5–18%), as it was before this session.
- **Market events** (Credit Crunch / Compute Boom) are not merged, so they are not measured here.

## Reproduce

```bash
FIN_BALANCE=/tmp/fin.txt N=300 S0=12000 npx vitest run financing-balance     # debt-free probe (appends 1 line)
SIM=1 SIM_CONFIGS=classic,financing,fullstack,compute SIM_GAMES=200 SIM_SEED=30000 npx vitest run simulate
SIM_FULLSTACK=1 npx vitest run fullstack-calibration                          # Full-Stack calibration report
```
