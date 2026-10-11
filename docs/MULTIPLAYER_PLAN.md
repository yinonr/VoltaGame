# Online Multiplayer Plan

_Status: plan only, no code yet. Written at the end of session 1 for the next build session._

## Target experience

1. A player taps **Create online game**, picks a company, and gets a private link such as `https://yinonr.github.io/VoltaGame/#/room/K7Q2-M9XD`.
2. Two to four friends open the link on their own phones or laptops, pick a free company, and the host taps **Start**. Optionally, AI companies fill the empty seats.
3. Everyone sees the same board update live. Each player sees only their own hand and cards.
4. Trades work across devices: an offer pops up on the target's screen.
5. Refreshing, locking the phone, or briefly losing signal doesn't end the match. Reopening the link resumes the same seat.

## Constraints from the existing code

- The rules engine (`src/engine/`) is pure TypeScript with no DOM access. `applyAction(state, action)` is the only state transition, and `getActingPlayer(state)` already says who may act next, including trade targets and players who owe a discard.
- `GameState` holds **secret information**:
  - every hand and every Innovation Card;
  - the order of the card deck;
  - the RNG state (`rng`), which determines all future dice rolls and steals.

  Clients must never receive the full state, or they could read hands and predict the dice.
- GitHub Pages only serves static files, so the authoritative game must run somewhere else.

## Options considered

| Option | Authoritative? | Hidden hands safe? | Survives refresh/host leaving? | Ops burden | Verdict |
| --- | --- | --- | --- | --- | --- |
| Peer-to-peer (WebRTC/PeerJS), host's browser runs the engine | Host only | No: the host sees everything | No: the game dies with the host's tab | None | ✗ |
| Shared realtime DB (Firebase RTDB / Supabase Realtime), each client applies actions | No: any client can write anything | No: state is readable | Yes | Low | ✗ for fair play; fine only for trusted friends |
| Serverless functions + DB (Firebase Functions + Firestore, Supabase Edge + RLS) | Yes | Yes, with per-player docs and row-level security | Yes | Medium; Firebase Functions need the paid Blaze plan | Possible, but more moving parts |
| Game server (Colyseus / Node on Fly.io or Render) | Yes | Yes | Yes | Medium–high (a server to run and scale) | Overkill |
| **Cloudflare Worker + one Durable Object per room** | **Yes** | **Yes** | **Yes**: state persisted in the object's storage | **Low**: free tier, no servers, `wrangler deploy` | **✓ Recommended** |

## Recommendation: Cloudflare Durable Objects (room = object)

A Durable Object is a single-threaded object with its own storage and WebSocket support, addressed by name. One object per room maps directly onto "one authoritative game":

```
 phone / laptop (GitHub Pages SPA)            Cloudflare
 ┌─────────────────────────────┐   wss    ┌──────────────────────────────┐
 │ GameScreen (unchanged UI)    │ <──────> │ Worker: routes /rooms/:id     │
 │ useOnlineGame(roomId)        │          │  └─ RoomDO (one per room)     │
 │  · sends {type:'action',…}   │          │     · GameState (secret)      │
 │  · receives redacted views   │          │     · applyAction() validation│
 └─────────────────────────────┘          │     · per-seat views → sockets │
                                           │     · AI seats + timers (alarm)│
                                           │     · storage: state + seats  │
                                           └──────────────────────────────┘
```

**Why this option:**

- It reuses the engine verbatim. The server imports `src/engine/*`, so there is one rules implementation, the same 53 tests, and the same determinism.
- It is authoritative by construction. The object validates every action with `applyAction` and rejects anything from a socket that isn't `getActingPlayer(state)`.
- Secrets stay on the server: RNG state, deck order and rival hands never leave the object.
- Reconnection is cheap. State lives in Durable Object storage, and WebSocket Hibernation keeps idle rooms nearly free.
- There is no server to run. The free plan covers Workers and Durable Objects (SQLite-backed) at friends-and-family scale.
- PartyKit / `partyserver` (Cloudflare's thin wrapper over Durable Objects) is an acceptable shortcut if it speeds up the socket boilerplate.

## Design details

### Identity and seats (no accounts)

- On first join, the client generates a random `playerToken` (UUID) and stores it in `localStorage` under the room id.
- The object maps `playerToken → seat`. Reconnecting with the same token restores the seat, and a token can hold only one seat. The host token is the room creator's.
- Room ids are long and unguessable (10+ base32 characters), and the link itself is the invitation.

### Protocol (JSON over one WebSocket)

Client → server:

- `{ t: 'join', token, name? }`
- `{ t: 'pickSeat', companyId }`
- `{ t: 'start', aiSeats: companyId[] }` (host only)
- `{ t: 'action', action: Action, clientSeq }`
- `{ t: 'ping' }`

Server → client:

- `{ t: 'lobby', seats, hostSeat, you }`
- `{ t: 'view', view: PlayerView, lastSeq }`
- `{ t: 'error', message, clientSeq }`
- `{ t: 'presence', online: seatIds[] }`

### Engine additions (small, testable, in `src/engine/`)

- `viewFor(state, seat): PlayerView`:
  - removes `rng` and `devDeck` (keeps only the deck length);
  - replaces other players' `resources` with totals and their `devCards` with counts;
  - keeps your own data and the public log.

  Log lines already avoid revealing AI card draws. Steal results are only spelled out when a human is involved; the online version should spell them out only to the two parties.
- A UI adapter: `GameScreen` reads from `GameState`, so either make `PlayerView` structurally compatible (hidden hands as zeroed bundles plus a `handCount`), or add small accessors. The first option keeps the UI changes tiny.
- Tests:
  - `viewFor` never leaks secrets (property test over random games);
  - replaying a game action by action on the "server" matches the local engine.

### Room object behavior

- **Lifecycle:** `lobby → playing → finished → expired`. The object sets an alarm to delete itself after 7 days without activity, or 24 hours after the game ends.
- **On `action`:**
  1. Check `seatOf(socket) === getActingPlayer(state)`.
  2. Run `next = applyAction(state, action)`. If it throws `GameError`, send an error to that socket only.
  3. Persist the new state.
  4. Broadcast `viewFor(next, seat)` to each socket.
- **AI seats:** after each transition, if the acting seat is an AI, schedule `decideAIAction` with a short delay (an alarm or `setTimeout`), the same pacing as `useGame`.
- **Timeouts:**
  - a pending human-to-human trade auto-declines after 60 seconds;
  - if the acting player is offline for more than 90 seconds, the room can let the AI play that turn (host setting), so the table isn't stuck.
- **Concurrency:** Durable Objects process one event at a time, so there are no race conditions on `state`.

### Client changes

- **Hash routes:** `#/` keeps today's title screen (local games stay unchanged); `#/room/:id` is the online lobby and game.
- **`useOnlineGame(roomId)`:** returns the same shape as `useGame`, `{ state, dispatch, toasts, … }`. Here `dispatch` sends the action and does not change state locally; state arrives from the server. `GameScreen` sets `viewer` to my seat; the pass-and-play logic is disabled online.
- **Lobby screen:** share button (Web Share API on iPhone, copy-link fallback), company picker, a list of who's online, and a host **Start** with optional AI fill.
- **Connection banner:** "Reconnecting…" with exponential backoff, plus a full resync on every reconnect (the server sends the current view).

## Configuration and credentials

- **Cloudflare account:** free plan; the account owner creates it. Workers and Durable Objects need no billing at this scale.
- **Repository layout:** `server/` with `wrangler.toml`, which holds:
  - the Durable Object binding `ROOMS`;
  - a migration with `new_sqlite_classes = ["RoomDO"]`;
  - `compatibility_date`.
- **Secrets:** stored in GitHub Actions only, never in the repo:
  - `CLOUDFLARE_API_TOKEN` (permission: Workers Scripts: Edit);
  - `CLOUDFLARE_ACCOUNT_ID`.

  A `deploy-server.yml` workflow runs `wrangler deploy` on pushes to `main` that touch `server/**` or `src/engine/**`.
- **Frontend config:** `VITE_ROOMS_URL=wss://soc-rooms.<subdomain>.workers.dev`, set in the Pages build step. It is not a secret.
- **Local development:** `wrangler dev` runs the room server locally (Miniflare). Point `VITE_ROOMS_URL` at `ws://localhost:8787`.

## Security considerations

- **Server-side validation:** the server is the only writer, and every action goes through `applyAction` plus the acting-seat check. Messages are size-capped (around 4 KB) and schema-checked before use.
- **Rate limits:** about 20 messages/second per socket, at most 4 seats per room, and room creation limited per IP (a Worker rate-limit binding or a simple counter).
- **Origin check:** the WebSocket upgrade only accepts the GitHub Pages origin and localhost.
- **No personal data:** no accounts, emails or analytics. Display names are optional and length-limited, and text is never rendered as HTML.
- **Secret game state:** RNG and deck order stay server-side. Logs sent to a player never reveal another player's hidden draws.

## Estimated scope (one focused session)

| Step | Work | Rough effort |
| --- | --- | --- |
| 1 | `viewFor` + `PlayerView` type + leak tests | 45 min |
| 2 | `server/` Worker + `RoomDO`: join, seats, start, actions, broadcast, persistence, AI seats, alarms | 2 h |
| 3 | Server tests with `@cloudflare/vitest-pool-workers` (join/rejoin, illegal action rejected, out-of-turn rejected, no secrets in views) | 45 min |
| 4 | Client: hash routing, lobby, `useOnlineGame`, reconnect banner, share link | 1.5 h |
| 5 | Deploy workflow, docs, two-browser manual test plus Playwright two-context test | 45 min |

**Total: about 5–6 hours of focused agent work.** The minimum viable cut: human seats only, with no AI fill and no offline-turn takeover. That removes about an hour.

## Fallback if Cloudflare setup is blocked

Supabase is the fallback, and it is free to start:

- an Edge Function (Deno) imports the engine, validates actions and writes rows;
- per-player `hands` rows are protected by row-level security;
- Realtime broadcasts public state changes.

It is more configuration (database schema, RLS policies, anonymous auth) but keeps the same authoritative-server design. A client-only shared-database approach is acceptable **only** for a "trusted friends" mode, because hands and dice would be inspectable.

## State added since this plan (must be synchronized)

These are all plain JSON in `GameState`, already deterministic and already covered by the save and JSON round-trip tests. Any `viewFor(state, seat)` redaction must keep them public.

| Field | What it is |
| --- | --- |
| `rules` | `{ financing, fullStack, marketEvents, gridStability? }`: the game's rules variant. Fixed at creation; never changes mid-game. |
| `grid` | `{ stableRolls, outageRolls }`: the Grid Stability timers (Compute rules). |
| `lastRoll.stabilized` | A 7 absorbed by the stabilizing grid; the UI shows it differently. |
| `Building.financed` | Committed units still owed by a financed AI Factory. |
| `Player.fullStackTurn` | When Full-Stack Integration was unlocked. |
| `Player.name` | Sanitized custom company name. The server should re-sanitize names from clients with `sanitizeCompanyName`, and keep them unique. |
| `lastProduction.deliveries` | Financing repayments on the last roll (UI feedback). |

Hidden information is unchanged: the server must still redact other players' hands and Innovation Cards (including AI Breakthroughs) and the deck order. None of the new fields are secret.

