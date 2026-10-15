# Overhaul admin ops slice — evidence

Date: 2026-10-15. Milestone: V1.0 foundation / audit admin operations.

## Acceptance

| Criterion | Result |
| --- | --- |
| Role-scoped hub access | Pass — hub gates expanded for UI/website/news/notifications/codes/gifts/boosters/quests/roles/users/moderation/audit/twitch/health using `get_my_staff_access` capabilities |
| Safe pack/content editing | Pass — existing booster editor still blocks on odds/id/mode validation via `validateBooster` before save |
| Odds validation | Pass — blocking errors prevent save; empty-pool warnings remain advisory while editing |
| Bulk-action confirmation | Pass — Twitch master toggle, enable-all, disable-all, and Daily Pack availability save require `StarlightUI.confirm` |
| Audit history | Pass — Staff Audit Log page retained; ops pause/release stage writes `staff_audit_log` (`ops_pause_set`, `ops_release_stage_set`) |
| Operational pause controls | Pass — `ops_feature_shop_purchases`, `ops_feature_conversions`, `ops_feature_trades` with RPC guards + admin Health UI |

## Migrations / versions

- `20261015015020_ops_pause_controls`
- `20261015015155_ops_release_stage`
- Frontend: admin health **1.2.0**, hub **2.0.1**, boosters page **1.9.1**, twitch page **1.4.4**, shell **1.8.16** / build **94.5.9**

## Validation

- All four collector RPCs contain `ops_assert_feature` guards
- Default feature flags enabled (`true`) after reversible pause toggle rehearsal
- Release stage default `stable`; Worker minimum pinned `1.1.5`
- No inventory deletions; no payout formula changes

## Explicitly blocked

- Staff-positive browser exercise of Health pause toggles (requires owner/admin session in browser)
- Live Twitch EventSub retry on QA-linked accounts (external)
