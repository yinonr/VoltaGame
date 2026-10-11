# Handoff — Settlers of Compute

_Last updated: 2026-10-11, Session 4 (release sprint). Interview: Monday, October 12, 2026._

## Session 4: release sprint (read this first)

**Release candidate:** branch **`claude/zealous-ramanujan-enewnb`**, latest commit (`git log -1 origin/claude/zealous-ramanujan-enewnb`).

- The branch contains all of `claude/new-session-6i54u3` (`a93e986`) plus the Session 4 fixes.
- `main` (`37c229b`, the live Session 1 build) is an ancestor, so publishing is a plain fast-forward.
- **Not merged or deployed.** That waits for the owner's approval. The steps, smoke test and rehearsed rollback are in **`docs/RELEASE.md`**.

**Recommendation: GO, ready for owner approval** after the owner's own iPhone check. No known Blocker or High issues remain.

### What changed (UI, copy, config and tests only; the rules engine is untouched, so Classic is unchanged)

| Area | Change |
| --- | --- |
| Setup | Rules sit right under the company name. On phones the two rule sets show side by side with a one-line blurb, so Classic is visible without scrolling, even on an iPhone SE. |
| Intro | Four concrete steps: what you start with, how a roll pays out, what building scores, and the rule set. On short phones the **Play** button stays pinned on screen. |
| Phone game screen | Your own player chip is wider. The grid chips (Grid vulnerable, Stabilizing, Outage) explain themselves on tap; their tooltips never showed on touch. The roll note fits three lines. The Build sheet keeps its Financing and Full-Stack headings. The copy says "Tap", not "Click". Disabled zoom buttons are opaque. |
| Results | On phones the action row stays pinned. No late toasts over the headline. The Factories column reads "2 + 1 financed · 5 CP" (or "—"). Winning from inside the Build sheet closes the sheet. |
| Activity log | Newest turn first, with each "Turn N" heading above its own events (before, every heading sat below its turn). |
| Discard dialog | The + buttons stop at the required number. |
| Safari | No long-press text selection or callouts on the board. No input under 16px, so focusing a field never zooms the page. |
| Sharing | Open Graph and Twitter tags plus a 1200×630 `og-image.jpg`, so the link previews with the board, "A concept for Volta" and the not-affiliated line. Also an `apple-touch-icon.png`. |
| Copy | How to play no longer says an outage lasts until the marker moves; that is Classic only. The README covers Grid Stability. |
| Tests | `release-intersections.test.ts`: an Integrated Deployment win at exactly 10 CP (and no win at 9), and Financing repayment during Grid Stability, including a calm 7. `log-order.test.ts`: Activity grouping, including a real AI game. |
| Docs | `docs/RELEASE.md`: confirm, merge, deploy, verify, smoke test, and a rollback rehearsed in a scratch clone. |

### Evidence (actual results)

- `npm test`: **185 passed**, 5 opt-in skipped. `tsc -b`, `npm run build` and `npm run build:branded` all pass.
- **CI:** green on every Session 4 push except `35925ae`, whose new test file failed typecheck (`tsc -b`). The next commit, `fe4f1b6`, fixed it; check that the final commit is green in Actions.
- **Engine simulation:** 4,500 games on fresh seeds (`SIM_SEED=70000`), covering Classic, Compute and Compute + beta cards with 2, 3 and 4 players. Every game was decided, with **0 stalls, 0 illegal AI actions and 0 invariant violations** (resource conservation and state immutability checked after every action).
- **UI, emulated (headless Chromium with iPhone touch emulation, not real Safari):**
  - Complete games driven only by taps and clicks reached the results screen, with no console errors and no horizontal overflow, at 390×664 (an iPhone 14's visible Safari area), 375×548 (an iPhone SE in Safari), 844×340 (landscape) and 1440×900.
  - Classic was played at 375×548.
  - Saved-game fixtures covered financing, refinance-to-win, Grid Stability chips, cards and discard.
  - Reloading mid-game, including during an AI turn, resumes the same game. A corrupt save falls back to the title.
  - Normal-speed AI rounds take about 7–9 s.
- **Independent QA agent** (one, report-only): first-time-player run on phone, landscape and desktop. It found 0 Blockers and 0 Highs. Its three Mediums (Activity order, touch-only tooltips, clipped roll note) and three of its Lows are fixed. Its verdict: a first-time player can pick the game up on an iPhone.
- **Production audit:**
  - No credentials or secrets in the source or the bundle.
  - No source maps or `localhost` references.
  - The public bundle has no "Brought to you by Volta" (`VOLTA_BRANDING` is off in CI).
  - Assets resolve under `/VoltaGame/`.
  - The deploy workflow is unchanged and its last run on `main` succeeded.
- **Not done:** a physical iPhone, real Safari, or human-vs-human play.

### Remaining risks

| Category | Item |
| --- | --- |
| Release blockers | None known. |
| Owner check (real iPhone) | Does Safari's collapsing toolbar ever hide the tab bar or Roll / End turn? Is panning comfortable at 2.2×? Are corner and edge targets easy at fit zoom (the QA agent found diagonal edges usable but fiddly)? Do link previews show up in iMessage? |
| Acceptable limitations | Rival names abbreviate in phone chips ("Stacks…"; more in iPhone SE landscape). The results table scrolls sideways on phones. After a Network Connection is built, placement mode stays on if you can afford another. Grid chips can cover a hub label. Theft results show in Activity, not in a toast. |
| Post-launch | AI rarely uses Integrated Deployment. Stacksmith is the weakest rival. Classic still labels the Dead Zone marker "OUTAGE" at the start (Classic display left as is). The Full-Stack "Four resource types" line lists every touched type under 4 / 4. `recovery/` (656 KB) is still in the repo. |

### Owner decision (optional)

The public title screen's eyebrow reads "An unofficial strategy prototype". It is accurate but modest, and "prototype" also appears in the disclaimer. A possible replacement is "A Catan-inspired strategy game". It was left alone because it is branding copy.

### Post-launch backlog (do not start before Monday)

1. Fixes from the owner's iPhone check, if any.
2. A light "built" confirmation, then leave placement mode, for touch road building.
3. Move the grid chips off hub labels, and show a toast for thefts against you.
4. The roadmap below: Innovation Cards, market events, onboarding hints, then online multiplayer. A 10- vs 12-CP study is deferred.

---

# Session 3 handoff (history)

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
| `claude/volta-branding` | `db08323` | Session 1 feature branch. Untouched; fully contained in the session branches. |
| `claude/new-session-6i54u3` | `a93e986` | Session 3 release candidate. Fully contained in the Session 4 branch. |
| **`claude/zealous-ramanujan-enewnb`** | latest pushed | **Session 4 release candidate** (see the top of this file). A fast-forward of `main`. |
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
| **Victory screen:** CP count-up, a burst in the winner's color, and accomplishments read from the final state (factories, financed, Longest Network, Priority Access, Full-Stack with its round, Breakthroughs) | `qa-win-compute.json` fixture checked in Chromium on desktop and phone |
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

Superseded by **`docs/RELEASE.md`**, which publishes `claude/zealous-ramanujan-enewnb`. Don't use the Session 3 steps that were here. They named the older branch, and their `git revert` rollback fails on this history because it contains merge commits.

## Known issues and risks

- **Testing gaps:**
  - No physical iPhone test. Check the Safari toolbar against the tab bar, panning feel at 2.2×, and the sticky Start row on the setup screen.
  - The rival ticker and toasts were seen in screenshots but not tuned on a real phone.
- **Setup screen:** on phones the Classic rules card sits below the sticky Start button, so you scroll to switch modes.
- **Copy and display:**
  - Long custom names are truncated in phone chips (the full name shows in the Market sheet).
- **Balance shifts:**
  - Integrated Deployment is rare in AI hands (0.3–0.4 per game). A human can use it more.
  - Innovation Cards and Priority Access are used about half as often under the Compute rules.
- **Market events:** not merged.
- **Recovery branches:** the `s2/*` branches exist only in this container and in `recovery/` on GitHub.

## Next session (priority order)

1. **Owner review on a real phone**, then publish (see above). Fix only what that review finds.
2. **Innovation Cards** (`docs/INNOVATION_CARDS.md`): prototype GPU Optimization, then Nuclear Power Plant (end the current outage), then Battery Storage, as Compute-only deck additions.
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
