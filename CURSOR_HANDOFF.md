# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue this existing project from this Games folder path (same pattern as PokemonRPG under `Stream Assets\Games`). This directory is the git clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live site: `https://cards.sorastarlight.net/`.

The older Codex/Documents clone and the prior `StarlightCards` folder name are historical. Prefer this `S:\...\StarlightCard Site` workspace for new work.

## Product

Starlight Card Binder is a collector web app (GitHub Pages site + Supabase). Treat it as a product: shared systems, accessibility, and regression prevention over one-off page patches.

Active milestone: **V1.0 — Foundation** (design tokens, shared modals, unified reveal engine, booster validation, cleanup). Do not pull V1.1+ collector/Twitch/social features unless the user reprioritizes.

Canonical guidance: `AGENTS.md`.

## Repository map

| Path | Role |
| --- | --- |
| `docs/` | Production website / GitHub Pages root |
| `docs/css/`, `docs/js/` | Shared styles and ES modules |
| `docs/js/reward-reveal.js` | Canonical pack/reveal presentation engine |
| `supabase/migrations/` | Forward-only schema/policy migrations |
| `scripts/`, `tests/` | Dependency-free validation harness |
| `legacy-v79.9/`, `docs.zip` | Historical reference only |

Local checks (no install required for the root harness):

- `npm run check` — full static/config/test suite
- `npm test` — Node tests
- `npm run validate:boosters` — booster config validation

Serve `docs/` over HTTP for visual checks; do not rely on `file://` alone.

## Working agreement

- Edit in this local clone; do not use GitHub’s cloud UI as the primary editor.
- Stay on `main` unless the user asks for a branch/PR.
- Commit and push when a task is complete (project always-commit-push rule), unless the user says otherwise.
- Never force-push, amend published history, or commit secrets / service-role keys.
- Do not run production Supabase migrations or destructive data ops without explicit approval.
- Preserve unrelated user changes; keep slices small and testable.

## Recent masthead note (context)

Top nav layout: logo + Collectible Card Hub ribbon on the left; primary links packed toward the right; hamburger (when collapsed) beside an icon-only profile control. Account dropdown includes View My Profile, Profile Settings, Notifications, and Sound effects. Prefer packing nav against the profile without forcing the profile flush to the viewport edge (avoids horizontal scroll).

## Next recommended slices

1. Continue V1.0 foundation: shared components / modal migration / reveal adapters as prioritized in `AGENTS.md`.
2. Spot-check binder masthead at 1920×1080 and narrower widths after chrome CSS changes.
3. Keep Navigation Studio / shell-navigation defaults aligned when changing account or top-bar items.

## Verification and limitations

This workspace was seeded by cloning `origin/main` into the Games path. Node modules are not required for the root harness. Production Supabase and live collector data are external — treat them carefully.
