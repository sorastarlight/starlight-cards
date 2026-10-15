# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue from this Games folder clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live: `https://cards.sorastarlight.net/`. Canonical: `AGENTS.md`.

**Repository identity:** `sorastarlight/starlight-cards` (repo id `1298841027`). Earlier audit used `starlight-card-binder` (same product after rename).

Original audit: `C:\Users\FET\Documents\Codex\2026-10-13\referenced-chatgpt-conversation-this-is-an\outputs\card-site-audit.md` (2026-10-13).

## Overhaul status (honest)

Required slices 1–5 are implemented with evidence. Remaining items below are **blocked** (external access) or **optional backlog** — not silent skips of required work.

### 1. Security / reward integrity — done

- Evidence: `docs/OVERHAUL_SECURITY_SLICE.md`
- Privileged RPC matrix pass; legacy import trust; Twitch eligibility locks; admin NULL role-gate fix
- Worker **1.1.5**

### 2. Accessibility / journey parity — done with blocked SR

- Evidence: `docs/OVERHAUL_A11Y_SLICE.md`
- Skip link, lightbox Tab trap, reduced-motion/zoom/mobile checks recorded
- **Still required when tooling available:** full screen-reader journey pass (not claimed WCAG AA)

### 3. Performance lab baselines — done

- Evidence: `docs/OVERHAUL_PERF_SLICE.md`
- Lab ≠ field p75 (traffic limitation, not a stop)

### 4. Admin ops — done

- Evidence: `docs/OVERHAUL_ADMIN_OPS_SLICE.md`
- Hub capability gates; Twitch/daily confirms; odds validation retained; ops pauses + audit; Health UI

### 5. Release readiness — done with blocked disposable restore

- Evidence: `docs/OVERHAUL_RELEASE_READINESS.md`
- Compat matrix; pause rollback rehearsal; staged `stable`/`canary`; backup shape script
- **Blocked:** full backup restore onto a disposable Supabase project (needs disposable target + staff export)

### Externally blocked (required when access arrives)

- Safe QA-linked Worker EventSub **live retry** (QA A/B have **0** Twitch links)
- Staff-positive browser pause toggles (needs owner/admin browser session)
- Screen-reader full journeys
- Disposable-project backup restore drill

### Optional backlog

- Wishlists / chosen collecting goals / recent-pulls strip
- Non-iframe shell pilot; full design-token migration; legacy CSS consolidation
- Sign Out discoverability polish; embed a11y tree dual exposure
- Staff-positive live RPC probes (needs staff QA credentials)

## Live verified markers

| Item | Evidence |
| --- | --- |
| Security slice | Worker **1.1.5**; admin NULL gates **0** vulnerable; RPC matrix pass |
| Ops pauses | migrations `20261015015020`, `20261015015155`; features live after toggle rehearsal |
| Release stage | `stable`; staff canary banner only |
| Backup shape | `node scripts/qa-backup-shape.mjs` |
| `npm run check` | run after each ship |

## Notes

- Do not install `starlight_test` on production.
- Do not rewrite previously applied migrations.
- Economic changes, destructive ops, paid resources, expanded permissions, and viewer reward triggers stay out of scope unless newly authorized.
- Never commit `.local-review/` credentials or inject scripts.
