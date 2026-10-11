# Settlers of Compute — Context for the next session

_Snapshot: end of Session 3 (including the Grid Stability sprint), 2026-10-11. Paste this into a new chat, or point a new Claude Code session at `docs/CONTEXT.md`, then `docs/HANDOFF.md`._

## What this is

**Settlers of Compute** is a polished browser strategy game inspired by Settlers of Catan and re-themed around the AI compute economy.

- **Players:** you found an AI company (you choose its name) and compete with three AI rivals for **Power, Networking, Land, Capital and GPUs**. The first to **10 Compute Points (CP)** wins. The rivals are:
  - **Helixa Bio:** innovation-focused;
  - **Ambulo Robotics:** expansion;
  - **Stacksmith:** factories.
- **Purpose:** an interview demonstration for the owner (yinonr). The owner interviews at **Volta on Monday, Oct 12, 2026**, for a Senior Content, Social Media & Communications role.
- **Framing:** the backdrop is Volta's "Little Tech" thesis. The player is not Volta; the game is a playful abstraction.
  - Public builds say "A concept for Volta" and "Independent creative prototype. Not affiliated with or endorsed by Volta."
  - Private branded previews ("Brought to you by Volta") are gated by `VOLTA_BRANDING`.
- **North star:** keep the Catan thrill. Roll → collect → trade → build → expand → race to 10.
  - *Financing buys speed. Integration buys efficiency. Specialization buys focus.*
  - *Innovation Cards create moments, not engines.*
  - *Grid Stability keeps tension without constant interruption.*

## Where everything is

| Item | Value |
| --- | --- |
| Repo | https://github.com/yinonr/VoltaGame (public) |
| Live site | https://yinonr.github.io/VoltaGame/. Serves `main` at `37c229b` (the Session 1 build). A push to `main` redeploys automatically. |
| **Release candidate** | **`claude/new-session-6i54u3`**: latest commit `be3b958`, last code commit `a29547e`. CI green. It is a fast-forward of `main`. **Not merged: the owner must approve.** |
| Earlier release candidate | `cb38388`, before Grid Stability. Tagged locally only (`rc-session3-cb38388`). |
| Private preview | https://claude.ai/artifact/4m8Ye6ByLftYBJL25Tq3Yw: the owner-only Grid Stability build, for phone playtesting |
| Recovery | `recovery/`: a bundle plus patches of the 7 Session 2 agent branches. Only `s2/events` (market events) is not integrated. |
| Tests | `npm test`: 180 passed, 5 opt-in skipped. Typecheck, `npm run build` and `npm run build:branded` pass. |

## Game rules

### Modes

New games default to **Settlers of Compute** (`COMPUTE_RULES`); **Classic** is one click away.

- Classic is the original Catan-like game: every 7 disrupts, outages persist, and the deck has 25 cards.
- Old saves load as Classic. Compute saves made before Grid Stability keep the rules they started with.

### Infrastructure Financing

- **Upgrade:** a cluster becomes an AI Factory for **1 Capital + 2 GPUs** (a standard upgrade costs 3 Capital + 2 GPUs).
- **Repayment:** the factory repays **5 committed units** from its own output. Until then it scores 1 CP and produces like a cluster.
- **Limits:** at most **2** financed factories per company at a time.
- **Refinance:** pay 1 Capital per unit left to finish one at once. This is not a card play.
- **Balance:** tuned by simulation. A company that never finances wins about 22.5% of games (fair share 25%).

### Full-Stack Integration

- **Unlock:** a permanent status, earned by holding all of these at once:
  - 1 operational (fully repaid) factory;
  - 3 sites;
  - 4 resource types;
  - a network of 4 connected connections.
- **Integrated Deployment:** once unlocked, build a full AI Factory on an open site for **1 Power + 1 Networking + 1 Land + 3 Capital + 2 GPUs** (+2 CP). Repeatable.
- **Balance:** about 80% of companies unlock it, at a median of 5 CP.

### Grid Stability (new this sprint; Compute only)

- **Protected rolls:** after a Grid Disruption the next **6 rolls** are protected. A 7 then causes no discard, theft or outage move, and produces nothing. Every roll counts.
- **Outage length:** an outage blocks its hex for **4 rolls**, then the marker parks on the Dead Zone.
- **Infrastructure Priority:**
  - bypasses the protection, replaces the current outage, and restarts both timers;
  - moving the marker onto the Dead Zone clears the outage without granting new protection.
- **Effect:** natural disruptions −55%, thefts −52%, a hex offline on 35% of rolls (about 90% before). Games are about 1.5 rounds shorter. Financing is unchanged.

### Other

- **Expedited Deployment:** the legacy beta card (Custom game → "Special cards (beta)").
- **AI trade offers to humans:** about 2 per game, rate-limited (previously about 11).

## Code map

React 19 + TypeScript + Vite 8 + Vitest 5, SVG board, plain CSS, fully static.

### `src/engine/`

A pure, deterministic engine with seeded RNG. `applyAction` is the only way state changes, and `getActingPlayer` says who acts next.

| File | Contents |
| --- | --- |
| `financing.ts` | Infrastructure Financing |
| `fullstack.ts` | Full-Stack Integration and Integrated Deployment |
| `grid.ts` | Grid Stability: timers in `GameState.grid` |
| `events.ts` | Market events stub |
| `mutate.ts` | Shared reducer helpers |
| `ai.ts` | Heuristic AI |
| `constants.ts` | `rulesOf`, `COMPUTE_RULES`, `CLASSIC_RULES` and all tunable constants |

### `src/ui/`

| File | Contents |
| --- | --- |
| `GameScreen.tsx` | The desktop and touch layouts |
| `strategy.tsx` | Financing, Full-Stack and Grid panels |
| `feedback.tsx` | Game-feel effects and the rival ticker |
| `NewGameScreen.tsx`, `companies.ts` | Company identity |
| `brand.tsx` | The branding gate |
| `styles/*.css` | Per-stream CSS |

### `src/sim/` and tests

- `src/sim/` is the simulation harness.
- Opt-in probes:
  - `financing-balance`
  - `grid-balance`
  - `fullstack-calibration`
  - `simulate`

### Docs

| File | Contents |
| --- | --- |
| `STRATEGIC_SYSTEMS.md` | Final rules |
| `BALANCE.md` | Simulation evidence |
| `INNOVATION_CARDS.md` | Next card designs |
| `HANDOFF.md` | Status and publish steps |
| `MULTIPLAYER_PLAN.md` | Online plan, with the new state to synchronize |
| `FULLSTACK_CALIBRATION.md` | Full-Stack calibration |
| `GAME_DESIGN.md` | Game design |

## Guardrails

- **Branches:**
  - Never merge to `main` or deploy without the owner's explicit approval.
  - Never force-push.
  - Push only to the authorized session branch.
- **Classic must stay byte-for-byte identical.** Gate every new mechanic on `rulesOf(state)`; seeded fingerprint tests guard this.
- **Determinism:** no new RNG use for rule effects. Never mutate a Building or any input state; the invariant suite deep-freezes states.
- **Branding:** keep the branding gate. No sponsorship claims and no official logos.
- **Out of scope:**
  - factory or tycoon minigames;
  - finance simulation, interest or bankruptcy;
  - auctions;
  - LLM-powered NPCs;
  - permanent card engines or technology trees.
- **Token budget:**
  - Use at most 2 concurrent LLM contexts: one engineering lead, plus at most one independent QA agent.
  - Scale simulations through code, not agents. In Session 2, seven parallel agents used about 1.7M tokens in 15 minutes and hit the usage limit.
  - Commit and push after each verified milestone.

## Next steps (in order)

1. **Owner playtest, then publish.**
   - Playtest the private preview on an iPhone, the first test on real Safari.
   - If it's good, fast-forward `main`: `git fetch origin && git checkout main && git merge --ff-only origin/claude/new-session-6i54u3 && git push origin main`.
   - Pages redeploys in about 2 minutes. Check that the title says "A concept for Volta" and that New Game lists Grid Stability.
   - Roll back by reverting the merge.
2. **Innovation Cards** (`docs/INNOVATION_CARDS.md`), added to the Compute deck only:
   1. prototype **GPU Optimization** (next AI Factory build this turn costs 1 GPU less);
   2. then **Nuclear Power Plant** (end the current outage now);
   3. then **Battery Storage** (one roll's worth from your sites next to the outage).

   Re-baseline the Compute seeds when you do; Classic's 25-card deck stays unchanged.
3. **Market events:** restore `s2/events` from `recovery/`, update it to the 5-unit commitment and the ceiling of 6, and put it behind a Custom-game experimental toggle.
4. **Human playtests:** watch the card economy (cards are bought about half as often under the Compute rules) and how often players use Integrated Deployment.
5. **Onboarding:** light contextual hints for the first financed upgrade, the first milestone and the first calm 7.
6. **Online multiplayer, last:** `docs/MULTIPLAYER_PLAN.md`. Cloudflare Worker with one Durable Object per room, an authoritative engine, and redacted per-seat views. Needs a Cloudflare account plus the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

## Known risks and gaps

- **Testing:**
  - Not tested on a physical iPhone or in Safari; only headless Chromium at 4 phone sizes and desktop.
  - No human-vs-human playtests.
- **Phone layout:**
  - The setup screen needs a scroll to reach the Classic option.
  - Long custom names truncate in the phone chips.
- **AI and balance:**
  - The AI rarely uses Integrated Deployment (about 0.4 per game).
  - Stacksmith is the weakest rival (about 15–18% wins).

## Commands

```bash
npm install && npm test && npm run build
npm run dev                                   # branded dev build
npm run build:branded && npm run preview      # branded production-style build
QA_GEN=/tmp/qa npx vitest run qa-fixtures     # saved-game fixtures: qa-financing, qa-grid, qa-win-compute, …
GRID_BALANCE=/tmp/grid.md N=300 S0=30000 npx vitest run grid-balance
FIN_BALANCE=/tmp/fin.txt N=300 S0=12000 npx vitest run financing-balance
SIM=1 SIM_CONFIGS=classic,compute SIM_GAMES=200 npx vitest run simulate
```

**Browser QA in the cloud container:**

- Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; use `playwright-core@1.56` installed outside the repo.
- Load a fixture into `localStorage['settlers-of-compute:save:v1']`, then press **Continue saved game**.
- On phones, use `isMobile` + `hasTouch` and `tap()`. SVG targets need `{ force: true }`.
- Run `pkill -f "vite preview"` as its own command.
- The container can't reach `*.github.io`; verify deploys through the GitHub Actions logs.
