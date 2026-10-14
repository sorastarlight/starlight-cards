# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue this existing project from this Games folder path (same pattern as PokemonRPG under `Stream Assets\Games`). This directory is the git clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live site: `https://cards.sorastarlight.net/`.

Canonical guidance: `AGENTS.md`. Active milestone: **V1.0 — Foundation**, plus the collector overhaul roadmap (reward integrity → shared UX → reveal fanfare → collection → admin/Twitch → a11y/perf).

## Completed (this session)

### Reward integrity
- Opening recovery migration + client live; mode **unlimited** unchanged.
- Isolated DB suite + concurrency PASS earlier.

### Shared UX / home
- Featured sets live.

### Pack opening
- Reveal **v1.5.19** live: Reveal All/Skip + Sound mute.
- `daily-booster-page.js?v=1.7.1` live.

### Collection
- Set progress summaries + duplicates exchangeable-copy explanation live.
- Favorites-only filter fixed (`isFavorite` wiring).
- Star Bits conversion audited: `greatest(quantity - 1, 0)` keeps one copy.

### Twitch
- Worker **v1.1.3 live** (`/health` ok): timestamp freshness, revocation status, failed-event resume on redelivery, `/admin/events/retry`.
- Admin pills: worker version + Revoked label + Retry on failed history (`a33d14e`).

### Deploy
- Pages Actions-only; deploy queueing. Worker via Wrangler.

## Current task

Continue **a11y/perf matrix** (keyboard, zoom, reduced-motion spot checks, slow network / failed assets, large collections) and remaining binder/grid usability. Twitch reconciliation dashboards can deepen later.

**Blocked:** authenticated Daily Pack open/replay smoke needs QA account credentials.

## Validation evidence

- Commits on `main` include `e582162`, `4eee61e`, `230801d`, `a33d14e`.
- Live site: reveal `1.5.19`, daily `1.7.1`, set-progress helpers.
- Worker health: `version":"1.1.3"`.
- `npm run check` was green (222+) before final Twitch retry commit; targeted tests PASS after.

## Unresolved / watch

- QA credentials for authenticated live smoke.
- Historical unlimited openings pre-migration unrecoverable.
- Do not install `starlight_test` on production.
- Overhaul **not complete** while a11y/perf + deeper binder polish remain.

## Repository map

| Path | Role |
| --- | --- |
| `docs/` | GitHub Pages site root |
| `docs/js/reward-reveal.js` | Canonical reveal engine |
| `cloudflare-worker/` | Twitch EventSub worker |
| `supabase/migrations/` | Forward-only migrations |
| `scripts/`, `tests/` | Validation harness |
