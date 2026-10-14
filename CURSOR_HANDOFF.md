# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue from this Games folder clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live: `https://cards.sorastarlight.net/`. Canonical: `AGENTS.md`.

## Live verified (2026-10-14)

| Asset | Live value |
| --- | --- |
| `reward-reveal.js` | **1.5.20** live; pending **1.5.21** (premium art fallback + contrast CSS) |
| `daily-booster-page.js` | **1.7.2** live; pending **1.7.3** |
| `app-shell.js` | **1.8.13** (`defaultShellView` → Card Gallery) **live** |
| `cloud-collection.js` / `app.js` | **1.4.3** / **1.9.24** live or pending **1.4.4** / **1.9.25** |
| `card-tile.js` | **1.0.1** (`galleryCardAriaLabel`) |
| Binder filters | set progress + **200% zoom** usable; pending contrast/`focus-visible` in `card-filters` **1.1.5** |
| Twitch worker `/health` | **1.1.3** ok |
| `admin-twitch-page.js` | **1.4.2** |

Production daily mode still **unlimited**. Opening recovery migration applied earlier.

## Completed this overhaul push

1. Reward integrity — recovery + isolated DB/concurrency.
2. Home featured sets.
3. Reveal fanfare — Reveal All/Skip, mute, reduced-motion.
4. Collection — set progress, favorites filter, duplicate copy protection; Star Bits keeps one copy.
5. Twitch — timestamp freshness, revocation, failed-event resume + admin Retry; worker 1.1.3.
6. Deploy — Pages Actions-only; Node 22 + deploy-pages v5.
7. A11y — gallery uncollected aria via shared `card-tile`; binder default view; zoom 200%; art fallback on perspective/reveal/lightbox; `prefers-contrast` / `forced-colors` on shared UI + filters + reveal chrome.

## Current task

- Verify live deploy for art-fallback + contrast slice; slow-network / large-collection stress.
- Authenticated Daily Pack open/replay smoke (**needs QA credentials**).
- Optional deeper Twitch reconciliation UI.

## Notes

- `binder.html` defaults to Card Gallery; `?view=` still overrides.
- Uncollected gallery cards announce `View uncollected card NNN` via `card-tile.js`.
- Broken card art falls back to `StarlightCard_Back_NewLogo.png` (markup `onerror` + `bindImageFallback`).
- Do not install `starlight_test` on production.
- Overhaul **not complete**.
