# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue from this Games folder clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live: `https://cards.sorastarlight.net/`. Canonical: `AGENTS.md`.

## Live verified (2026-10-14)

| Asset | Live value |
| --- | --- |
| `reward-reveal.js` | **1.5.20** (Skip, Sound, prefersReducedMotion) |
| `daily-booster-page.js` | **1.7.2** |
| Binder filters | summary + set progress meter (Rising Star: “0 of 12 collected…”) **browser-verified** |
| `card-filters.css?v=1.1.4` | sticky mobile + binder summary |
| Twitch worker `/health` | **1.1.3** ok |
| `admin-twitch-page.js` | **1.4.2** |

Production daily mode still **unlimited**. Opening recovery migration applied earlier.

## Completed this overhaul push

1. Reward integrity — recovery + isolated DB/concurrency.
2. Home featured sets.
3. Reveal fanfare — Reveal All/Skip, mute, reduced-motion.
4. Collection — set progress (binder panel fixed in `d22834f`), favorites filter, duplicate copy protection messaging; Star Bits keeps one copy.
5. Twitch — timestamp freshness, revocation, failed-event resume + admin Retry; worker 1.1.3.
6. Deploy — Pages Actions-only; Node 22 + deploy-pages v5; sticky filters.

## Current task

- Full a11y/perf matrix remainder: zoom/contrast, slow-network, large-collection stress.
- Authenticated Daily Pack open/replay smoke (**needs QA credentials**).
- Optional deeper Twitch reconciliation UI.

## Notes

- `binder.html` without `?view=` defaults shell to **home**; use `binder.html?view=binder` for Card Gallery.
- Pages `Deploy to GitHub Pages` can take several minutes; do not mark in-flight deployments inactive.
- Do not install `starlight_test` on production.
- Overhaul **not complete**.
