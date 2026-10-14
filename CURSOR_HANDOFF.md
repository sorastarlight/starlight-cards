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
- Entry HTML cache-busts bumped to pull updated reveal imports (pending deploy).

### Collection — progress copy + favorites filter fix
- Shared binder summary includes set “X of Y collected” progress.
- Duplicates tab explains exchangeable copies (one copy stays collected).
- `app.js` now passes `isFavorite` into shared `filterCardList` (favorites-only was silently ignored).

### Deploy hygiene
- GitHub Pages `build_type` switched to **workflow** (Actions-only) to stop legacy+Actions dual-deploy races.
- Deploy workflow concurrency set to queue (`cancel-in-progress: false`).

## Current task

Finish deploying cache-bust + collection progress slice; continue collection/binder usability, then admin/Twitch and a11y. Authenticated Daily Pack smoke still needs QA credentials.

## Validation evidence

- Commits: `df258b2`, `8c66c6b`, `c555138`, `b3b8695` (+ pending collection/cache-bust).
- Live reveal `1.5.19` confirmed on cards.sorastarlight.net.
- `npm run check`: 220 pass.
- Production daily mode unchanged (unlimited).

## Unresolved / watch

- Authenticated live Daily Pack smoke blocked without QA account credentials.
- Historical unlimited openings before migration still unrecoverable.
- Do not install `starlight_test` on production.

## Repository map

| Path | Role |
| --- | --- |
| `docs/` | Production website / GitHub Pages root |
| `docs/js/reward-reveal.js` | Canonical pack/reveal presentation engine |
| `supabase/migrations/` | Forward-only schema/policy migrations |
| `scripts/`, `tests/` | Validation harness + isolated SQL suites |
