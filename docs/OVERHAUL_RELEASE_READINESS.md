# Overhaul release readiness — evidence

Date: 2026-10-15 (updated). Milestone: V1.0 foundation / audit release readiness.

## Buckets

| Item | Implemented | Validated | Unverified |
| --- | --- | --- | --- |
| Compat matrix (FE / Worker / DB) | Yes | Documented below | — |
| Ops pause rollback (isolated) | Yes | Local integrity suite + prior prod settings restore | Prod UI toggle (avoid for evidence) |
| Backup restore disposable Postgres | Yes | `starlight_backup_restore_qa` via `qa-backup-restore-local.mjs` | Auth/Storage/full pg_dump |
| Staged exposure (server-gated) | Yes | Isolated canary allow/deny/disable; prod collectors `allowed:false` | Approved prod cohort member while stage=canary |

## Compatibility matrix

| Layer | Current pin | Compatible with | Rollback |
| --- | --- | --- | --- |
| Frontend | shell **94.5.10** / binder **1.8.17** | Worker ≥ **1.1.5**; DB through `ops_canary_cohort_gates` | Revert Pages commit |
| Twitch Worker | **1.1.5** | Twitch grant RPCs with `ignored` | Redeploy prior Worker |
| Database | through `20261015020017_ops_canary_cohort_gates` | Frontend canary + ops controls | Prefer forward-fix; set stage `stable` / disable feature flags |

## Genuine staged feature exposure

Unreleased behavior: `gallery_density_preview` via `get_canary_feature`.

Server gates (all required):
1. `ops_release_stage.stage = canary`
2. `ops_canary_features.<feature>.enabled = true`
3. Caller in `ops_release_cohort` **or** `site_roles.role in (owner, admin)`

Disable without code rollback:
- Set stage to `stable`, **or**
- Set feature `enabled` to `false`

Client banner alone is **not** sufficient; UI mounts the canary panel only when the RPC returns `allowed:true`.

## Backup restore coverage

Validated against disposable local DB `starlight_backup_restore_qa` (PostgreSQL 17 on localhost):

- Covered: JSON shape, table DDL, row load, join queries, select grants on `restore.*`
- Not covered: Supabase Auth, Storage bytes/policies, Edge/Worker secrets, full production `pg_dump`

Evidence: `.local-review/backup-restore-local-evidence.json`

## Explicitly blocked

- QA-linked Twitch EventSub live retry
- Production canary positive path (needs approved cohort membership; keep stage stable until intentional)
- Staff browser UI for Health/canary controls (no staff QA credentials)
