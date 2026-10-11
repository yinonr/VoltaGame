# Settlers of Compute — Game Design

## Concept

**Player fantasy:** you are the founder of an ambitious AI startup or lab. The inputs of the compute economy — power, networking, land, capital and GPUs — are finally within reach of companies that aren't hyperscalers. Scarcity, geography, timing and deal-making decide who scales fastest. Rivals trade when it helps both sides, but only one company becomes the market leader.

**Narrative frame.** The idea comes from the "Little Tech" view of compute access: hyperscalers can make long commitments for land, power and GPUs, while startups are funded 18 months at a time and often get what's left. The game's board imagines a market where compute behaves more like a utility, so smaller companies can compete. This frame is only a backdrop. **The player is not Volta**, and nothing in the game claims to describe Volta's products, financing or operations. The game is an unofficial creative prototype.

**Design priorities** (from the brief): a correct, playable loop first; then working AI; then legible, polished UI; then the Quick Demo; then full mechanics; local multiplayer last. Rules stay close to Catan on purpose, so a viewer who knows Catan understands the game in seconds and the theme does the storytelling.

## Resources

| Compute resource | Catan analogue | Hexes | Color | Glyph |
| --- | --- | --- | --- | --- |
| Power | Wood | 4 | Amber `#fbbf24` | Lightning bolt |
| Networking | Brick | 3 | Cyan `#22d3ee` | Three linked nodes |
| Land | Sheep | 4 | Lime `#a3e635` | Land parcel |
| Capital | Wheat | 4 | Pink `#f472b6` | Coin stack |
| GPUs | Ore | 3 | Violet `#a78bfa` | Chip |
| *Dead Zone* | Desert | 1 | Slate | Crossed circle |

Capital is just a resource you collect. No finance is modeled.

## Board

- 19 pointy-top hexes in rows of 3–4–5–4–3, in axial coordinates (`src/engine/board.ts`).
- Real topology: 54 corners (vertices), 72 edges and 30 coastal edges, deduplicated from hex corners. Every placement rule runs on this graph.
- Production numbers: 2 and 12 once each; 3, 4, 5, 6, 8, 9, 10, 11 twice each; no 7, and none on the Dead Zone.
- Fairness: a generated board never has adjacent 6/8 hexes or identical neighboring numbers. Generation is seeded with mulberry32, so it is reproducible.
- 9 hubs (ports) at fixed coastal slots: 4 generic (3:1) and 5 resource-specific (2:1), types shuffled by the seed.
- The Grid Disruption marker starts on the Dead Zone.

## Structures

| Structure | Analogue | Cost | CP | Limit |
| --- | --- | --- | --- | --- |
| Network Connection | Road | 1 Power + 1 Networking | 0 | 15 |
| Compute Cluster | Settlement | 1 Power + 1 Networking + 1 Land + 1 Capital | 1 | 5 |
| AI Factory | City | 3 Capital + 2 GPUs (upgrades a cluster) | 2 total | 4 |
| Innovation Card | Development card | 1 Land + 1 Capital + 1 GPU | varies | 25-card deck |

- **Distance rule:** a cluster needs an empty corner whose neighbors are all empty.
- **Network rule:** after the opening, a cluster must touch one of your connections. A connection must touch your own building, or extend your network through a corner without a rival building on it.
- An upgrade replaces the cluster: the cluster piece goes back to your supply, and the points go from 1 to 2, never 3.

## Turn structure

1. **Roll** two dice. A rival may first play *Infrastructure Priority*.
2. **Production:** every hex with the rolled number pays 1 resource per adjacent cluster and 2 per adjacent factory, unless the outage marker sits on it.
   - **Market supply** is 19 of each resource. If the market can't pay everyone owed a resource, nobody gets it, unless only one company is owed (it takes what's left). This is the familiar bank-shortage rule, and it reinforces the scarcity theme.
3. **Trade:** with the market at 4:1, 3:1 / 2:1 at hubs your buildings touch, or by offering a deal to one rival.
4. **Build** any legal, affordable structures. Play at most one Innovation Card per turn, and not one bought this turn.
5. **End turn.**

## Grid Disruption (robber analogue)

On a 7: nothing produces. Every company holding more than 7 resources discards half, rounded down; humans choose, AI uses its heuristic. The roller then moves the outage marker to a different hex. That hex stops producing until the marker moves again, and the roller takes 1 random resource from an adjacent rival who has any. On the board it is a hatched outage with a pulsing "broken bolt" badge. The rival who moved it causes the outage, not the grid operator.

## Innovation Cards (25)

| Card | Analogue | Count | Effect |
| --- | --- | --- | --- |
| Infrastructure Priority | Knight | 14 | Move the outage and take 1 resource. Playable before rolling. Counts toward Priority Access. |
| Network Expansion | Road Building | 2 | Place 2 free connections. |
| Resource Grant | Year of Plenty | 2 | Take any 2 resources from the market. |
| Market Consolidation | Monopoly | 2 | Name a resource; every rival gives you all of theirs. |
| AI Breakthrough | Victory point | 5 | Secret +1 CP, never played, revealed at game end. |

Restrictions: one card per turn, never on the turn it was bought, and only Infrastructure Priority before the roll (simplification: the others need the main phase).

## Scoring and victory

- Cluster 1, Factory 2, AI Breakthrough 1 (hidden from rivals).
- **Longest Network** +2: the longest continuous trail of 5+ connections. Rival buildings cut trails. The holder keeps the bonus on a tie. If the holder is overtaken by a tie, nobody holds it.
- **Priority Access** +2: first to play 3 Infrastructure Priority cards; a strictly larger count takes it.
- **First to 10 Compute Points wins**, checked only on that company's own turn (as in Catan).

## Trading

- **Market:** 4:1 default, 3:1 at a generic hub, 2:1 at a matching hub. You must hold the full rate, the market must have the resource, and both sides must be different resources.
- **Rival offers:** the active player proposes `give → get` to one rival. AI rivals answer with a reason the player can read, for example "accepted — needs Capital for an AI Factory", "declined — can't spare GPUs right now", or "won't help the market leader close the gap" (proposer at 8+ public CP). AI rivals also make their own offers (at most one per turn, only when a single resource blocks their goal), which can reach the human as an Accept/Decline dialog.
- At most 6 offers per turn, to prevent spam. No auctions, order books or counter-offers.

## Computer opponents (`src/engine/ai.ts`)

The AI is deterministic and has no LLM in the loop. It plays by the same rules as the human and sees only public information plus its own hand. It never reads rivals' hidden hands or cards.

- **Opening:** scores each open corner by pips × resource weight, with bonuses for resources it lacks, diversity and ports. The connection points toward the best corner two steps away.
- **Goal planning:** each turn it ranks Factory, Cluster (needs a legal site), Connection (toward a new site) and Innovation Card. The rank is a personality weight minus a penalty for missing resources. It builds whatever it can afford, trades toward the goal (market or hub first, then one rival offer), and spends spare cards when it holds more than 7.
- **Outage placement:** hurts the strongest rivals on high-pip hexes, never itself, and steals from the leader.
- **Cards:** plays Priority to clear an outage from its own hex or to win Priority Access. Plays Grant for missing goal resources, Consolidation when public production suggests rivals hold enough, and Expansion when connections open a site.
- **Personalities** shift preferences only; there are no special powers:
  - **Helixa Bio** (AI biotech) likes Innovation Cards.
  - **Ambulo Robotics** (robotics) expands aggressively.
  - **Stacksmith** (developer tools) rushes AI Factories.
  - **Parallax Labs** is the player's company and balanced when the AI plays it (Quick Demo setup, spectator mode).
- **Safety:** every turn terminates. Builds and trades strictly consume resources, card plays are capped at one per turn, offers at one per turn, and the main phase has a hard 60-action cap. If the AI ever proposed an illegal action, the UI would fall back to a safe legal one. Tests play 14 complete seeded AI games to a legal winner.

## Quick Start and Quick Demo

- **Quick Start:** the real snake draft (1-2-3-4-4-3-2-1) runs with the AI placement heuristic for every seat, and opening resources come from each second cluster. Up to 8 boards derived from the seed are tried, and the one with the most even opening production is kept.
- **Quick Demo** (`src/engine/demo.ts`): starting from `DEMO_SEED = 392`, all four seats play the real engine until Parallax Labs has rolled in round 7 or later. The position must then pass these checks:
  - the human is at 4–6 CP and nobody is above 7;
  - every company has infrastructure;
  - the human has a legal cluster site and a cluster to upgrade;
  - at least one AI rival is willing to sell a GPU.

  The human's hand is set to `1 Power, 1 Networking, 1 Land, 3 Capital, 1 GPU`, and the human also holds an AI Breakthrough the computer bought for that seat. With seed 392 the race is tight: 4 / 3 / 4 / 4 CP. A cluster or Innovation Card is affordable now. An AI Factory needs one more GPU, and Ambulo Robotics will sell it for the Power or Networking the cluster would have used. That makes the first decision a real trade-off. The seed was picked by an offline search over seeds 1–400 that scored candidates on closeness of the race. If a future engine change breaks the criteria, the code falls back to derived seeds. The scenario is deterministic and covered by tests, and every move after it is live engine play.

## Architecture

```
src/engine/            pure TypeScript, no React
  types.ts             serializable GameState + Action union
  constants.ts         costs, distributions, resource/company/card metadata
  rng.ts               mulberry32 PRNG + seed derivation
  board.ts             hex geometry, topology, fair seeded generation, ports
  rules.ts             legality queries + human-readable "why not" reasons
  scoring.ts           Longest Network, Priority Access, VP breakdown
  evaluation.ts        shared positional heuristics
  game.ts              createGame, applyAction (immutable reducer), auto-draft
  ai.ts                decideAIAction, evaluateOffer
  demo.ts              deterministic Quick Demo scenario
  __tests__/           Vitest suites (53 tests)
src/ui/                React + SVG presentation
  useGame.ts           state container, AI pacing loop, autosave, toasts
  Board.tsx            SVG board, highlights, payouts, outage
  GameScreen.tsx       layout, interaction modes, modal orchestration
  panels.tsx           scoreboard, log, dice, hand, build menu, cards
  modals.tsx           trade, discard, victim, cards, winner, rules, pass screen
  TitleScreen.tsx      title, custom game setup
```

- **One rules implementation.** `applyAction(state, action)` is the only way state changes. It validates with the same `rules.ts` checks the UI uses to disable buttons and explain why, and it throws `GameError` on anything illegal.
- **Determinism.** The RNG state lives inside `GameState`, so a seed plus a list of actions replays a game exactly. That property makes the AI, the demo and the tests reproducible, and it is also the foundation for future online play (send actions, not state).
- **Hidden information** is a UI concern. The engine is omniscient, but the AI only reads public data, and the UI shows a hand only to its owner. Pass-and-play hides hands behind a "pass the device" screen.

## Deliberate abstractions

- No finance, power engineering, rack layout, cooling or project-finance mechanics. Those were explicitly out of scope.
- Company names, sectors and art are original and fictional. No Catan artwork, branding or rulebook text is used.

## Included vs deferred

**Included:**

- Full board.
- Quick Start and manual snake draft.
- Production with the shortage rule.
- All builds and piece limits.
- Market, hub and rival trading, with AI responses and AI-initiated offers.
- Grid Disruption with discards and steals.
- All five Innovation Cards.
- Longest Network and Priority Access.
- Win detection.
- 1 human vs 3 AI, custom 2–4 seats with pass-and-play, and all-AI spectate.
- Quick Demo and autosave/continue.

**Deferred:**

- Online multiplayer.
- Open "ask everyone" offers and counter-offers.
- Playing non-Priority cards before the roll.
- A post-game timeline.
- Sound.
- A mobile-optimized layout.
