# Volta Special Cards — Design Specification

> **Superseded (Session 3).** Infrastructure Financing shipped as a deliberate build choice, not a card, and Full-Stack Integration as an earned status. See `docs/STRATEGIC_SYSTEMS.md` and `docs/BALANCE.md`. The card called "Full-Stack Integration" below is now the legacy **Expedited Deployment** card (Custom game → "Special cards (beta)"). This document is kept for its reviewed accounting design.

_Status (branch `claude/volta-branding`):_

- **Card A, Full-Stack Integration: IMPLEMENTED and TESTED.** It has engine logic, AI logic, desktop and mobile UI, and 8 automated tests, and was browser-checked on desktop and at 390×844.
- **Card B, Infrastructure Financing: SPECIFIED ONLY.** It is intentionally not implemented yet, because the deferred commitment needs its own careful session.

Both cards belong to an opt-in **Volta special cards** game option (Custom game → "Special cards (beta)"). The default deck stays at 25 cards, so normal games, the AI test seeds and the **Quick Demo stay exactly as they are**: adding cards to the deck would change the shuffle and therefore the deterministic demo.

## Design goals

- Players should *feel* the strategic advantage of integration and long-term financing through play, not read about it. That means effects that change **what you can build and when**, not generic "+2 resources" bonuses.
- The cards fit the existing Innovation Card rules:
  - bought for 1 Land + 1 Capital + 1 GPU;
  - one card played per turn;
  - never on the turn it was bought;
  - main phase only (after rolling).
- They must be exciting draws for someone who has never heard of Volta. The theme explains the effect; the effect stands on its own.
- They must not unbalance the race to 10 Compute Points.

---

## Card A — Full-Stack Integration ✅ implemented

> **Full-Stack Integration** · *"One platform. Every layer."*
> Deploy an **AI Factory directly onto an open site** on your network, skipping the Compute Cluster stage.
> Pay **1 Land + 3 Capital + 2 GPUs**. Power and connectivity come integrated. **+2 CP at once.**

| Property | Value |
| --- | --- |
| Rarity | 2 copies (deck grows from 25 to 27 with Volta cards on) |
| Timing | Your main phase, after rolling. It is your one Innovation Card for the turn and can't be played the turn it was bought. |
| Requirements | A legal cluster site (distance rule plus touching your network), a free AI Factory piece, and the resources |
| Effect | A factory is placed on the site (uses a factory piece, not a cluster piece), the cost goes to the market, and you gain +2 CP immediately with doubled production from the next roll |
| Theme | Volta's vertically integrated model: site, power, financing, compute and operations delivered as one project instead of layer by layer |

### Why this mechanic

| Option considered | Verdict |
| --- | --- |
| "Pay any resources for one build" (wildcard payment) | A generic resource bonus. Easy to understand, but there's little to decide. |
| Flat discount on a factory upgrade | Too small to feel exciting, and gives no spatial decision. |
| **Factory straight onto a new site (chosen)** | Creates real decisions: *where* (a doubled-output site from day one magnifies site choice), *when* (holding 6 specific resources versus spending them on two smaller builds), and *denial* (grab a contested site or hub before a rival). It adds one action and one placement mode. |

### Value and balance

- **Cost:** the normal path to the same board state is a cluster (P+N+L+C) plus an upgrade (3C+2G), which is 9 resources and usually two turns. The card costs 6 resources in one action. Saving 3 resources plus tempo puts it in line with the base deck: Network Expansion is worth about 4 resources, Resource Grant 2, and Market Consolidation is variable.
- **Size of the swing:** +2 CP in one action is the same swing as building a cluster and upgrading it in the same turn, which is already legal. No new win condition appears.
- **Rarity:** two copies out of 27 means a typical game sees 0–2 of them played.
- **Measured:**
  - The AI plays **25%** of the Integration cards it draws, over 200 seeded all-AI games (seeds 9000–9199). Average game length is 17.9 rounds, and wins split 57/56/44/43, so balance is unaffected.
  - Before the AI learned to save toward the card, it played only about 12%. A regression test asserts at least 18% over 100 seeds.
  - The main remaining limit is **site availability**: an independent review measured that about 28% of drawn copies never see an open network site before the game ends.

### Rules interactions and edge cases

- **Network:** the factory can cut a rival's Longest Network like any new building. Longest Network is recomputed and announced.
- **Pieces:** a factory piece is used and no cluster piece. If all four factories are built, the card isn't playable ("All 4 AI Factories are built.").
- **Production:** a factory under the Grid Disruption produces nothing, as usual. A factory touching a hub gets the hub rate.
- **Winning:** you can win with it on your own turn, the same as with any build.
- **Payment:** the cost always goes to the market supply, so total resources are conserved (tested).
- **Card limit:** it uses up your one Innovation Card play for the turn (tested).

### AI logic (implemented in `ai.ts`)

- **Play:** in `cardAction`, checked first. If `checkPlayCard(state, me, 'integration')` passes, the AI plays `PLAY_INTEGRATION` on its best open site, using the same `vertexValue` heuristic it uses for clusters.
- **Save:** in `goals()`, while the AI holds the card and has a factory piece plus an open site, it adds an `integration` goal priced at `INTEGRATION_COST` with a score of 4.2 × factory appetite. Market trades, discards and trade evaluation then protect the card's Capital and GPUs instead of treating them as surplus.
- **Find a site:** while holding the card with no open site, the "connection toward a new site" goal stays active even when all cluster pieces are used.
- **Don't pre-empt:** in `mainPhase`, when the AI is within 1 resource of the integration goal, it skips the immediate ordinary factory upgrade that would spend the same Capital and GPUs.

These four changes come from the independent review below.

### Implementation map (done)

- **`types.ts`:**
  - added `'integration'` to `DevCardType`;
  - added the `{ type: 'PLAY_INTEGRATION'; vertex }` action;
  - added the optional `GameState.voltaCards`.
- **`constants.ts`:**
  - `INTEGRATION_COST`;
  - `VOLTA_CARD_COMPOSITION = { integration: 2 }`;
  - `DEV_CARD_INFO.integration`, with a `flavor` field.
- **`game.ts`:**
  - the `NewGameOptions.voltaCards` option builds the deck with the extra cards;
  - the `PLAY_INTEGRATION` reducer case validates the site, plays the card, pays, places the factory and updates Longest Network.
- **`rules.ts`:** `PlayableCardType` and the `checkPlayCard` integration checks (factory piece, site, cost), with readable reasons.
- **`ai.ts`:** the card play described above.
- **UI:**
  - Play enters the `integration` placement mode: legal sites glow and a factory ghost shows the result. On phones, the player confirms on the board.
  - The card list shows the flavor text, and the card has its own style.
  - Custom game has a checkbox for the option.
- **Tests:** `src/engine/__tests__/volta-cards.test.ts` covers:
  - the deck is unchanged by default and has 27 cards with the option on;
  - the effect and cost;
  - placement legality;
  - timing, cost and piece-limit refusals;
  - the one-card-per-turn limit;
  - the AI uses the card;
  - full AI games finish.

### Possible later refinements (not needed for balance)

- A smarter road planner that steers toward open sites earlier when the AI holds the card. This would attack the 28% of copies that never see a site.
- A short "integrated deployment" animation, for example the site, power line and factory appearing in sequence.

---

## Card B — Infrastructure Financing 📝 specified, not implemented

> **Infrastructure Financing** · *"Build for the long term."*
> Upgrade one of your Compute Clusters to an **AI Factory for just 2 GPUs**, with no Capital upfront.
> The factory is **financed by its own output**. Until it has delivered **3 committed units**, it produces like a cluster and scores 1 CP. Its bonus output goes to the market. After that, it is a full AI Factory (+1 CP, double output).
> *Refinance:* on your turn you may pay **1 Capital per remaining unit** to clear the commitment early.

| Property | Value |
| --- | --- |
| Rarity | 2 copies (deck goes from 27 to 29 with both Volta cards) |
| Timing | Your main phase, after rolling. It is your one Innovation Card for the turn and can't be played the turn it was bought. |
| Requirements | One of your clusters, a free AI Factory piece, 2 GPUs, and **no other financed factory of yours currently outstanding** |
| Commitment | 3 units ("capacity commitment"), stored in the `FINANCING_COMMITMENT` constant |
| Theme | Infrastructure-backed financing: the asset's long-term output secures the capital used to build it. It is closer to project finance and long-term compute offtake than to a startup loan. No interest, no default, no debt spiral. |

### The player's decision

You are short on Capital (the most contested input for factories) but have GPUs and a good cluster. You can wait and trade for 3 Capital, or **upgrade now and let the site's own production pay for it**.

Upfront, you keep the 3 Capital for other builds *this turn*, such as a cluster or a card, and the cluster piece returns to supply for reuse. The factory's production and CP stay at cluster level until the commitment clears. After that you own a full factory that cost 2 GPUs plus 3 units of output.

### Exact rules

1. **Playing:** the cluster becomes `{ owner, kind: 'factory', financed: 3 }`. The player pays 2 GPUs to the market and uses one factory piece; the cluster piece returns to supply.
2. **Production while financed** (`(b.financed ?? 0) > 0`):
   - Inside `produce()`'s tile loop, a financed factory adds **1**, not 2, to `owed[owner][resource]`. It also records `{ vertex, owner, resource }` in a local `pendingDeliveries` list.
   - The existing shortage check runs unchanged on these real amounts. The committed unit never leaves the market, so it must not count toward the shortage total.
   - After the shortage check, each pending delivery **succeeds only if** `!shortages.includes(resource)`. This includes the sole-claimant partial-payout branch: any shortage means no delivery.
   - A successful delivery writes a **new** Building with `financed - 1`.
   - A hex under the Grid Disruption pays nothing, so the commitment stalls.
   - A vertex receives at most one payout per roll, because `numbersAreFair` forbids identical neighboring numbers. The code should still handle several payouts generally.
3. **Scoring:** a financed factory scores **1 CP**. When the field disappears, it scores 2 CP and produces 2.
4. **Completing on a rival's roll:** the commitment can finish during another company's roll, putting the owner on 10 CP. The owner still wins only at the start of their own next turn, because the END_TURN reducer runs `checkVictory` for the new current player. This is the familiar "win on your own turn" rule.
5. **Refinance** (new action `REFINANCE { vertex }`):
   - The owner pays `financed` × Capital to the market in the main phase, and the field is removed.
   - It is **not** a card play: it neither reads nor sets `devCardPlayedThisTurn`.
   - It goes through the normal reducer tail, so `checkVictory` runs immediately.
   - It **is allowed on the same turn** the card was played. That costs 2 GPUs + 3 Capital in total, exactly a normal upgrade, so it is no exploit and needs no extra state.
6. **Limit:** at most one outstanding financed factory per player. This stops stacking.

### State management rules (from the review)

- **Never mutate a Building in place.** `cloneState` copies the `buildings` array shallowly, so Building objects are shared with the previous state. Always write a new object, for example `s.buildings[v] = left > 0 ? { owner, kind: 'factory', financed: left } : { owner, kind: 'factory' }`. Both completion and REFINANCE end with the field **absent**, never 0.
- **Every reader tests `(b.financed ?? 0) > 0`.** Old saves without the field then read as unfinanced, and no save-version bump or migration is needed. `loadSavedGame` does no migration.
- **Add `ProductionReport.deliveries?: { player; vertex; resource; left }[]`.** It is optional because `lastProduction` exists in old saves. `produce()` fills it. The ROLL case logs one line per delivery, plus a completion line ("…'s financed factory is now a full AI Factory (+1 CP)"). The board's payout chip reads `report.deliveries ?? []` and shows `+1` with a small "delivered" marker for those vertices.
- **Determinism:** no new RNG use, so existing seeds replay identically.

### Code that currently assumes every factory produces double

Add a shared helper, `outputMultiplier(b) = b.kind === 'factory' && !((b.financed ?? 0) > 0) ? 2 : 1`, and use it everywhere a factory is treated as double:

- `game.ts produce()`, together with the pending-delivery logic above;
- `evaluation.ts productionPips`, which feeds `vertexValue`, `evaluateOffer` and `estimateRivalHoldings`;
- `ai.ts chooseDisruption` and `disruptionHurtsMe`;
- `Board.tsx`, the payout chip text;
- `scoring.ts scoreBreakdown`:
  - `factories` counts completed factories only;
  - a new `financedFactories` field counts financed ones;
  - `publicTotal = clusters + financedFactories + 2 × factories + bonuses`;
- `modals.tsx`, the end-game standings: show financed factories separately, e.g. "2 (+1 financed)", so the column agrees with the Total.

`piecesUsed`, `piecesLeft` and `legalFactoryVertices` correctly keep counting a financed factory as a factory piece, so they need no change.

### Exploit and balance review

| Risk | Mitigation |
| --- | --- |
| Instant win from a cheap factory | The card alone never grants CP: the +1 is deferred until 3 units are delivered. Refinancing on the same turn costs exactly a normal upgrade (2 GPUs + 3 Capital). |
| Stacking several cheap factories | One outstanding financed factory per player, and only 2 copies in the deck. |
| "Free" factory on a site that never produces | Allowed, but self-defeating: the commitment never completes. The AI only finances on 6+ pip sites. The UI warns when the cluster's unblocked adjacent production totals **fewer than 6 pips**. |
| Dodging the commitment | Not possible. Buildings are never removed, and Market Consolidation and steals affect hands, not commitments. |
| Phantom market shortages | Prevented by counting the financed factory at 1 in `owed` (rule 2). |
| Strength versus a normal upgrade | Normal: 3C + 2G now gives +1 CP and ×2 output now. Financed: 2G now plus 3 future output units gives the same result later. Same resource count, shifted in time, with Capital swapped for production. The advantage is liquidity and tempo, not raw value. |
| A new outage target | A financed factory is a juicy disruption target, because blocking it delays a rival's CP. That is a feature: rivals can contest the commitment through the existing robber-style interaction. |

**Commitment length.** Expected rounds to deliver 3 units ≈ 3 × 36 / (players × pips) = **108 / (players × pips)**, because the site's hexes pay on every player's roll.

| Site pips | 4 players | 3 players | 2 players |
| --- | --- | --- | --- |
| 6 | 4.5 rounds | 6 | 9 |
| 9 | 3.0 | 4 | 6 |
| 12 | 2.25 | 3 | 4.5 |

Three units is about 2–3 rounds on the 9–12 pip sites the AI actually holds. Tune `FINANCING_COMMITMENT` (for example to 4) if playtests show it is too strong.

### AI logic (to implement)

The originally written rule ("goal is factory" **and** "missing at least 2 Capital") is circular. `currentGoal` penalizes missing resources, so the factory goal loses exactly in the Capital-poor hands where Financing helps. An independent measurement found it would trigger for only about 17% of drawn cards. Use this instead:

- **Price the factory goal at the card's cost.** While holding a playable Financing card and having an eligible cluster, `goals()` prices the factory goal at `FINANCING_COST` (2 GPUs) instead of `COSTS.factory`.
- **Play condition:** play `PLAY_FINANCING` when all of these hold:
  - the AI has fewer than 2 Capital;
  - it holds at least 2 GPUs;
  - it has no outstanding financed factory;
  - its best cluster `v` has at least 6 unblocked pips.
- **Choosing `v`:** use the same weighting as `bestFactoryVertex` (outage × 0.4, Capital/GPU hexes × 1.15).
- **Refinance:** when `Capital ≥ financed` and either it reaches 10 CP this turn, or no preferred affordable goal remains at the end of the main phase.
- **Outage targeting:** `chooseDisruption` uses `outputMultiplier`, so a financed factory counts ×1. It adds a **separate** bonus term for hexes adjacent to a rival's financed factory, without double-counting.
- **Test:** assert a play-rate floor over seeded all-AI games, for example at least 30% of drawn copies played, not just "played > 0".

### Implementation steps for the next session (in order)

1. **Types:**
   - add `'financing'` to `DevCardType`;
   - add `Building.financed?: number`;
   - add the actions `{ type: 'PLAY_FINANCING'; vertex }` and `{ type: 'REFINANCE'; vertex }`;
   - add `ProductionReport.deliveries?` (see above).
2. **Constants:**
   - `DEV_DECK_COMPOSITION.financing = 0`, Volta-only like `integration: 0`;
   - `VOLTA_CARD_COMPOSITION.financing = 2`;
   - `FINANCING_COST = { gpu: 2 }`;
   - `FINANCING_COMMITMENT = 3`;
   - a `DEV_CARD_INFO.financing` entry with its flavor text.
3. **Rules:**
   - add `'financing'` to `PlayableCardType`, and add `checkPlayCard(…, 'financing')` (own cluster, factory piece, 2 GPUs, no outstanding commitment, with readable reasons);
   - add `legalFinancingVertices` (own clusters);
   - add `checkRefinance`: turn check (main phase, own turn, no pending trade) plus an owned financed factory plus `capital ≥ financed`.
4. **Reducer:** add `PLAY_FINANCING` and `REFINANCE` cases that follow the immutability rule. Log the play, each delivery and the completion.
5. **`produce()`:** rule 2 exactly as written, with pending deliveries and the shortage gate, using the `outputMultiplier` helper.
6. **Scoring:** the `scoreBreakdown` semantics above.
7. **AI:** the logic above, plus `outputMultiplier` in `productionPips`, `chooseDisruption` and `disruptionHurtsMe`.
8. **UI:**
   - add a `financing` placement mode on your clusters: extend `Mode` in GameScreen, add an explicit `onPlayCard` branch (otherwise it falls through to `setCardModal`), and add the confirm label;
   - financed factories get a striped outline and a "3 / 2 / 1" badge, with a tooltip;
   - the payout chip shows `+1` for deliveries;
   - add a **Commitment** row with a Refinance button, driven by `buildings`, not `devCards`, rendered **before** CardsPanel's empty-hand early return, and also on the mobile Cards sheet;
   - the end-game table shows financed factories separately;
   - show the <6 pip warning in the placement confirm.
9. **Tests:**
   - a cluster becomes a financed factory for 2 GPUs and scores 1 CP;
   - production gives 1 to the owner and decrements the commitment;
   - the input state's Building still has `financed: 3` after a delivering ROLL and after REFINANCE (immutability);
   - an outage stalls delivery;
   - the shortage rule stalls delivery;
   - no phantom shortage is caused by the committed unit;
   - after 3 units the factory scores 2 CP, produces 2, and the field is absent;
   - completion on a rival's roll leads to a win only at the start of the owner's turn;
   - refinance costs the right Capital, grants the CP immediately, and does not consume the card play;
   - a second financed factory is refused;
   - not playable the turn it was bought;
   - old saves without the field load as unfinanced;
   - the AI play-rate floor;
   - full AI games with both cards finish and conserve resources.
10. **Docs:** update `GAME_DESIGN.md` and the in-game rules modal for both cards.

## Final pre-implementation check (end of session 1): no blockers

These clarifications close the remaining gaps. Treat them as part of the spec.

- **Conservation:** the committed unit never leaves the market. The owner receives 1, and the bank keeps the other. The resource-conservation assertion (19 of each resource, summed across market and hands) must hold in every Financing test and full-game test.
- **When completion lets you win:**
  - On the owner's own roll, the ROLL action's reducer tail runs `checkVictory` for the current player, so the owner can win at once.
  - On a rival's roll, the owner wins only when their own turn begins (rule 4).
  - Refinance can win at once, because the owner always refinances on their own turn.
- **No production, no delivery:** a 7 produces nothing, so nothing is delivered. Discards and steals touch hands only and never the commitment. Infrastructure Priority's outage move can target a financed factory; that's intended.
- **Refinance timing:** main phase only, on your own turn, and only for your own financed factory. You may play Market Consolidation on Capital and then refinance in the same turn, since Refinance is not a card play. That costs a card, so it's fine.
- **Full-Stack Integration compatibility:**
  - Integration always places an unfinanced factory.
  - A player may hold both cards, but can play at most one per turn.
  - Both draw from the same 4-factory piece limit.
  - AI priority when both are playable: Integration if affordable (+2 CP now), otherwise Financing.
  - The two AI goals must not both claim the same GPUs. When the Integration goal is active, skip the Financing goal pricing.
  - Grant, Consolidation, Expansion and Breakthrough are unaffected.
- **Saves:** `Building.financed`, `ProductionReport.deliveries` and `GameState.voltaCards` are all optional. Old saves load as "no commitments, Volta cards off".
- **Determinism and test re-baseline:** adding 2 Financing cards changes the shuffle of the Volta deck (27 → 29). The Integration play-rate test will then see different games, so re-measure it and re-baseline its floor. The default 25-card deck is untouched, so the standard game, the Quick Demo and their tests are unaffected.

## Independent review (incorporated)

Two independent adversarial reviewers checked this spec against the actual engine: an exploit/balance lens and a state-management lens. They produced 15 findings, and all were incorporated.

- **Card A:** the AI under-used the card (about 12% of drawn copies). This was fixed in code; the rate is now 25%, and a regression test enforces the floor.
- **Card B:**
  - the original AI rule was circular;
  - in-place mutation of shared Building objects would have corrupted previous states;
  - the commitment would have caused phantom market shortages;
  - six places treat every factory as double;
  - delivery reporting had no data channel;
  - the scoring and standings semantics were undefined;
  - the Refinance button had no place to live once the card leaves the hand;
  - the original pip math was too optimistic;
  - the Volta-only deck entry was missing.

## Rarity summary

| Deck | Cards |
| --- | --- |
| Default (no Volta cards) | 25 (14 Priority, 2 Expansion, 2 Grant, 2 Consolidation, 5 Breakthrough) |
| Volta cards on, after this session | 27 (+2 Full-Stack Integration) |
| Volta cards on, once Card B ships | 29 (+2 Infrastructure Financing) |
