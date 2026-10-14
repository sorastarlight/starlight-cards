# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue this existing project from this Games folder path (same pattern as PokemonRPG under `Stream Assets\Games`). This directory is the git clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live site: `https://cards.sorastarlight.net/`.

Canonical guidance: `AGENTS.md`. Active milestone: **V1.0 — Foundation**, plus the collector overhaul roadmap (reward integrity → shared UX → reveal fanfare → collection → admin/Twitch → a11y/perf).

## Completed

### Reward integrity — opening recovery
- Migration `20261014080000_daily_booster_opening_recovery` **applied to production**. Live mode left at **unlimited**.
- Client recovery deployed (`df258b2`). Isolated Postgres + two-session concurrency PASS.
- Docs: `docs/DAILY_OPENING_RECOVERY.md`.

### Shared experience — home featured sets
- Home **Featured sets** strip (`8c66c6b`), verified live.

### Pack opening — Reveal All / Skip + sound mute
- `v1.5.18` Reveal All/Skip (`c555138`); `v1.5.19` Sound/Muted toggle (`b3b8695`).
- **Live verified:** `reward-reveal.js` serves `1.5.19` with `skipToResults` + `st-r3-sound`.

### Collection — progress copy + favorites filter fix
- Set progress summaries + duplicates exchangeable-copy explanation (`e582162`).
- `app.js` passes `isFavorite` into shared `filterCardList`.
- Reveal entry HTML cache-busts bumped (deploy in progress / verify after Pages finishes).

### Deploy hygiene
- Pages `build_type=workflow` (Actions-only). Workflow concurrency queues instead of cancelling mid-deploy.

### Twitch EventSub hardening (code ready; worker deploy pending)
- Timestamp freshness (±10m) + shared signature helper + revocation persists `eventsub_status` (`cloudflare-worker` v1.1.2).
- Tests: `tests/twitch-eventsub-verify.test.mjs`.

## Current task

1. Confirm Pages deploy of `e582162` (daily-booster `v=1.7.1`).
2. Deploy Cloudflare Twitch worker v1.1.2 when Wrangler credentials available.
3. Continue collection usability / a11y; Twitch durable retry/reconciliation next.
4. Authenticated Daily Pack smoke still needs QA credentials.

## Validation evidence

- Commits: `df258b2`, `8c66c6b`, `c555138`, `b3b8695`, `e582162` (+ pending Twitch worker commit).
- Live reveal `1.5.19` confirmed.
- `npm run check`: 222 pass.
- Production daily mode unchanged (unlimited).

## Unresolved / watch

- Authenticated live Daily Pack smoke blocked without QA account credentials.
- Historical unlimited openings before migration still unrecoverable.
- Do not install `starlight_test` on production.
- Worker changes are not live until Cloudflare deploy.

## Repository map

| Path | Role |
| --- | --- |
| `docs/` | Production website / GitHub Pages root |
| `docs/js/reward-reveal.js` | Canonical pack/reveal presentation engine |
| `cloudflare-worker/` | Twitch EventSub / OAuth worker |
| `supabase/migrations/` | Forward-only schema/policy migrations |
| `scripts/`, `tests/` | Validation harness + isolated SQL suites |
