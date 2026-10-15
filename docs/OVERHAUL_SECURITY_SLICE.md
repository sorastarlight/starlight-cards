# Overhaul security slice — evidence

Date: 2026-10-15. Milestone: V1.0 foundation / audit Phase 1 integrity.

## Acceptance

| Criterion | Result |
| --- | --- |
| Privileged RPC role matrix (anon + QA collectors) | Pass — `.local-review/privileged-rpc-matrix-evidence.json` `overallPass: true` |
| Legacy import trust | Pass — anon EXECUTE revoked; one import/user; no Collector XP on import |
| Twitch cooldown/max_claims concurrency | Pass — DB advisory lock + ignored reasons in `apply_twitch_reward_v890` / `deliver_twitch_season_unlock_v1`; Worker **1.1.5** honors `ignored` |
| Admin NULL role gate | Pass — `actor_role NOT IN` failed open on NULL; rewritten to `coalesce(actor_role,'') NOT IN`; 0 remaining vulnerable admin_* defs |
| Inventory/economy rules unchanged | Pass — no deletions; no payout formula changes |

## Commits / versions

- Migrations: `20261015012911` (placeholder), `20261015013132` (apply), `20261015013157` (deliver), `20261015013211` (import body), `20261015013346` (NULL role gate)
- Worker: **1.1.5** deployed (`starlight-twitch-integration`)

## Buckets (2026-10-15 refresh)

| Control | Implemented | Validated | Unverified |
| --- | --- | --- | --- |
| Privileged deny matrix | Yes | QA A/B + anon pass (incl. ops pauses, canary deny) | Staff-positive rows |
| Legacy import | Yes | Grants + deny probes | Successful import mutation on disposable account |
| Twitch eligibility locks | Yes | Body checks + EXECUTE denials | Live EventSub retry |
| Admin NULL gate | Yes | 0 vulnerable defs + collector denials | Staff browser |
| Pause guards | Yes | Isolated suite (no prod toggle) | Staff UI |

## Explicitly blocked / incomplete

- Safe QA-linked Twitch EventSub **live retry** (no Twitch links on QA A/B)
- Staff-positive (moderator/admin/owner) live probes — no staff QA credentials; covered by function-body checks + isolated SQL suite (`scripts/qa-ops-integrity-local.mjs`)
- service_role positive grant path not invoked from browser matrix (Worker-only)

## Production verification (read-only / QA deny)

- `anon_import=false`, `import_skips_xp=true`, `apply_claim=true`, `deliver_claim=true`, `auth_apply=false`
- `still_vulnerable` admin NULL gates = **0**
- QA matrix: all listed admin probes denied for collectors; Twitch grant RPCs 403
