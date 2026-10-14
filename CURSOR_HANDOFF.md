# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue from this Games folder clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live: `https://cards.sorastarlight.net/`. Canonical: `AGENTS.md`.

## Live verified (2026-10-14)

| Asset | Live value |
| --- | --- |
| `reward-reveal.js` | **1.5.20** (Skip, Sound, prefersReducedMotion) |
| `daily-booster-page.js` | **1.7.2** |
| `app-shell.js` | **1.8.13** (`defaultShellView` → Card Gallery) |
| `cloud-collection.js` / `app.js` | **1.4.2** / **1.9.23** live; pending **1.4.3** / **1.9.24** + `card-tile` aria fix |
| Binder filters | summary + set progress meter **browser-verified**; **200% zoom** filters wrap, progress readable |
| `card-filters.css?v=1.1.4` | sticky mobile + binder summary |
| Twitch worker `/health` | **1.1.3** ok |
| `admin-twitch-page.js` | **1.4.2** |

Production daily mode still **unlimited**. Opening recovery migration applied earlier.

## Completed this overhaul push

1. Reward integrity — recovery + isolated DB/concurrency.
2. Home featured sets.
3. Reveal fanfare — Reveal All/Skip, mute, reduced-motion.
4. Collection — set progress, favorites filter, duplicate copy protection messaging; Star Bits keeps one copy.
5. Twitch — timestamp freshness, revocation, failed-event resume + admin Retry; worker 1.1.3.
6. Deploy — Pages Actions-only; Node 22 + deploy-pages v5; sticky filters.
7. A11y — gallery uncollected aria via shared `card-tile` + `galleryCardAriaLabel`; binder default view; zoom 200% filter usability.

## Current task

- Finish a11y/perf matrix: contrast, slow-network, large-collection stress; verify live `card-tile` 1.0.1 / app 1.9.24.
- Authenticated Daily Pack open/replay smoke (**needs QA credentials**).
- Optional deeper Twitch reconciliation UI.

## Notes

- `binder.html` defaults to Card Gallery; `?view=` still overrides.
- Uncollected gallery cards keep ??? visuals but announce collector numbers to AT (`View uncollected card NNN`) via `card-tile.js` (not only legacy path).
- Pages deploy can take several minutes; do not mark in-flight deployments inactive.
- Do not install `starlight_test` on production.
- Overhaul **not complete**.
