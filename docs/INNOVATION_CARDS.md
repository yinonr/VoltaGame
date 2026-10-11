# Infrastructure Innovation Cards: design for the next session

_Status: design only (Session 3 final sprint). Nothing here is implemented, and the default decks are unchanged. Classic keeps its 25-card deck._

**Design rule: cards create moments, not engines.** Each card is a one-time tactical opportunity: no lasting buildings, production boosts, discounts or technology trees. Lasting progression already belongs to Full-Stack Integration.

**The problem to solve.** Under the Compute rules, Innovation Card purchases drop from about 7.4 to 3.9 per game, because GPUs go to factories (`docs/BALANCE.md`). A card costs 1 Land + 1 Capital + 1 GPU. New cards should make that GPU feel well spent, without handing out free resources.

## Recommended priority

| Priority | Card | Why first |
| --- | --- | --- |
| 1 | **GPU Optimization** | Addresses the card-economy problem directly: the GPU you spend on the card comes back on a factory build. It's a clear, satisfying moment. |
| 2 | **Nuclear Power Plant** (grid restore) | Uses Grid Stability, is defensive, interactive and instant, and needs no lasting state. |
| 3 | **Battery Storage** (backup output) | A personal, instant counterpart to Nuclear: it compensates you without restoring the hex for rivals. |
| Later | Solar Farm (redesigned) | As proposed, it is a weaker Resource Grant. |
| Later | Advanced Cooling | Risks rewarding the strongest factory, and needs a pending "next roll" effect. |

Suggested Compute deck (opt-in through the Compute rules only): the base 25, plus 2 GPU Optimization, 2 Nuclear Power Plant and 1 Battery Storage, for 30 cards. Adding cards changes the Compute deck shuffle, so re-baseline the Compute seeds deliberately. Classic fixtures are unaffected.

All cards follow the existing rules: one Innovation Card per turn, never on the turn it was bought, main phase unless noted.

## 1. GPU Optimization: "Hardware efficiency"

| Aspect | Specification |
| --- | --- |
| Effect | This turn, your next AI Factory build costs 1 GPU less: a standard upgrade (3 Capital + 1 GPU), a financed upgrade (1 Capital + 1 GPU) or Integrated Deployment (1 GPU instead of 2). |
| Activation | Your main phase; you need an eligible factory build available (otherwise the card is unplayable, with a reason shown). |
| Duration | Consumed by the first factory build this turn, or lost at End Turn. It applies to one build and never takes a cost below 0. |
| Opportunity | Enables a factory a turn early, or saves a GPU for a second build. |
| Balance | Worth about 1 GPU, below Resource Grant (2 resources) but targeted at the scarcest input. It refunds the GPU the card cost. |
| Grid Stability | None. |
| Financing / Full-Stack | It makes a financed upgrade cost 1 Capital + 1 GPU: watch the debt-free probe and consider limiting the discount to standard upgrades and Integrated Deployment if Financing gains. It helps reach the "operational factory" milestone. |
| Complexity | **Medium.** A turn-scoped flag (`gpuDiscount: boolean`, cleared at END_TURN), one cost helper used by `checkBuild('factory')`, `checkFinancedUpgrade` and `checkIntegratedDeployment` and by their reducer payments, plus AI (play it when one GPU short of a factory) and UI (discounted cost chips). |

## 2. Nuclear Power Plant: "Resilient baseload"

| Aspect | Specification |
| --- | --- |
| Effect | **End the current outage now.** The hex comes back online at once, for everyone touching it. Grid stabilization keeps running. |
| Activation | Any time you may play a card on your turn (before or after rolling, like Infrastructure Priority), while an outage is active. |
| Duration | Instant. |
| Opportunity | Rescues a blocked factory before a big roll, or cancels a rival's Infrastructure Priority play. |
| Balance | Worth up to 4 rolls of a hex's output, shared with rivals on that hex, so it's a social decision. It's weaker than Priority's steal, which is fine for a defensive card. |
| Grid Stability | Designed for it. Outages last 4 rolls, so its value is real but bounded. |
| Financing / Full-Stack | It un-stalls a financed factory's repayment, a natural pairing for leveraged companies; that is part of the risk/reward rather than a loophole, because the card costs a GPU. |
| Complexity | **Low.** One action (`PLAY_GRID_RESTORE`): set the marker to the Dead Zone and `grid.outageRolls = 0`, log, AI (play it when its own factory is blocked and that hex is likely to roll), UI (a card button). |

## 3. Battery Storage: "Backup power"

| Aspect | Specification |
| --- | --- |
| Effect | **Draw on your backup:** collect at once what your own buildings next to the outage hex would produce on one roll of that hex: 1 per cluster or financed factory, 2 per full factory. The market shortage rule applies. A financed factory repays 1 unit for this payout, as for a real production. |
| Activation | Your main phase, while an outage blocks a hex that one of your buildings touches. |
| Duration | Instant. |
| Opportunity | Turns a rival's outage on your best hex into a one-off payout, without helping your rivals on the same hex. |
| Balance | Usually 1–3 resources, scaling with what was blocked. It's capped by the outage hex, so it can't grow into an engine. |
| Grid Stability | Only playable during an outage (about 35% of rolls under Grid Stability), which makes it a reactive moment. |
| Financing / Full-Stack | It lets a stalled financed factory repay 1 unit, a mild help for leveraged companies. No effect on Full-Stack. |
| Complexity | **Low–medium.** One action that reuses the production code for one hex and one player, plus AI and UI. |

**Nuclear vs. Battery:** Nuclear ends the outage for everyone. Battery pays only you and leaves the outage in place. They create different decisions, so both are worth keeping. If only one can ship, ship Nuclear: it is simpler, and its effect is easier to see on the board.

## Deferred candidates

- **Solar Farm.** As proposed (+2 Power) it is strictly weaker than Resource Grant. A redesign worth testing: "Collect 1 Power for each of your buildings that touches a Power hex (up to 3)", which rewards building near energy and stays instant.
- **Advanced Cooling.** "+1 production on a factory's next successful roll" needs a pending effect stored until that roll, and rewards whoever already owns the best factory. If revisited, make it instant ("collect 1 of each resource your chosen factory touches, up to 3") and capped.

## Multiplayer note

GPU Optimization adds one turn-scoped flag. Nuclear and Battery need no new state beyond the existing outage marker and the `grid` timers. All three remain deterministic: no RNG, no hidden information beyond the card in hand.
