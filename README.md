# Settlers of Compute

*Build your AI empire. Before someone else builds theirs.*

**▶ Play now: https://yinonr.github.io/VoltaGame/** (desktop or phone)

**Settlers of Compute** is a browser strategy game inspired by the familiar mechanics of Settlers of Catan, reimagined around the AI compute economy. You are the founder of an ambitious AI startup. Three rival AI companies want the same scarce inputs — **Power, Networking, Land, Capital and GPUs** — and the first company to **10 Compute Points** becomes the market leader.

> **Premise.** For years, only the largest companies could lock up the land, power and GPUs behind frontier AI. This game imagines a market where compute behaves more like a utility — so the startups get to compete. *You don't have to be a hyperscaler to compete in AI anymore.*

It is a playful abstraction, not a simulation of any real company's products, financing or operations. You play a fictional startup — not Volta.

## Play

| Mode | What it is |
| --- | --- |
| **Quick Demo** | A deterministic midgame reached through real engine play. You (Parallax Labs) have just rolled and face a real choice: build a Compute Cluster now, or trade a rival for the GPU you need for an AI Factory. Three AI rivals then play through the same engine. |
| **New Game** | You vs. 3 AI companies with a Quick Start opening (two Compute Clusters + two Network Connections each, chosen for an even start). |
| **Custom game** | 2–4 companies, any mix of humans (local pass-and-play on one device) and AI; optional manual snake-draft opening; optional board seed. All-AI games can be spectated. |
| **Continue** | The current game auto-saves to browser storage. |

### Controls

**Desktop:**

- **Roll dice** (`R`), **Trade** (`T`), **End turn** (`E`), `Esc` cancels a placement.
- Click a build option, then click a glowing corner or edge on the board. Disabled options say why (missing resources, no legal site, wrong phase…).
- AI speed: **Normal → Fast → Turbo** (top bar).

**Phone (portrait or landscape):**

- The board is the centerpiece. Use the **+ / −** buttons to zoom, then drag with one finger to pan.
- Tap a glowing spot, then tap **Confirm**; a mis-tap never builds anything.
- The dock holds the dice and Roll / End turn. Your resources sit underneath.
- The tab bar opens **Build**, **Trade**, **Cards**, **Activity** and **Market** (scores) as bottom sheets. The **☰** menu has AI speed, rules and new game.

### Rules at a glance

| Compute resource | Catan analogue |
| --- | --- |
| Power | Wood |
| Networking | Brick |
| Land | Sheep |
| Capital | Wheat |
| GPUs | Ore |

| Build | Cost | Points |
| --- | --- | --- |
| Network Connection (road) | 1 Power + 1 Networking | 0 |
| Compute Cluster (settlement) | 1 Power + 1 Networking + 1 Land + 1 Capital | 1 |
| AI Factory (city upgrade) | 3 Capital + 2 GPUs | 2 total |
| Innovation Card (development card) | 1 Land + 1 Capital + 1 GPU | varies |

Roll → collect from matching hexes (1 per cluster, 2 per factory) → trade (market 4:1, hubs 3:1 / 2:1, or offers to rivals) → build → end turn. A **7 triggers a Grid Disruption**: players over 7 cards discard half, the roller moves the outage marker (that hex stops producing) and takes a random resource from an adjacent rival. Bonuses: **Longest Network** (+2, 5+ connections) and **Priority Access** (+2, 3+ Infrastructure Priority cards). **AI Breakthrough** cards are secret +1s.

Full design notes: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md). Project status and next steps: [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Run locally

Requires Node 20.19+ (developed on Node 22).

```bash
git clone https://github.com/yinonr/VoltaGame.git
cd VoltaGame
npm install
npm run dev        # http://localhost:5173
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Engine test suite (Vitest) |
| `npm run typecheck` | TypeScript project check |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build at `http://localhost:4173/VoltaGame/` |

## Deploy (GitHub Pages)

The production build uses the base path `/VoltaGame/` (see `vite.config.ts`; override with `VITE_BASE=/ npm run build` for other hosts). It is a fully static site: no backend, accounts, keys or paid APIs.

`.github/workflows/deploy.yml` tests, builds and publishes `dist/` on every push to `main`. One-time setup by a repository admin: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then re-run the latest "Deploy to GitHub Pages" workflow, or push to `main`. The site will be served at `https://yinonr.github.io/VoltaGame/`.

> **Live:** https://yinonr.github.io/VoltaGame/. Pages is enabled, and every push to `main` redeploys.

Any other static host works too: upload the contents of `dist/`.

## Tech

React 19 + TypeScript + Vite, SVG for the board and pieces, plain CSS, Vitest. The rules engine (`src/engine/`) is pure and deterministic — seeded RNG, immutable state transitions, no React — so the same engine drives the UI, the AI opponents, the Quick Demo and the tests, and could later sit behind a network layer for online play.

## Known limitations

- Phone layout is tested in browser emulation (iPhone-sized viewports with touch), not yet on a physical iPhone.
- Only the active player can trade, one counterparty at a time (no open "ask everyone" offers or counter-offers).
- Innovation Cards other than Infrastructure Priority can't be played before rolling.
- Online multiplayer is out of scope for this version.

---

**Independent, unofficial, Catan-inspired creative prototype.** Not affiliated with, sponsored or endorsed by Volta or Catan rights holders. "Settlers of Compute" is a provisional title. All company names in the game are fictional, and all artwork is original SVG/CSS.
