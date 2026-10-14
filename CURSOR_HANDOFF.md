# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue from this Games folder clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live: `https://cards.sorastarlight.net/`. Canonical: `AGENTS.md`.

Active milestone: **V1.0 — Foundation** + collector overhaul roadmap.

## Completed

### 1. Reward integrity
- Opening recovery migration on prod; unlimited mode unchanged.
- Client UUID recovery live; isolated DB + concurrency PASS.

### 2–3. Shared UX + pack fanfare
- Home featured sets live.
- Reveal **v1.5.20**: Reveal All/Skip, sound mute, reduced-motion focus/auto-skip (`8b0b116`).
- Daily entry `daily-booster-page.js?v=1.7.2` (deploy with latest Pages).

### 4. Collection / progression
- Set progress text + duplicates exchangeable-copy explanation.
- Favorites-only filter fix.
- Binder series **progress meter** (`65628d5`).
- Star Bits conversion keeps one copy (`greatest(quantity-1,0)`).

### 5. Admin / Twitch
- Worker **v1.1.3** live: timestamp freshness, revocation status, failed-event resume, `/admin/events/retry`.
- Admin health: worker version, revoked pill, Retry on failed history.

### Deploy
- Pages Actions-only; queued concurrency. Worker via Wrangler.

## Current task

Continue a11y/perf matrix (zoom, contrast, slow network, failed assets, large collections) and remaining binder/grid polish. Authenticated Daily Pack smoke needs QA credentials.

## Validation

- Recent commits: `e582162`, `4eee61e`, `230801d`, `a33d14e`, `8b0b116`, `65628d5`.
- Worker `/health` → `1.1.3`.
- `npm run check`: 223 pass.
- Overhaul **not complete**.

## Blocked / watch

- QA credentials for authenticated live open/replay smoke.
- Pre-migration unlimited openings unrecoverable.
- No `starlight_test` on production.
