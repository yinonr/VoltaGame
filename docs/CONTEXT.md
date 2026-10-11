# Settlers of Compute — Project Context (for a fresh session)

_Snapshot: end of session 1, 2026-10-11. Paste this into a new chat, or point a new Claude Code session at `docs/CONTEXT.md`._

## What this is

**Settlers of Compute** is a polished, playable browser strategy game inspired by Settlers of Catan and re-themed around the AI compute economy. The player founds an AI startup and competes with three AI rival companies for **Power, Networking, Land, Capital and GPUs**. The first company to **10 Compute Points (CP)** wins.

- **Purpose:** an interview demonstration for the owner (yinonr), who is interviewing on **Monday, Oct 12, 2026** with Jake Mosher at **Volta** for a Senior Content, Social Media & Communications Manager role. It should show storytelling taste, audience empathy, initiative and hands-on AI fluency.
- **Narrative frame:** Volta's "Little Tech" thesis (a16z, Aug 2026). Big Tech can lock up land, power and GPUs years ahead; Volta makes compute work more like a utility so startups can compete. **The player is not Volta.** The game is a playful abstraction, not a simulation of Volta's business.
- **Product vision:** an entertaining strategy game first, a subtle demonstration of Volta's model second. Avoid heavy-handed marketing.

## Where everything is

| Item | Value |
| --- | --- |
| Repo | https://github.com/yinonr/VoltaGame (public) |
| Live game | https://yinonr.github.io/VoltaGame/. GitHub Pages is enabled (Source: GitHub Actions) and every push to `main` redeploys. |
| `main` | `37c229b`. The **stable interview build**: V1 game, mobile layout, Quick Demo. **Frozen until after Monday.** Don't merge or redeploy without the owner's approval. |
| `claude/new-session-4osyq1` | Same as `main` (the original dev branch) |
| **`claude/volta-branding`** | **`e2e347d`** or later (see `git log -1`). All new work lives here. **Not merged, not deployed.** |
| Tests | `npm test`: 61 passing, 1 skipped (an opt-in QA fixture generator) |

## Tech and architecture

React 19 + TypeScript + Vite 8 + Vitest 5, SVG board, plain CSS. Fully static: no backend, no paid APIs, no LLM calls at runtime.

- **`src/engine/`**: pure, deterministic rules engine.
  - **State:** seeded RNG stored inside `GameState`, immutable state transitions.
  - **One state transition:** `applyAction(state, action)` is the only way state changes. It throws `GameError` on illegal moves. `getActingPlayer(state)` says who must act next: the trade target, players owing a discard, otherwise the current player.
  - **Key files:**
    - `types.ts`, `constants.ts`;
    - `board.ts` (seeded fair 19-hex board, 54 vertices, 72 edges, 9 ports);
    - `rules.ts` (legality checks plus human-readable "why not" reasons);
    - `scoring.ts`, `game.ts` (reducer);
    - `ai.ts` (heuristic AI);
    - `evaluation.ts`, `demo.ts`.
- **`src/ui/`**:
  - `GameScreen.tsx` renders either the desktop layout or a touch layout (`compact`) from shared state and handlers;
  - the other UI files are `Board.tsx`, `panels.tsx`, `modals.tsx`, `TitleScreen.tsx`, `mobile.tsx`, `useGame.ts` (AI pacing loop, autosave), `brand.tsx` (Volta gate) and `flags.ts` (Quick Demo flag).
- **Deploy:**
  - `.github/workflows/deploy.yml` deploys on a push to `main`;
  - `ci.yml` runs tests and the build on other branches and PRs;
  - Vite's `base` is `/VoltaGame/` for `build` and `preview`.

## What's implemented

**On `main` (live):**

- **Full rules:**
  - Resources: Power, Networking, Land, Capital and GPUs map to wood, brick, sheep, wheat and ore.
  - Builds: Network Connection (road), Compute Cluster (settlement), AI Factory (city).
  - Trading: the market at 4:1, ports at 3:1 / 2:1, and offers to and from AI rivals (with reasons).
  - Grid Disruption on a 7: discard, move the outage marker, steal.
  - Five Innovation Cards: Priority, Expansion, Grant, Consolidation, Breakthrough.
  - Bonuses: Longest Network and Priority Access.
- **Opponents and modes:**
  - Three deterministic AI rivals: Helixa Bio, Ambulo Robotics and Stacksmith. The player is Parallax Labs.
  - Quick Start opening, manual snake draft, pass-and-play for 2–4 people, all-AI spectate, and autosave.
- **Quick Demo:** a deterministic midgame, seed 392.
- **Phone layout:** portrait and landscape, zoom and pan, tap-then-confirm placement, bottom sheets.

**On `claude/volta-branding` (not deployed):**

- **New Game–first entry.** New Game is the primary title action. Quick Demo is hidden from the title screen, winner screen and mobile menu, but its code and tests are kept. Open the site with `#demo` to show it.
- **Staged Volta branding**, approved by the owner for the interview prototype only:
  - "Brought to you by Volta" on the title screen;
  - the tagline "The race to build the AI economy.";
  - the victory line "The next generation of AI runs on infrastructure.";
  - a "Visit Volta →" link to **https://volta.com**;
  - subtle industrial UI details.
  - **Gate:** on in `npm run dev` and `npm run build:branded` (`.env.development`, `.env.branded`); **off in the public build** unless `VITE_VOLTA_BRANDING=on`. The owner's approval is **not** Volta's authorization for public sponsorship claims.
  - "VOLTA" is a typographic placeholder until an approved logo exists.
- **Full-Stack Integration** ("One platform. Every layer."), implemented and tested:
  - deploys an AI Factory straight onto a new network site for 1 Land + 3 Capital + 2 GPUs (+2 CP);
  - opt-in: Custom game → "Special cards (beta)", 2 copies, deck 25 → 27;
  - the AI plays 25% of the copies it draws, and a test enforces at least 18%;
  - the default deck is unchanged, so the standard game, the Quick Demo and the AI seeds are unaffected.
- **Infrastructure Financing** ("Build for the long term."), **fully specified, not implemented**:
  - upgrade to an AI Factory for 2 GPUs;
  - the factory's next 3 bonus units go to the market before it scores its extra CP (it scores 1 CP until then);
  - Refinance clears the commitment at 1 Capital per remaining unit;
  - one financed factory per player at a time.
  - The spec was hardened by two independent reviews (15 findings) and a final check (no blockers).

## Next development session: order of work

1. **Implement Infrastructure Financing** on `claude/volta-branding`, following `docs/VOLTA_SPECIAL_CARDS.md` exactly, including the "Final pre-implementation check".
   1. Game state, actions, rules and scoring.
   2. Deferred commitments: pending deliveries, the shortage gate, **never mutate a Building**, and the `outputMultiplier` helper at all call sites.
   3. **Comprehensive tests before any UI.**
   4. AI: when to finance, refinance and disrupt.
   5. Desktop and mobile UI.
   6. A browser test of the full card lifecycle at 1440×900 and 390×844.
2. **Balance both Volta cards.** Run seeded AI-only games, compare against the standard game, and decide whether they belong in the default deck. Re-baseline seeds deliberately.
3. **Reconsider onboarding from turn one.** Prefer light contextual hints over a fixed demo, and keep Quick Demo as an internal tool.
4. **Online multiplayer, last.** The plan is in `docs/MULTIPLAYER_PLAN.md`: a Cloudflare Worker with one Durable Object per room, an authoritative engine, and redacted per-seat views. It needs a Cloudflare account plus the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub secrets.

## Guardrails

- Never merge to `main` or touch the live site without the owner's approval. Never force-push.
- Keep the branding production gate. Never commit secrets.
- Preserve determinism: a seed plus a list of actions replays a game exactly. Keep the standard 25-card deck unchanged unless the owner deliberately decides otherwise.
- No factory or tycoon minigames, finance simulation, auctions or LLM-powered NPCs (excluded by the original brief).
- Keep the unofficial, Catan-inspired disclaimer. Use only original art and fictional company names.

## Known issues

- The phone layout is tested only in browser emulation, not on a physical iPhone. Check that Safari's toolbars don't cover the tab bar, how zoomed panning feels, and how big corner tap targets are at fit zoom.
- AI rivals send about 12 trade-offer pop-ups to the human per game. Consider rate-limiting them.
- On small phones the trade dialog's −/+ buttons stack, so the dialog scrolls.
- About 28% of drawn Full-Stack Integration copies never see an open site (a site-availability limit).

## Commands and QA tooling

```bash
npm install && npm test && npm run build      # baseline
npm run dev                                   # branded dev build
npm run build:branded && npm run preview      # branded build at http://localhost:4173/VoltaGame/
QA_GEN=/tmp/qa npx vitest run qa-fixtures     # saved-game JSON fixtures for browser QA
```

- **Browser QA:**
  - Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Use `playwright-core@1.56` installed outside the repo.
  - Load a fixture into `localStorage['settlers-of-compute:save:v1']`, then click **Continue saved game**.
  - On mobile, use `isMobile` + `hasTouch` and `tap()`. SVG targets need `{ force: true }`.
- **Cloud environment notes:**
  - The egress policy blocks `*.github.io`, the GitHub Pages API, a16z and volta.com. Verify deploys through the GitHub Actions logs via the GitHub MCP tools.
  - Run `pkill -f "vite preview"` as a separate command; inside a compound command it can kill the shell.

## Docs index

- **`docs/HANDOFF.md`:** detailed status, test history and next steps.
- **`docs/VOLTA_SPECIAL_CARDS.md`:** both cards' rules, AI, edge cases and implementation steps.
- **`docs/GAME_DESIGN.md`:** rules, AI, architecture, touch layout and branding gate.
- **`docs/MULTIPLAYER_PLAN.md`:** the online multiplayer architecture.
- **`README.md`:** setup, controls and deployment.
