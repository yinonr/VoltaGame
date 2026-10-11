# Settlers of Compute — Project Context (for a fresh session)

_Snapshot: end of Session 3, 2026-10-11. Point a new Claude Code session at `docs/CONTEXT.md`, then `docs/HANDOFF.md`._

## What this is

**Settlers of Compute** is a polished browser strategy game inspired by Settlers of Catan and re-themed around the AI compute economy.

- **Players:** you found an AI company (you name it) and compete with three AI rivals for Power, Networking, Land, Capital and GPUs. The first to **10 Compute Points** wins.
  - Helixa Bio: innovation-focused.
  - Ambulo Robotics: expansion.
  - Stacksmith: factories.
- **Purpose:** an interview demonstration for the owner (yinonr), who interviews at **Volta on Monday, Oct 12, 2026** for a Senior Content, Social Media & Communications role.
- **Framing:** Volta's "Little Tech" thesis is the backdrop. The player is not Volta; the game is a playful abstraction. Public builds say "A concept for Volta" and "Independent creative prototype. Not affiliated with or endorsed by Volta."
- **North star:**
  - Keep the Catan thrill: roll, collect, trade, build, expand, race to 10.
  - *Financing buys speed. Integration buys efficiency. Specialization buys focus.*

## Where everything is

| Item | Value |
| --- | --- |
| Repo | https://github.com/yinonr/VoltaGame (public) |
| Live game | https://yinonr.github.io/VoltaGame/. Serves `main` (`37c229b`, the Session 1 build); a push to `main` redeploys. |
| **Release candidate** | **`claude/new-session-6i54u3`**: a fast-forward of `main`, CI green. Not merged: the owner must approve and publish (`docs/HANDOFF.md` → "Publish"). |
| Recovery | `recovery/`: a git bundle and patches of the 7 Session 2 agent branches (`s2/*`). Only `s2/events` is not yet integrated. |
| Tests | `npm test`: 163 passed, 4 opt-in skipped |

## Tech

React 19 + TypeScript + Vite 8 + Vitest 5, SVG board, plain CSS, fully static.

- **`src/engine/`:**
  - a pure, deterministic engine; `applyAction` is the only state change;
  - feature modules `financing.ts` and `fullstack.ts`, plus `events.ts` (a stub until market events are merged);
  - shared reducer helpers in `mutate.ts`;
  - rules variants via `GameState.rules` and `rulesOf()`: Classic is the engine default, and the UI defaults to `COMPUTE_RULES`.
- **`src/ui/`:**
  - `GameScreen.tsx` renders the desktop and touch layouts;
  - `strategy.tsx` holds the Financing and Full-Stack panels, `feedback.tsx` the game feel, and `NewGameScreen.tsx` with `companies.ts` the identity;
  - `brand.tsx` is the gate for the branded preview;
  - per-stream CSS lives in `ui/styles/`.
- **`src/sim/`:** the simulation harness.
- **Docs:**
  - `STRATEGIC_SYSTEMS.md`: final rules, AI and UI for Financing and Full-Stack;
  - `BALANCE.md`: simulation evidence;
  - `FULLSTACK_CALIBRATION.md`: milestone calibration;
  - `GAME_DESIGN.md`, `HANDOFF.md`, `MULTIPLAYER_PLAN.md`;
  - `SESSION2_CONTRACTS.md` (historical).

## Final rules added in Sessions 2–3

- **Infrastructure Financing:**
  - upgrade a cluster for 1 Capital + 2 GPUs (standard: 3 Capital + 2 GPUs);
  - the factory repays 5 committed units from its own output; until then it scores 1 CP and produces like a cluster;
  - the outage stalls repayment;
  - at most 2 financed factories per company;
  - Refinance at 1 Capital per unit left (not a card play).
- **Full-Stack Integration:**
  - a permanent status, unlocked by holding 1 operational factory, 3 sites, 4 resource types and a 4-connection network at the same time;
  - it unlocks repeatable **Integrated Deployment**: a full AI Factory on an open network site for 1 Power + 1 Networking + 1 Land + 3 Capital + 2 GPUs, worth +2 CP.
- **Expedited Deployment:** the renamed legacy beta card (Custom game → "Special cards (beta)").
- **AI trade offers to humans:** rate-limited (about 2 per game instead of about 11).

## Guardrails

- Never merge to `main` or touch the live site without the owner's approval. Never force-push. Push only to the authorized session branch.
- Keep the branding production gate. No sponsorship claims and no official logos.
- **Classic must stay byte-for-byte identical:** gate new mechanics on `rulesOf(state)`; seeded fingerprint tests guard this.
- Determinism: no new RNG use for rules effects. Never mutate a Building.
- **Out of scope:** factory or tycoon minigames, finance simulation, interest or bankruptcy, auctions, LLM-powered NPCs.
- **Token budget:** Session 2 ran 7 parallel agents and hit the account usage limit in about 15 minutes. Use at most 2 concurrent agents.

## Next steps

See `docs/HANDOFF.md` → "Next session", in this order:

1. owner review on a phone, then publish;
2. victory-screen accomplishments;
3. market events behind an experimental toggle;
4. human playtests;
5. onboarding hints;
6. online multiplayer, last.
