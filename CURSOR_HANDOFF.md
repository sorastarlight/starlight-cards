# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue this existing project from this Games folder path (same pattern as PokemonRPG under `Stream Assets\Games`). This directory is the git clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live site: `https://cards.sorastarlight.net/`.

Canonical guidance: `AGENTS.md`. Active milestone: **V1.0 — Foundation**, plus the collector overhaul roadmap (reward integrity → shared UX → reveal fanfare → collection → admin/Twitch → a11y/perf).

## Completed (reward integrity — opening recovery)

- Migration `20261014080000_daily_booster_opening_recovery` **applied to production** (schema + RPC overloads). Live mode left at **unlimited**.
- Client: request UUID before open, recover-by-id, View latest, PGRST202-only legacy fallback (`docs/js/daily-booster-rpc-errors.js`).
- Isolated Postgres suite PASS; two-session concurrency PASS (same claimId, one grant, replay on loser).
- Docs: `docs/DAILY_OPENING_RECOVERY.md`. Local runner: `scripts/run-opening-recovery-local.mjs`.

## Current task

1. Commit/push opening-recovery client + migration files; verify GitHub Pages assets.
2. Controlled QA smoke on live Daily Pack (unlimited open → lost-response replay path / View latest; no mode change).
3. Continue overhaul roadmap slice 2: shared experience and navigation polish.

## Validation evidence

- `npm run check`: 214 pass (pre-push).
- Local DB: `starlight_test.run_opening_recovery_suite: PASS`.
- Concurrency: session_a grant + session_b `idempotentReplay`, shared claim_id.
- Production: both `open_daily_booster` overloads; anon EXECUTE false; `get_my_daily_booster_opening` present.

## Unresolved / watch

- Historical unlimited openings before migration still unrecoverable.
- Supabase paid branch (~$0.013/hr) not used; local Postgres used instead.
- Do not install `starlight_test` on production.
- Shell iframe readiness already shipped (prior commits).

## Repository map

| Path | Role |
| --- | --- |
| `docs/` | Production website / GitHub Pages root |
| `docs/js/reward-reveal.js` | Canonical pack/reveal presentation engine |
| `supabase/migrations/` | Forward-only schema/policy migrations |
| `scripts/`, `tests/` | Validation harness + isolated SQL suites |
