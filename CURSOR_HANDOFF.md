# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`  
Live: `https://cards.sorastarlight.net/` · Repo: `sorastarlight/starlight-cards` · Canonical: `AGENTS.md`

## Status buckets

| Bucket | Meaning |
| --- | --- |
| **Implemented** | Shipped code/migrations/docs |
| **Validated** | Exercised with evidence |
| **Unverified** | Still required (human/external) |

Manual-only remaining checks: **`docs/MANUAL_HANDOFF_REMAINING.md`**.

## Completed / validated (do not re-litigate unless new defect)

| Area | Evidence |
| --- | --- |
| Security denials (QA collectors) | `.local-review/privileged-rpc-matrix-evidence.json` |
| Pause/canary/admin role success (isolated) | `.local-review/ops-integrity-local-evidence.json` — prod pauses **not** toggled; stage left **stable** |
| Server-gated canary (not banner-only) | migration `20261015020017`; `get_canary_feature` |
| JSON catalog backup shape + row load | `qa-backup-restore-local.mjs` |
| Genuine `pg_dump`/`pg_restore` (functions, grants, RLS, constraints, triggers, data, post-restore canary/admin) | `.local-review/pg-dump-restore-local-evidence.json` |
| Auth/Storage recovery | Documented only — `docs/OVERHAUL_AUTH_STORAGE_RECOVERY.md` (**not executed**) |
| Lab perf / a11y automation | `docs/OVERHAUL_PERF_SLICE.md`, `docs/OVERHAUL_A11Y_SLICE.md` |

## Remaining manual (required)

1. Screen-reader journeys  
2. Staff UI on an existing authorized session  
3. QA-linked Twitch live retry  

## Notes

- Do not promote QA accounts or ask for staff passwords in chat.  
- Do not install `starlight_test` / roundtrip fixtures on production.  
- Optional backlog: wishlists, non-iframe shell, design-token consolidation, Sign Out polish.
