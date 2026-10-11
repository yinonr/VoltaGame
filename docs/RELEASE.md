# Release — Settlers of Compute

_Prepared 2026-10-11 (Session 4, release sprint) for the first public release of the Settlers of Compute rules. Interview: Monday, October 12, 2026._

**Nothing here has been executed.** Merging to `main` publishes the game. Only the owner (yinonr) approves that.

## What gets published

| | Value |
| --- | --- |
| Release branch | `claude/zealous-ramanujan-enewnb` (contains everything on `claude/new-session-6i54u3`, plus the Session 4 release fixes) |
| Release commit | the latest commit on that branch: `git log -1 origin/claude/zealous-ramanujan-enewnb` (the hash is in `docs/HANDOFF.md`) |
| Currently live | `main` at `37c229b` (the Session 1 build), https://yinonr.github.io/VoltaGame/ |
| Merge type | Plain fast-forward: `main` is an ancestor of the release branch (checked with `git merge-base --is-ancestor`) |
| Deploy | `.github/workflows/deploy.yml` runs on every push to `main` (`npm ci`, `npm test`, `npm run build`, then the Pages upload and deploy, about 1–2 minutes). It can also be started by hand (`workflow_dispatch`). |
| Build | Public build only. `VITE_VOLTA_BRANDING` is unset in CI, so the site shows "A concept for Volta" and the not-affiliated disclaimer, never "Brought to you by Volta". |

## 1. Confirm the release commit

```bash
git fetch origin
git log -1 --oneline origin/claude/zealous-ramanujan-enewnb   # must match the hash in docs/HANDOFF.md
git merge-base --is-ancestor origin/main origin/claude/zealous-ramanujan-enewnb && echo "fast-forward OK"
```

On GitHub, open **Actions → CI** and check that the run for that exact commit is green.

## 2. Merge into `main`

The exact fast-forward from a terminal:

```bash
git checkout main
git pull --ff-only origin main
git merge --ff-only origin/claude/zealous-ramanujan-enewnb
git push origin main
```

Or on GitHub: open a pull request from `claude/zealous-ramanujan-enewnb` into `main`, then **Create a merge commit**. GitHub's buttons never fast-forward. A merge commit is fine here, and the deployed files are the same either way.

Optional before merging: `recovery/` (656 KB of Session 2 backup patches) is not part of the site. Delete it first if you'd rather not have it on `main`.

## 3. Deployment

The push to `main` starts **Deploy to GitHub Pages** on its own. In **Actions**, wait for both jobs (`build`, `deploy`) to turn green. The `deploy` job prints the page URL.

If it didn't start, open **Actions → Deploy to GitHub Pages → Run workflow** and pick the `main` branch.

## 4. Verify the deployment

Open https://yinonr.github.io/VoltaGame/ with a hard refresh (desktop: Shift+Reload; iPhone: close the tab and reopen it). Check:

- The title says **"A concept for Volta"**, and the small print says **"Not affiliated with or endorsed by Volta."**
- **New Game** asks for a company name. Under **Rules**, "Settlers of Compute" (Recommended) and "Classic" both show without scrolling, also on the phone.
- After **Start game**, the intro says "You are …" with four short steps and a **Play** button.
- Link preview: paste the URL into a message to yourself (iMessage, Slack or LinkedIn). It should show the "Settlers of Compute" card with the board. Previews are cached; a URL with `?v=1` added forces a fresh fetch.

## 5. Smoke test (about 5 minutes)

On desktop, then on the iPhone in Safari:

1. **New Game** → keep or type a name → **Start game** → **Play**.
2. **Roll dice**. The dice tumble, the hexes light up, and the "+N" chips fly to your hand.
3. **Build** tab. Every option shows its cost; unaffordable ones say what's missing. **Trade** opens the market and rival deals.
4. **End turn**. Three rival turns run, about 7–9 s at Normal speed.
5. **☰ → Title screen**, then **Continue saved game**. The same game resumes.
6. Optional: **☰ → AI speed: Turbo**, and play to the results screen. **New game** there goes back to setup.

On the iPhone, specifically check:

- Safari's toolbar never hides the bottom tab bar or the **Roll dice / End turn** button.
- Panning is comfortable when zoomed (**+** twice).
- The corner and edge targets are easy to hit at normal zoom.

## 6. Roll back if needed

Rolling back means going back to the Session 1 build (`37c229b`) with one new commit. History is not rewritten and nothing is force-pushed.

```bash
git checkout main
git pull --ff-only origin main
git restore --source=37c229b --staged --worktree -- .   # every file back to 37c229b, added files removed
git commit -m "Roll back the site to 37c229b"
git diff 37c229b HEAD --stat        # must print nothing
git push origin main                # redeploys the old build
```

This was rehearsed in a scratch clone: the rollback commit's tree matches `37c229b` exactly. `git revert 37c229b..HEAD` does **not** work, because the range contains merge commits.

If you merged with a GitHub pull request instead, the PR's **Revert** button does the same thing.

**Saved games after a rollback.** Visitors keep their autosave, but the old build doesn't know the Settlers of Compute rules. Anyone mid-game should start a new one.
