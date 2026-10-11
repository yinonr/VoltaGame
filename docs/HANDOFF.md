# Handoff — Settlers of Compute

_Last updated: 2026-10-11, end of Session 3 (recover, integrate, finish). Interview: Monday, October 12, 2026._

## Status in one paragraph

All Session 2 agent work was recovered, finished and integrated into **`claude/new-session-6i54u3`**. Market events are the one exception: they are preserved but deferred. The branch now has:

- **Infrastructure Financing**, tuned by simulation;
- **company naming and identity**, with a clear YOU tag;
- **Full-Stack Integration** with Integrated Deployment;
- **game-feel feedback** and **AI trade-offer rate limiting**;
- a **QA invariant suite** and a **simulation harness**.

On the latest commit: **163 tests pass** and 4 opt-in simulations are skipped; typecheck and the public and branded builds pass; GitHub Actions CI is green. Full games were played through the real UI at 1440×900, 390×844, 375×667 and 844×390, with no console errors and no overflow.

**`main` and the live site are unchanged.** The release candidate is ready for the owner's review and needs the owner's approval to publish (see "Publish" below).

## Branches

| Branch | Commit | What it is |
| --- | --- | --- |
| `main` | `37c229b` | Live at https://yinonr.github.io/VoltaGame/ (Session 1 build). Untouched. |
| `claude/volta-branding` | `db08323` | Session 1 feature branch. Untouched; fully contained in the session branch. |
| **`claude/new-session-6i54u3`** | latest pushed (`git log -1 origin/claude/new-session-6i54u3`) | **The release candidate.** A fast-forward of `main`. |
| `s2/*` (7 branches) | local only | Session 2 agent branches, preserved in `recovery/` as a bundle plus patches. `recovery/README.md` explains how to restore them and what was integrated. |

## What works (verified)

| Feature | Evidence |
| --- | --- |
| **New Game setup:** name your company, see the rivals, choose Settlers of Compute or Classic; Enter starts | Agent browser run, 125/125 checks at 3 viewports; lead's full-game runs |
| **Identity:** YOU tag, "your color", rival strategies, turn banner, leader crown, Leveraged and Full-Stack badges; custom names in log, toasts, intro and pass screen | Same, plus `names.test.ts` |
| **Infrastructure Financing:** standard vs financed choice, placement, commitments, the outage stall, Refinance, board badge, '+1 repaid' chips | `financing.test.ts` (20 tests); lifecycle scripts at 1440×900 and 390×844; financing and refinancing during full UI games on desktop and two phone sizes |
| **Full-Stack Integration:** four milestones, permanent unlock (even on a rival's turn), Integrated Deployment at 8 resources, progress panel | `fullstack.test.ts` (25 tests); calibration (600 games) |
| **AI** uses Financing (7.5 upgrades per game), refinances, targets financed factories with the outage, unlocks and uses Full-Stack | Simulations: 0 stalls and 0 illegal moves in 800 games |
| **Fewer interruptions:** AI offers to a human dropped from 10.9 to 2.2 per game | `trade-offers.test.ts` (30 seeds), with an all-AI fingerprint check |
| **Feedback:** dice tumble, lit hexes, BLOCKED flash, your ringed payout chips, '+N' gains, build pulses, rival ticker | Browser screenshots on desktop and phone |
| **Classic Mode and old saves** behave exactly as before: same AI decisions, same Quick Demo, 25-card deck | Seeded fingerprint tests, old-save tests in `financing.test.ts` and `invariants.test.ts`, all earlier tests unchanged |
| **Public concept branding:** "A concept for Volta" plus the disclaimer; no sponsorship claim; the private branded preview is unchanged | Agent browser check of the public and branded titles |

## Tests and builds (actual results)

- `npm test`: **163 passed, 4 skipped** (the skipped ones are opt-in: fixture generator, Financing balance probe, Full-Stack calibration, long simulation).
- `npm run build` and `npm run build:branded`: pass.
- **GitHub Actions CI** (`ci.yml`): green on every pushed commit of the branch, including the latest.
- **Browser QA** (Playwright with headless Chromium, public production build): complete games driven through the UI as the human at 1440×900, 390×844, 375×667 and 844×390. These covered rolls, 7s, discards, outage moves, declined offers, financing and refinancing, and a winner screen, with no console errors and no horizontal overflow.
- **Not done:** a physical iPhone, and real Safari.

## Balance (details in `docs/BALANCE.md`)

| Measure (Compute rules unless noted) | Value |
| --- | --- |
| Game length | 16.7 rounds (Classic 18.1); no stalls; close games 62.5% |
| Financing as proposed (2 GPUs, 3 units) | A debt-free company won only 10.5%, so it was retuned |
| Financing as shipped (1 Capital + 2 GPUs, 5 units, cap 2) | The debt-free company wins 22.6% over 1,200 games (fair 25%) |
| Full-Stack unlocks | 80% of companies, median 5 CP, round 11, with 5 rounds left |
| Integrated Deployments | 0.3–0.4 per game |
| Specialists (most specialized third of openings) | Win 18.7% (Classic 21.7%) |
| Helixa, the innovation-focused rival | Wins 33% |

**Known shift:** Financing roughly halves Innovation Card purchases and Priority Access, because GPUs go to factories.

## Final design numbers

| Item | Value |
| --- | --- |
| Standard AI Factory | 3 Capital + 2 GPUs: +1 CP and double output now |
| Financed AI Factory | 1 Capital + 2 GPUs: 1 CP and cluster output until it repays 5 units of its own output; at most 2 outstanding; Refinance at 1 Capital per unit left (not a card play) |
| Outage vs. Financing | A blocked hex repays nothing; the badge turns red; the AI targets financed factories |
| Full-Stack milestones | 1 operational factory + 3 sites + 4 resource types + a 4-connection network (all at once); permanent once unlocked |
| Integrated Deployment | 1 Power + 1 Networking + 1 Land + 3 Capital + 2 GPUs: a full factory on an open network site, +2 CP, repeatable |
| Market events | Not in this build (prototype preserved on `s2/events`) |

## Publish (owner action, needs approval)

`main` is an ancestor of the session branch, so this is a plain fast-forward.

1. On GitHub, open a pull request from `claude/new-session-6i54u3` into `main` and review the changes. You can also skip the PR and merge locally:

   ```bash
   git fetch origin
   git checkout main
   git merge --ff-only origin/claude/new-session-6i54u3
   git push origin main
   ```

2. Merging to `main` runs **Deploy to GitHub Pages** (`deploy.yml`: `npm ci`, `npm test`, `npm run build`, then upload). It takes about 1–2 minutes; watch the Actions tab until it's green.
3. Open https://yinonr.github.io/VoltaGame/ with a hard refresh, on desktop and on your phone. Check:
   - the title shows **"A concept for Volta"**;
   - New Game asks for your company name;
   - "Settlers of Compute" is preselected;
   - the Build panel shows "AI Factory · financed" once you have a cluster and the resources.
4. **Optional cleanup before merging:** delete `recovery/` (about 0.3 MB of backup artifacts) if you don't want it on `main`. It's harmless either way.
5. **Rollback:** revert the merge on `main` (GitHub "Revert" on the PR, or `git revert`), which redeploys the previous build. Visitors' autosaves stay loadable either way.

Players see a New Game setup (name, rivals, rules). The default game uses Infrastructure Financing and Full-Stack Integration, Classic is one click away, and the gameplay feedback is livelier. Old in-progress saves continue as Classic games.

## Known issues and risks

- **Testing gaps:**
  - No physical iPhone test. Check the Safari toolbar against the tab bar, panning feel at 2.2×, and the sticky Start row on the setup screen.
  - The rival ticker and toasts were seen in screenshots but not tuned on a real phone.
- **Setup screen:** on phones the Classic rules card sits below the sticky Start button, so you scroll to switch modes.
- **Copy and display:**
  - Long custom names are truncated in phone chips (the full name shows in the Market sheet).
  - The IntroModal says "Four ambitious AI companies" even in 2–3 seat custom games.
- **Victory screen:** shows standings (with financed factories separated) but not yet a list of accomplishments such as Full-Stack or financing totals.
- **Balance shifts:**
  - Integrated Deployment is rare in AI hands (0.3–0.4 per game). A human can use it more.
  - Innovation Cards and Priority Access are used about half as often under the Compute rules.
- **Market events:** not merged.
- **Recovery branches:** the `s2/*` branches exist only in this container and in `recovery/` on GitHub.

## Next session (priority order)

1. **Owner review on a real phone**, then publish (see above). Fix only what that review finds.
2. **Victory screen accomplishments** from real state: Full-Stack turn, financed factories, Longest Network, Priority Access.
3. **Market events:** restore `s2/events` from `recovery/`, update it to the 5-unit commitment and the ceiling of 6, keep it behind a Custom-game "Market events (experimental)" toggle, and rerun the balance probe.
4. **Human playtests of the Compute rules.** Watch the card economy and how often humans use Integrated Deployment; consider the 7-resource recipe only if it is rarely used.
5. **Onboarding:** light contextual hints on the first turns (for example the first financed upgrade, the first milestone).
6. **Online multiplayer**, last (`docs/MULTIPLAYER_PLAN.md`).

## Commands

```bash
npm install && npm test && npm run build        # baseline
npm run dev                                     # branded dev build (VOLTA_BRANDING on)
npm run build:branded && npm run preview        # branded production-style build
QA_GEN=/tmp/qa npx vitest run qa-fixtures       # saved-game fixtures, incl. qa-financing.json (Compute rules)
FIN_BALANCE=/tmp/fin.txt N=300 S0=12000 npx vitest run financing-balance
SIM=1 SIM_CONFIGS=classic,compute SIM_GAMES=200 npx vitest run simulate
SIM_FULLSTACK=1 npx vitest run fullstack-calibration
```

**Browser QA in the cloud container:**

- Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; use `playwright-core@1.56` installed outside the repo.
- Load a fixture into `localStorage['settlers-of-compute:save:v1']` and press **Continue saved game**.
- On phones, use `isMobile` + `hasTouch` and `tap()`; SVG targets need `{ force: true }`.
- Run `pkill -f "vite preview"` as its own command.

## Architecture notes

- **State changes:** `applyAction` is the only state transition, and `getActingPlayer` says who acts.
- **Feature modules:** `financing.ts`, `fullstack.ts` and `events.ts` implement their reducer cases through `mutate.ts` helpers, which avoids import cycles.
- **Rules flags:** gate every new mechanic on `rulesOf(state)`, so Classic stays byte-for-byte identical. The seeded fingerprint tests check this.
- **Immutability:** never mutate a Building; always write a new object. The invariant suite deep-freezes every state.
- **Factory output:** `outputMultiplier(b)` is the only place where "factory = double output" lives.
- **UI:** `GameScreen` computes once and renders the desktop or the touch layout. Strategy panels are in `src/ui/strategy.tsx`, feedback in `src/ui/feedback.tsx`, identity in `src/ui/companies.ts` and `NewGameScreen.tsx`, and per-stream CSS in `src/ui/styles/*.css`.
