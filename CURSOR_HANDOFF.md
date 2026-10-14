# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue this existing project from this Games folder path (same pattern as PokemonRPG under `Stream Assets\Games`). This directory is the git clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live site: `https://cards.sorastarlight.net/`.

Canonical guidance: `AGENTS.md`. Active milestone: **V1.0 — Foundation**, plus the collector overhaul roadmap (reward integrity → shared UX → reveal fanfare → collection → admin/Twitch → a11y/perf).

## Completed

### Reward integrity — opening recovery
- Migration `20261014080000_daily_booster_opening_recovery` **applied to production** (schema + RPC overloads). Live mode left at **unlimited**.
- Client request-UUID recovery deployed (`df258b2`). Live `daily-booster-page.js?v=1.7.0` + recovery modules verified on Pages.
- Isolated Postgres suite PASS; two-session concurrency PASS.
- Docs: `docs/DAILY_OPENING_RECOVERY.md`. Runner: `scripts/run-opening-recovery-local.mjs`.

### Shared experience — home featured sets
- Home **Featured sets** strip uses live card catalog (`8c66c6b`). Verified live: `homeFeaturedSets` + `home-featured-sets.js` on Pages.

### Pack opening — Reveal All / Skip + sound mute
- Reveal engine `v1.5.18` (`c555138`): presentation-only **Reveal All** / **Skip to results**.
- Reveal engine `v1.5.19`: in-reveal **Sound/Muted** toggle persists via existing SFX localStorage key; muting stops active audio only (no inventory side effects).

## Current task

Verify Pages serves `reward-reveal.js?v=1.5.19`. Continue slice 3 reduced-motion / rarity restraint spot-check, then slice 4 collection/progression. Authenticated Daily Pack smoke still needs QA credentials.

## Validation evidence

- Commits: `df258b2` recovery, `8c66c6b` home, `c555138` Reveal All/Skip, pending sound mute.
- `npm run check`: 218 pass.
- Local DB suite + concurrency PASS; production mode unchanged at unlimited.

## Unresolved / watch

- Authenticated live Daily Pack smoke blocked without QA account credentials.
- Historical unlimited openings before migration still unrecoverable.
- Do not install `starlight_test` on production.
- Paid Supabase branch (~$0.013/hr) unused (local Postgres instead).

## Repository map

| Path | Role |
| --- | --- |
| `docs/` | Production website / GitHub Pages root |
| `docs/js/reward-reveal.js` | Canonical pack/reveal presentation engine |
| `supabase/migrations/` | Forward-only schema/policy migrations |
| `scripts/`, `tests/` | Validation harness + isolated SQL suites |
