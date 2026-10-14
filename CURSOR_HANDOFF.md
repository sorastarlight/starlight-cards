# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue from this Games folder clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live: `https://cards.sorastarlight.net/`. Canonical: `AGENTS.md`.

## Live verified (2026-10-14)

| Asset | Live value |
| --- | --- |
| `reward-reveal.js` | **1.5.21** (Skip/Sound/reduced-motion + premium art fallback + contrast CSS) |
| `daily-booster-page.js` | **1.7.3** |
| `app-shell.js` | **1.8.13** (`defaultShellView` → Card Gallery) |
| `cloud-collection.js` / `app.js` | **1.4.4** / **1.9.25** |
| `card-tile.js` | **1.0.1** (`galleryCardAriaLabel`) |
| `starlight-perspective-card.js` | **1.0.1** (`bindImageFallback`) |
| `card-filters.css` | **1.1.5** (sticky + contrast/`focus-visible`) |
| `shared-ui.css` | **1.6.25** (`prefers-contrast` / `forced-colors`) |
| Twitch worker `/health` | **1.1.3** ok |
| `admin-twitch-page.js` | **1.4.2** |

Deployed commit includes `db9ed4d`. Production daily mode still **unlimited**. Opening recovery migration applied earlier.

### A11y / perf evidence

- Zoom ~200% (640×480 @ 2×): binder filters wrap; set progress readable.
- Broken art: missing URL recovers to card back (`fallbackApplied=true`) — local browser.
- Slow network (~50 KB/s, 800 ms RTT): gallery DCL ~1.7 s; filters + grid usable.
- Synthetic 400-tile markup+mount ~10 ms; live catalog still small (~12 unique / 24 shown).

## Completed this overhaul push

1. Reward integrity — recovery + isolated DB/concurrency.
2. Home featured sets.
3. Reveal fanfare — Reveal All/Skip, mute, reduced-motion.
4. Collection — set progress, favorites filter, duplicate copy protection; Star Bits keeps one copy.
5. Twitch — timestamp freshness, revocation, failed-event resume + admin Retry; worker 1.1.3.
6. Deploy — Pages Actions-only; Node 22 + deploy-pages v5.
7. A11y/perf — uncollected aria, zoom, art fallback, contrast/forced-colors, slow-network + large-grid stress.

## Current task / blockers

- Authenticated Daily Pack open/replay smoke (**needs QA credentials** — do not invent access).
- Optional deeper Twitch reconciliation UI beyond admin Retry.
- Overhaul **not complete** while authenticated reward smoke remains unverified.

## Notes

- `binder.html` defaults to Card Gallery; `?view=` still overrides.
- Uncollected gallery cards announce `View uncollected card NNN`.
- Do not install `starlight_test` on production.
