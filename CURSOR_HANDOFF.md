# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue this existing project from this Games folder path (same pattern as PokemonRPG under `Stream Assets\Games`). This directory is the git clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live site: `https://cards.sorastarlight.net/`.

Canonical guidance: `AGENTS.md`. Active milestone: **V1.0 — Foundation**, plus the collector overhaul roadmap (reward integrity → shared UX → reveal fanfare → collection → admin/Twitch → a11y/perf).

## Completed

### Reward integrity — opening recovery
- Migration `20261014080000` **on production**; mode still **unlimited**.
- Client recovery `df258b2`. Isolated DB + two-session concurrency PASS.
- Docs: `docs/DAILY_OPENING_RECOVERY.md`.

### Shared experience — home featured sets
- `8c66c6b` live.

### Pack opening fanfare
- Reveal `v1.5.19` live: Reveal All/Skip + Sound mute (`c555138`, `b3b8695`).
- Entry cache-busts: `daily-booster-page.js?v=1.7.1` **live verified**.

### Collection / progression
- Set “X of Y collected” summaries + duplicates exchangeable-copy copy (`e582162`) **live**.
- Favorites-only filter bugfix (`isFavorite` passed into shared filters).
- Economy audit: `convert_selected_duplicates_to_star_bits` uses `greatest(quantity - 1, 0)` — one copy always protected. No odds/monetization changes.

### Twitch worker hardening
- Worker **v1.1.2 deployed** to Cloudflare (`starlight-twitch-integration`): ±10m timestamp check, signature helper, revocation → `twitch_integration_config.eventsub_status`.
- Health: `https://starlight-twitch-integration.fetkun.workers.dev/health` → `ok`, `1.1.2`.
- Admin Twitch pills: show worker version + “Revoked / Sync again” (pending Pages).

### Deploy hygiene
- Pages `build_type=workflow`; concurrency queues deploys.

## Current task

Continue a11y/perf (keyboard/zoom/slow-network spot checks), Twitch durable retry/reconciliation if gaps remain, binder/grid usability polish. Authenticated Daily Pack smoke still needs QA credentials.

## Validation evidence

- Commits: `df258b2`, `8c66c6b`, `c555138`, `b3b8695`, `e582162`, `4eee61e` (+ pending admin Twitch UI).
- Live: reveal `1.5.19`, daily page `1.7.1`, card-filter `formatSetProgressExplanation`.
- Worker live `1.1.2`.
- `npm run check`: 222 pass (pre-admin-UI commit).
- Production daily mode unchanged.

## Unresolved / watch

- Authenticated live Daily Pack smoke blocked without QA account credentials.
- Historical unlimited openings before migration still unrecoverable.
- Do not install `starlight_test` on production.
- Overhaul **not complete**: remaining binder UX polish, Twitch retry/reconciliation depth, full a11y/perf matrix.

## Repository map

| Path | Role |
| --- | --- |
| `docs/` | Production website / GitHub Pages root |
| `docs/js/reward-reveal.js` | Canonical pack/reveal presentation engine |
| `cloudflare-worker/` | Twitch EventSub / OAuth worker |
| `supabase/migrations/` | Forward-only schema/policy migrations |
| `scripts/`, `tests/` | Validation harness + isolated SQL suites |
