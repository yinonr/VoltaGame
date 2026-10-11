# Handoff — Settlers of Compute

_Last updated: 2026-10-11 (session 1)._

## Where things are

- **Repository:** https://github.com/yinonr/VoltaGame
- **Working branch:** `claude/new-session-4osyq1`. All work is pushed here. Check `git log -1` for the exact tip; it is listed below, as of the previous docs commit.
- **`main`:** initialized with the first foundation checkpoint (`92d72d9`). It does **not** yet contain the later work. Merge the working branch (PR or fast-forward) to update `main` and trigger the Pages deploy.
- **Latest pushed checkpoints:** `92d72d9` foundation · `2e7d24f` playable core + tests · Phase 3 checkpoint (this commit's parent chain; see `git log`).

## Feature status

| Feature | Status |
| --- | --- |
| 19-hex seeded fair board, ports, true vertex/edge topology | Done |
| Quick Start opening (auto snake draft, equity search) | Done |
| Manual snake-draft opening | Done (Custom game → uncheck Quick Start) |
| Roll / production / shortage rule | Done |
| Connections, clusters, factory upgrades, piece limits | Done |
| Market 4:1, hubs 3:1 / 2:1 | Done |
| Human → AI offers with reasons; AI → human / AI → AI offers | Done |
| Grid Disruption: discard, move, steal, blocked hex | Done |
| Innovation Cards: all five types and restrictions | Done |
| Longest Network, Priority Access, hidden Breakthroughs | Done |
| Win detection and winner screen with breakdown | Done |
| 3 deterministic AI rivals with personalities | Done |
| Quick Demo deterministic midgame | Done |
| Local pass-and-play (2–4 seats, any human/AI mix) and all-AI spectate | Done (browser-tested with 2 humans + 1 AI) |
| Autosave / continue | Done |
| GitHub Pages workflow | Done in repo; **Pages not yet enabled** (needs repo admin) and `main` not yet updated |
| Online multiplayer | Not started (out of scope) |

## Verification performed (actual results)

- `npm test`: **53 passed**, 1 skipped (the opt-in QA fixture generator), 7 suites.
- `npm run build` (tsc + vite): passes.
- Browser automation with headless Chromium (Playwright) against `vite preview`, 1440×900:
  - Title → Quick Demo → intro → board: rendered, no console errors.
  - New Game: roll, payouts, disabled build reasons, trade modal (market + rivals), end turn, three AI turns (including an AI–AI trade and an AI 7 with a steal), back to the human. No errors.
  - Injected states: a human 7 with 9 cards → discard modal → move outage → victim picker → steal logged. Resource Grant modal, the one-card-per-turn block, Network Expansion's two free connections, and a winning cluster build → winner modal. No errors.
  - Custom game with 2 humans + 1 AI and a manual draft: pass-device screens, legal draft highlights, all eight placements, then turn 1. No errors.

## Known issues / rough edges

- Right column scrolls at 900px height when the player holds several Innovation Cards. That is intended (no clipping), but the cards sit below the fold.
- Payout chips appear only when a roll produces. Discards and steals are announced in the log and in toasts, with no board animation.
- AI offers to the human can interrupt the human's spectating between AI turns. At most one per AI turn, by design.
- The human's opening in Quick Start is chosen automatically (by design for speed). Use Custom → manual draft to pick it yourself.

## Next steps (priority order)

1. Merge `claude/new-session-4osyq1` into `main`, then enable Pages (Settings → Pages → Source: GitHub Actions) and confirm the deploy workflow publishes `https://yinonr.github.io/VoltaGame/`.
2. Do a demo rehearsal pass: tune the Quick Demo criteria (for example, keep the human slightly behind the leader for tension) and check that copy fits the 30-second premise and 60-second first move.
3. Visual polish: AI move highlights (briefly flash the newest piece), steal/discard animations, a compact mode for the right column.
4. Improve the AI: smarter road targeting toward hubs, counter-offers, stronger use of Market Consolidation.
5. Add open offers to all rivals at once, and allow the other cards before the roll.

## Commands

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # Vitest engine suite
npm run build          # tsc -b && vite build → dist/
npm run preview        # http://localhost:4173/VoltaGame/
QA_GEN=/tmp/qa npx vitest run qa-fixtures   # write saved-game fixtures for browser QA
```

Browser QA tip: in this cloud environment Chromium lives at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Install `playwright-core@1.56` outside the repo and launch with `executablePath`. Load a fixture with `localStorage.setItem('settlers-of-compute:save:v1', json)`, then click **Continue saved game**.

## Architecture notes and pitfalls

- `applyAction` is the only state transition. Never mutate `GameState` in the UI. Clone in tests via the helpers.
- The board object is shared between states by reference and treated as immutable.
- `getActingPlayer` decides who must act: the trade target, players owing a discard, then the current player. The AI loop and the UI both key off it.
- The Vite `base` is `/VoltaGame/` for `build` **and** `preview`. `vite preview` 404s on assets if that path is missing.
- Web fonts load non-blocking. If Google Fonts is unreachable, the system-font fallback still renders.
- Vitest 5 / Vite 8 / plugin-react 6 are pinned together. Upgrading one alone breaks peer dependencies.
- `pkill -f "vite preview"` inside a compound shell command can kill the shell itself. Run it separately.
