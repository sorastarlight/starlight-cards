# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue from this Games folder clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live: `https://cards.sorastarlight.net/`. Canonical: `AGENTS.md`.

**Repository identity:** `sorastarlight/starlight-cards` (repo id `1298841027`). Earlier audit used `starlight-card-binder` (same product after rename).

Original audit: `C:\Users\FET\Documents\Codex\2026-10-13\referenced-chatgpt-conversation-this-is-an\outputs\card-site-audit.md` (2026-10-13).

## Overhaul status (honest)

**Not complete as a full Phase 0–6 audit delivery.** Security/reward-integrity slice landed; accessibility, performance lab baselines, remaining admin ops, and staged release readiness are still required.

### Security slice (required — done)

- Privileged RPC matrix: `scripts/qa-privileged-rpc-matrix.mjs` → `.local-review/privileged-rpc-matrix-evidence.json` **pass**
- Legacy import trust + Twitch eligibility migrations + Worker **1.1.5**
- Admin NULL role-gate fix (`20261015013346`) — collectors could previously pass `actor_role NOT IN` when role was NULL
- Evidence: `docs/OVERHAUL_SECURITY_SLICE.md`

### Externally blocked

- Safe QA-linked Worker EventSub retry — QA A/B have **0** Twitch links; do not trigger viewer rewards.

### A11y slice (required — partial)

- Skip link + PNG lightbox Tab trap shipped; evidence `docs/OVERHAUL_A11Y_SLICE.md`
- **Not** WCAG AA: screen-reader full journeys still unavailable in this environment

### Still required (not optional)

- Screen-reader manual pass when tooling available (still required; not optional)
- Lab performance baselines (home/gallery/collection/reveal)
- Admin ops completion against audit (roles, odds, bulk confirm, audit, pause)
- Release readiness (compat matrix, rollback/backup rehearsal, staged mechanism)

### Optional backlog

- Wishlists / chosen collecting goals / recent-pulls strip
- Non-iframe shell pilot; full design-token migration; legacy CSS consolidation
- Sign Out discoverability polish; embed a11y tree dual exposure
- Staff-positive live RPC probes (needs staff QA credentials)

## Live verified markers

| Item | Evidence |
| --- | --- |
| Security slice | Worker **1.1.5**; admin NULL gates **0** vulnerable; RPC matrix pass |
| Daily safe DOM | `1c28b25`; daily **1.7.6** |
| Reveal favorites | `59181c3`; reveal **1.5.23** |
| Progression | `18d5c32`; QA A wallet match |
| `npm run check` | run after each ship |

## Notes

- Do not install `starlight_test` on production.
- Do not rewrite previously applied migrations.
- Economic changes, destructive ops, paid resources, expanded permissions, and viewer reward triggers stay out of scope unless newly authorized.
- Never commit `.local-review/` credentials or inject scripts.
