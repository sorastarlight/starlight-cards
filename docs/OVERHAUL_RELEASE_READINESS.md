# Overhaul release readiness — evidence

Date: 2026-10-15. Milestone: V1.0 foundation / audit release readiness.

## Acceptance

| Criterion | Result |
| --- | --- |
| Frontend / Worker / database compatibility matrix | Pass — see matrix below |
| Rollback tested in isolation | Pass — ops pause disable/enable rehearsal restored all features to live; Git/Worker rollback procedure documented |
| Backup recovery on disposable target | Partial pass — backup **shape** validated from `admin_export_database_backup_v902` + local fixture script; full restore onto a disposable Supabase project/branch is **blocked** without a disposable project and staff export session |
| Staged-release mechanism | Pass — `ops_release_stage` (`stable`/`canary`) + staff-only canary banner; collectors keep stable reward path |

## Compatibility matrix

| Layer | Current pin | Compatible with | Rollback |
| --- | --- | --- | --- |
| Frontend (GitHub Pages `docs/`) | shell build **94.5.9** / binder shell **1.8.16** | Worker ≥ **1.1.5**; DB migrations through `ops_release_stage` | Revert `main` commit / Pages publish to prior SHA |
| Twitch Worker | **1.1.5** (`starlight-twitch-integration`) | DB Twitch grant RPCs with `ignored` eligibility; frontend Twitch admin **1.4.4+** | Redeploy prior Worker version via Wrangler |
| Database | migrations through `20261015015155_ops_release_stage` | Frontend ops controls + public release stage RPC | Prefer forward-fix; pause features via `admin_set_ops_pause` rather than dropping migrations |

Reward rules and economy formulas are unchanged by pause/canary controls.

## Isolated rollback rehearsal

1. Set `ops_feature_shop_purchases` → `false`; confirmed `ops_feature_enabled` = false.
2. Restored → `true`; confirmed shop/conversions/trades all live and release stage `stable`.
3. No inventory rows deleted; no wallet balances mutated by the rehearsal.

Git/Worker rollback remains a deploy action (not executed against live Pages/Worker in this slice beyond the documented pins).

## Backup recovery (disposable)

- Export RPC format: `starlight-database-backup-v90.2` (see `scripts/qa-backup-shape.mjs`).
- Local fixture validation: `node scripts/qa-backup-shape.mjs`.
- **Blocked for full restore:** no disposable Supabase project/branch credentials in this environment; production restore is out of scope. Staff can download via Admin → Database Health, then restore only onto an approved disposable target.

## Staged release

- Setting key: `ops_release_stage` (`stable` | `canary`)
- Admin UI: Database Health → Release stage (confirm + audit log)
- Staff shell banner via `docs/js/release-channel.js` when canary
- Collectors: no reward-path fork

## Explicitly blocked

- Disposable-project restore drill (needs disposable Supabase target + staff-authenticated backup download)
- QA-linked Twitch live EventSub retry (external)
- Field p75 performance (insufficient traffic; lab baselines already recorded)
