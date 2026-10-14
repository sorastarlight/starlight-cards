# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue from this Games folder clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live: `https://cards.sorastarlight.net/`. Canonical: `AGENTS.md`.

## Live verified (2026-10-14)

| Asset | Live value |
| --- | --- |
| `reward-reveal.js` | **1.5.21** |
| `daily-booster-page.js` | **1.7.3** |
| `app-shell.js` | **1.8.13** (Card Gallery default) |
| `cloud-collection.js` / `app.js` | **1.4.4** / **1.9.25** |
| `card-tile.js` | **1.0.1** — live aria `View uncollected card NNN` |
| `starlight-perspective-card.js` | **1.0.1** art fallback |
| `card-filters.css` / `shared-ui.css` | **1.1.5** / **1.6.25** contrast + focus |
| Twitch worker `/health` | **1.1.3** ok |
| `admin-twitch-page.js` | pending **1.4.3** (pipeline diag, grant notes, received retry, health detail) |

Production daily mode still **unlimited**. Opening recovery migration applied earlier.

### A11y / perf evidence

- Zoom ~200%: filters wrap; set progress readable.
- Broken art → card back (local).
- Slow network (~50 KB/s): gallery usable (~1.7 s DCL).
- Synthetic 400-tile render ~10 ms.

## Completed this overhaul push

1. Reward integrity — recovery + isolated DB/concurrency.
2. Home featured sets.
3. Reveal fanfare — Reveal All/Skip, mute, reduced-motion.
4. Collection — set progress, favorites, copy protection.
5. Twitch — EventSub harden + admin reconciliation visibility (1.4.3).
6. Deploy hygiene + a11y/perf matrix (zoom, contrast, fallbacks, slow-net).

## Blocker (overhaul not complete)

**Authenticated Daily Pack open/replay smoke needs QA credentials.** No secrets/credentials are in agent stores. Provide a dedicated QA account (or test JWT flow) to finish live reward-integrity smoke. Do not invent access.

Optional later: Helix subscription inventory vs rules (M/L).

## Notes

- Do not install `starlight_test` on production.
- Overhaul **not complete** until authenticated Daily Pack smoke passes.
