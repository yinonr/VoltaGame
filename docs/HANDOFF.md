# Handoff — Settlers of Compute

_Last updated: 2026-10-11, end of session 1 (including the mobile + deployment continuation)._

## Where things are

- **Repository:** https://github.com/yinonr/VoltaGame (public)
- **Working branch:** `claude/new-session-4osyq1`
- **`main`:** fast-forwarded to the working branch. Both point at the same commit after this docs update; run `git log -1 origin/main` for the exact SHA.
- **Code checkpoints:**
  - `92d72d9` foundation
  - `2e7d24f` playable core + tests
  - `fc526fa` competitive feel + docs + workflows
  - `1ac2521` demo + polish
  - `1628285` docs
  - **`d120891` mobile touch layout** (latest code commit)
  - a docs commit on top of `d120891`: HANDOFF, MULTIPLAYER_PLAN, README, GAME_DESIGN
- **CI:** the `CI` workflow passed on branch pushes `fc526fa` and `1ac2521`. On `main` (`d120891`) the deploy workflow passed `npm ci`, `npm test` and `npm run build` on ubuntu-latest.

## Deployment status: deployed

- The owner enabled GitHub Pages (Source: GitHub Actions) on 2026-10-11.
- Deploy workflow run **38099492162** (attempt 2, commit `1d5c4be`) passed every step: `npm ci`, `npm test`, build, `configure-pages`, upload, and `deploy-pages`. It reported *"Reported success! … environment url: https://yinonr.github.io/VoltaGame/"*.
- **Live URL:** https://yinonr.github.io/VoltaGame/. Every push to `main` redeploys automatically.
- **Not verified from here:** this cloud environment cannot reach `*.github.io` (egress policy), so success is confirmed from the GitHub Actions deploy log only. The owner should load it once on desktop and once on an iPhone.

## Feature status

| Feature | Status |
| --- | --- |
| Full Catan-style rules engine (board, production, building, trading, Grid Disruption, Innovation Cards, bonuses, win) | Done, 53 tests |
| 3 deterministic AI rivals, AI→human and AI→AI offers | Done |
| Quick Start, manual snake draft, Quick Demo (seed 392, four-way race) | Done |
| Local pass-and-play (2–4 seats, human/AI mix), spectate, autosave | Done |
| Desktop layout (1280–1920 wide) | Done, unchanged by the mobile work |
| **Phone layout, portrait + landscape** | **Done**, tested in emulation (see below) |
| GitHub Pages deploy | **Deployed**: https://yinonr.github.io/VoltaGame/ (per the Actions deploy log) |
| Online multiplayer | **Not started.** Plan in `docs/MULTIPLAYER_PLAN.md` |

## Mobile functionality completed

- **When it applies:** the touch layout appears when `(max-width: 820px), (max-height: 520px)` matches.
  - In portrait it shows player chips, the instruction banner, the zoomable board, a dock with dice and Roll / End turn, the resource bar, and tabs (Build · Trade · Cards · Activity · Market).
  - In landscape the board fills the left side and the controls sit in a right column.
- **Zoom:** fit, 1.5× and 2.2× via **+ / −** buttons, with native one-finger panning. Pinch is disabled inside the board so the page never zooms by accident.
- **Tap, then confirm:** every placement, plus the Grid Disruption target, is selected first and committed with **Confirm**, so a mis-tap never builds. Touch hit areas are enlarged.
- **Sheets and dialogs:** sheets scroll internally, dialogs fit the screen (steppers reflow, the results table scrolls sideways), and toasts sit under the banner.
- **iOS details:** safe-area insets, `100dvh`-style fixed layout, `viewport-fit=cover`, theme color.

## Tests actually performed

- `npm test`: **53 passed**, 1 skipped (the opt-in QA fixture generator).
- `npm run build` passes locally and on GitHub Actions.
- Mobile, using Playwright with headless Chromium and `isMobile` + `hasTouch` + an iPhone user agent, every interaction done with `tap()`, at **390×844, 375×667 and 844×390**. Every step passed at all three sizes with no console errors and no page overflow:
  1. Load the game and start the Quick Demo.
  2. Inspect the hand; zoom in (the board becomes scrollable) and back out.
  3. Trade → Rival companies → 1 Power for 1 GPU → Ambulo accepts with a reason; the dialog fits the screen.
  4. Build → AI Factory → tap a cluster → confirm bar → Confirm → factory built.
  5. Menu sheet dismissed by tapping the backdrop; Market and Activity sheets open and close.
  6. End turn → three AI turns run (offers handled by Decline) → back to the human.
  7. Corner and edge selection with confirm, in the manual opening draft.
  8. A 7 with 9 cards: discard dialog → tap a hex → confirm ("Knock out GPUs 11? Rivals here: Ambulo.") → steal.
  9. Pass-and-play: the pass screen appears for the second human.

  One 390×844 run stalled on its final pass-and-play step. That game uses a random board, and the test script didn't handle one random state (likely a discard dialog after a 7). A re-run passed every step.
- **Full game on a phone viewport:** at 390×844, a scripted player using only touch controls played a full game against Turbo AI to the results screen (18 turns, 35 s), with no errors.
- **Desktop regression:** at 1440×900 the Quick Demo trade → factory → AI-round path still works with no errors (about 10 s per AI round at Normal speed).
- **Not done:** testing on a physical iPhone. Emulation does not reproduce real Safari toolbar behavior, momentum feel or exact touch precision.

## Known issues / remaining mobile work

- Not yet verified on a real iPhone. Check:
  - that the Safari address bar collapsing doesn't hide the tab bar;
  - that momentum panning feels right at 2.2×;
  - that corner targets at fit zoom are comfortable. If they aren't, zoom to 1.5× by default when a build mode starts.
- In the trade dialog on narrow phones, each resource's −/+ buttons stack vertically. They are usable, but the dialog is tall and scrolls.
- AI rivals send a fair number of trade offers to the human (about 12 in an 18-turn game when you always decline). Each one pops a dialog. Consider rate-limiting offers to humans (for example, at most one per rival every three turns).
- There is no pinch-to-zoom gesture; zooming is by buttons, by design.
- The deploy workflow uses `actions/*@v4/v5`, which print Node 20 deprecation warnings. These are harmless; bump the versions when convenient.

## Online multiplayer recommendation (summary)

Use **Cloudflare Workers + one Durable Object per room**:

- The room object imports the existing `src/engine` and is authoritative. It validates every action with `applyAction` and checks that the sender is the acting player (`getActingPlayer`).
- It keeps the secret state (RNG, deck, rival hands) server-side and sends each player a redacted `viewFor(state, seat)` over WebSockets.
- It persists state so refreshes and reconnects resume the same seat via a token stored in `localStorage`, and it runs AI seats and timeouts with alarms.
- The frontend stays on GitHub Pages. Rooms live at `#/room/:id`.
- It needs a free Cloudflare account plus the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub secrets.
- Estimate: about 5–6 h. Full details, alternatives and security notes are in `docs/MULTIPLAYER_PLAN.md`.

## Next steps (for the 9:40 PM session)

1. **Owner:** open https://yinonr.github.io/VoltaGame/ on an iPhone and check the mobile items listed above.
2. Fix anything found on the real device. Keep it small: CSS and layout only.
3. Implement online multiplayer following `docs/MULTIPLAYER_PLAN.md`, in order:
   1. `viewFor` + leak tests;
   2. a `server/` Worker + `RoomDO`;
   3. the client lobby + `useOnlineGame` + reconnect;
   4. the deploy workflow + a two-browser test.

   The owner must first create a Cloudflare account and add the two GitHub secrets.
4. Keep local modes (Quick Demo, vs AI, pass-and-play) untouched and green.

## Commands

```bash
npm install
npm run dev            # http://localhost:5173 (open on a phone via your LAN IP with `npm run dev -- --host`)
npm test               # Vitest engine suite
npm run build          # tsc -b && vite build → dist/
npm run preview        # http://localhost:4173/VoltaGame/
QA_GEN=/tmp/qa npx vitest run qa-fixtures   # write saved-game fixtures for browser QA
```

Browser QA in this cloud environment:

- Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- Install `playwright-core@1.56` outside the repo and launch it with `executablePath`.
- For mobile, create the context with `{ viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true }` and use `locator.tap()`. SVG targets need `{ force: true }`.
- To load a fixture, set `localStorage['settlers-of-compute:save:v1']` and tap **Continue saved game**.

## Architecture notes and pitfalls

- `applyAction` is the only state transition, and `getActingPlayer` decides who acts. Both the AI loop (`useGame`) and the UI key off it. A future server must use the same pair.
- `GameScreen` computes all state and handlers once, then renders either the desktop JSX or the touch JSX (`compact`). Both share `boardEl` and `modalsEl`, so put new UI behavior in the shared part.
- On touch, board taps go through `pending` → confirm. On desktop they act immediately (`doVertex` / `doEdge` / `doTile`).
- The Vite `base` is `/VoltaGame/` for `build` and `preview`.
- Vitest 5, Vite 8 and plugin-react 6 are pinned together.
- `pkill -f "vite preview"` inside a compound shell command can kill the shell itself; run it on its own.
- This environment cannot reach `*.github.io`, the GitHub Pages API, or a16z. Use GitHub Actions logs (GitHub MCP) to verify deploys.
