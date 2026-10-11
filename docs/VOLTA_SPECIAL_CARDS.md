# Volta Special Cards — Design Specification

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
- **Measured in tests:** six seeded all-AI games with Volta cards finish legally, and the card is drawn and used.

### Rules interactions and edge cases

- **Network:** the factory can cut a rival's Longest Network like any new building. Longest Network is recomputed and announced.
- **Pieces:** a factory piece is used and no cluster piece. If all four factories are built, the card isn't playable ("All 4 AI Factories are built.").
- **Production:** a factory under the Grid Disruption produces nothing, as usual. A factory touching a hub gets the hub rate.
- **Winning:** you can win with it on your own turn, the same as with any build.
- **Payment:** the cost always goes to the market supply, so total resources are conserved (tested).
- **Card limit:** it uses up your one Innovation Card play for the turn (tested).

### AI logic (implemented in `ai.ts → cardAction`)

The AI checks this card first. If `checkPlayCard(state, me, 'integration')` passes, it plays `PLAY_INTEGRATION` on its best open site, using the same `vertexValue` heuristic it uses for clusters. +2 CP plus doubled output always beats the alternatives the AI weighs on that turn. The AI's normal goal planning doesn't specifically save resources for this card. That is a deliberate simplification, listed below as a possible upgrade.

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

- The AI could save toward the card. When holding it, it could treat `INTEGRATION_COST` as a goal with a score of about 4.2.
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
| Commitment | 3 units ("capacity commitment") |
| Theme | Infrastructure-backed financing: the asset's long-term output secures the capital used to build it. It is closer to project finance and long-term compute offtake than to a startup loan. No interest, no default, no debt spiral. |

### The player's decision

You are short on Capital (the most contested input for factories) but have GPUs and a good cluster site. You can wait and trade for 3 Capital, or **build the factory now and let the site's own production pay for it**.

The upfront benefit is real: the 3 Capital you didn't spend can go into a cluster or card *this turn*. The factory piece and the site are locked in before a rival can contest them, and the bonus output starts flowing to you as soon as the commitment is served.

The cost is real too: three units of production you don't keep, and a delayed +1 CP.

### Exact rules

1. **Playing:** the cluster becomes `{ owner, kind: 'factory', financed: 3 }`. The player pays 2 GPUs to the market and uses one factory piece; the cluster piece returns to supply.
2. **Production while `financed > 0`:** for each payout from an adjacent producing hex, the owner receives **1** (cluster rate), and the second unit counts as delivered: `financed -= 1`. That unit simply stays in the market supply; nothing is taken from anyone.
   - **Outage:** a hex under the Grid Disruption pays nothing, so no unit is delivered and the commitment stalls.
   - **Market shortage:** if the shortage rule cancels a payout of that resource, nothing is delivered for that payout.
3. **Scoring:** a factory with `financed > 0` scores **1 CP**, and the scoreboard shows "Financed (n left)". When `financed` reaches 0, it scores 2 CP and produces 2.
4. **Completing on a rival's roll:** the commitment can finish during another company's roll, putting the owner on 10 CP. The owner still wins only at the start of their own next turn. The engine already checks victory when a turn begins, the familiar "win on your own turn" rule.
5. **Refinance (optional):** a new action, `REFINANCE`. In the main phase, the owner pays `financed` × Capital to the market, the commitment clears and the +1 CP applies immediately. This lets a player in the endgame turn liquidity into the winning point on purpose, at full price.
6. **Limit:** at most one outstanding financed factory per player. This stops stacking.

### Exploit and balance review

| Risk | Mitigation |
| --- | --- |
| Instant win from a cheap factory | The +1 CP is **deferred** until 3 units are delivered or refinanced at full Capital. Playing the card never grants CP on the turn it is played. |
| Stacking several cheap factories | One outstanding financed factory per player, and only 2 copies in the deck. |
| "Free" factory on a site that never produces | Allowed, but self-defeating: the commitment never completes. The AI avoids it (see the heuristic below). The UI warns when the cluster's adjacent production totals fewer than 4 pips. |
| Dodging the commitment | Not possible. Buildings are never removed, and Market Consolidation and steals affect hands, not commitments. |
| Strength versus a normal upgrade | Normal: 3C + 2G now gives +1 CP and ×2 output now. Financed: 2G now plus 3 future output units gives the same result later. Same resource count, shifted in time, with Capital swapped for production. The advantage is liquidity and tempo, not raw value. |
| A new outage target | A financed factory is a juicy disruption target, because blocking it delays a rival's CP. This is a feature: rivals can contest the commitment through the existing robber-style interaction. |
| Commitment length | 3 units means about 2–4 rounds on a typical 6–9-pip site. Tune to 4 if playtests show it's too strong. Keep the value in one constant (`FINANCING_COMMITMENT`). |

### AI logic (to implement)

Play `PLAY_FINANCING` on cluster `v` when **all** of the following hold:

- the AI's current goal is a factory;
- it holds at least 2 GPUs;
- it is missing at least 2 Capital for that goal;
- it has no outstanding financed factory;
- the summed pips of `v`'s unblocked producing hexes are at least 6;
- `v` is not under the outage.

Choose the `v` with the most pips.

Refinance when `Capital ≥ financed` **and** either refinancing reaches 10 CP this turn, or the AI has no affordable goal it prefers. In practice: refinance when it wins, or when Capital would otherwise sit idle at the end of the turn.

When choosing where to place the outage, add a bonus to hexes adjacent to a rival's financed factory.

### Implementation steps for the next session (in order)

1. **Types:**
   - add `'financing'` to `DevCardType`;
   - add `Building.financed?: number`;
   - add the actions `{ type: 'PLAY_FINANCING'; vertex }` and `{ type: 'REFINANCE'; vertex }`.
2. **Constants:**
   - `VOLTA_CARD_COMPOSITION.financing = 2`;
   - `FINANCING_COST = { gpu: 2 }`;
   - `FINANCING_COMMITMENT = 3`;
   - a `DEV_CARD_INFO.financing` entry with its flavor text.
3. **Rules:** add `checkPlayCard(…, 'financing')` (own cluster, factory piece, 2 GPUs, no outstanding commitment) and `checkRefinance` (a financed factory you own, enough Capital, main phase).
4. **Reducer:**
   - `PLAY_FINANCING` places `{ kind: 'factory', financed: 3 }`;
   - `REFINANCE` pays Capital and deletes `financed`.
   - Log both, plus each delivered unit: "Parallax's financed factory delivered 1 GPU unit (2 left)".
5. **`produce()`:** apply the financed factory's per-payout rule *after* the shortage check, and keep the change contained there.
6. **Scoring:** in `scoreBreakdown`, a factory with `financed > 0` counts 1 CP. Add `financedFactories` to the breakdown for the UI.
7. **AI:** add the play, refinance and outage-targeting heuristics described above.
8. **UI:**
   - Play enters a `financing` placement mode on your clusters.
   - Financed factories get a striped outline and a small "3 / 2 / 1" badge on the board, with a tooltip.
   - The card list shows a **Refinance** button when affordable.
   - On mobile, use the same confirm flow, with the badge legible at fit zoom.
   - The scoreboard shows "1 financed".
9. **Tests:**
   - a cluster becomes a financed factory for 2 GPUs and scores 1 CP;
   - production gives 1 to the owner and decrements the commitment;
   - an outage stalls delivery;
   - the shortage rule stalls delivery;
   - after 3 units the factory scores 2 CP and produces 2;
   - completion on a rival's turn → win only at the start of the owner's turn;
   - refinance costs the right Capital and grants the CP immediately;
   - a second financed factory is refused;
   - not playable the turn it was bought;
   - the AI plays it only on 6+ pip sites;
   - full AI games with both cards finish;
   - resources are conserved.
10. **Docs:** update `GAME_DESIGN.md` and the in-game rules modal for both cards.

---

## Rarity summary

| Deck | Cards |
| --- | --- |
| Default (no Volta cards) | 25 (14 Priority, 2 Expansion, 2 Grant, 2 Consolidation, 5 Breakthrough) |
| Volta cards on, after this session | 27 (+2 Full-Stack Integration) |
| Volta cards on, once Card B ships | 29 (+2 Infrastructure Financing) |
