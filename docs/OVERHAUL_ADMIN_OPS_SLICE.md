# Overhaul admin ops slice — evidence

Date: 2026-10-15 (updated).

## Buckets

| Criterion | Implemented | Validated | Unverified |
| --- | --- | --- | --- |
| Role-scoped hub access | Yes | Source + capability map | Staff browser gate walk |
| Safe pack/content editing + odds validation | Yes | Booster validator tests | Staff save walk |
| Bulk-action confirmation | Yes | Twitch/daily confirm code | Staff browser |
| Audit history | Yes | Audit writes for pause/stage/cohort | Staff audit page view |
| Operational pauses | Yes | Isolated pause guards; prod deny on `admin_get_ops_pauses` for QA collectors | Staff UI (do not toggle prod for evidence) |
| Canary cohort admin list | Yes | RPC + Health read-only list | Staff browser |

## Migrations / versions

- `20261015015020_ops_pause_controls`
- `20261015015155_ops_release_stage`
- `20261015020017_ops_canary_cohort_gates`
- Health UI **1.2.1**

## Staff identity fact

Production `site_roles`: owner×1, admin×1. QA A/B are collectors. **Remaining access requirement for staff UI validation:** an authorized QA staff login (password/session) without promoting existing QA collectors.
