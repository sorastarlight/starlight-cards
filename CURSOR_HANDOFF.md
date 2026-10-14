# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue from this Games folder clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live: `https://cards.sorastarlight.net/`. Canonical: `AGENTS.md`.

## Live verified (2026-10-14)

| Asset | Live value |
| --- | --- |
| `reward-reveal.js` | **1.5.20** (Skip, Sound, prefersReducedMotion) |
| `daily-booster-page.js` | **1.7.2** |
| `card-filters.css?v=1.1.3` | set progress meter + sticky mobile filters |
| `app.js` | `updateSetProgressMeter` present |
| `admin-twitch-page.js` | **1.4.2** |
| Twitch worker `/health` | **1.1.3** ok |

Production daily mode still **unlimited**. Opening recovery migration applied earlier.

## Completed this overhaul push

1. **Reward integrity** — recovery shipped + isolated DB/concurrency.
2. **Home** — featured sets.
3. **Reveal fanfare** — Reveal All/Skip, mute, reduced-motion path.
4. **Collection** — set progress copy + meter, favorites filter fix, duplicate protection messaging; Star Bits keeps one copy.
5. **Twitch** — timestamp freshness, revocation, failed-event resume + admin Retry.
6. **Deploy** — Pages Actions-only; cancel stuck deploys when concurrency blocks.

## Current task

- Broader a11y/perf matrix: zoom/contrast spot-check, slow-network, large-collection stress, authenticated Daily Pack smoke.
- Deeper Twitch reconciliation dashboards optional.
- Avoid inactivating in-flight Pages deployments (that cancels `deploy-pages`).

**Blocked:** QA credentials for authenticated live open/replay.

## Notes

- Rapid pushes cancel *pending* concurrency peers (GitHub behavior); latest successful deploy includes prior file changes.
- Do not install `starlight_test` on production.
- Overhaul **not complete**.
