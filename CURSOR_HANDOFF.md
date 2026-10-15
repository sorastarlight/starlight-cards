# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue from this Games folder clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live: `https://cards.sorastarlight.net/`. Canonical: `AGENTS.md`.

**Repository identity:** `sorastarlight/starlight-cards` (repo id `1298841027`).

Original audit: `C:\Users\FET\Documents\Codex\2026-10-13\referenced-chatgpt-conversation-this-is-an\outputs\card-site-audit.md` (2026-10-13).

## Status model (use these three buckets)

| Bucket | Meaning |
| --- | --- |
| **Implemented** | Code/migrations shipped |
| **Validated** | Exercised with evidence this session (or prior recorded evidence) |
| **Unverified** | Still required; not optional because hard |

Do not collapse “implemented” into “validated.”

---

## 1. Security / reward integrity

| Item | Implemented | Validated | Unverified |
| --- | --- | --- | --- |
| Legacy import restrictions | Yes — `import_legacy_collection`; anon EXECUTE revoked; XP skip | Yes — prod grants (`anon_import=false`, `import_skips_xp=true`); QA matrix deny (400/401) | Successful one-shot import on disposable account (not run; mutates inventory) |
| Twitch eligibility concurrency | Yes — advisory lock + `ignored` in apply/deliver; Worker **1.1.5** | Yes — prod function body checks; authenticated EXECUTE false on grant RPCs | Live EventSub retry with QA-linked Twitch |
| Admin NULL role gate | Yes — `coalesce(actor_role,'')` | Yes — `still_vulnerable_null_gates=0`; collectors denied admin RPCs | Staff-positive browser session |
| Ops pause guards | Yes — shop/conversions/trades | Yes — isolated local suite pause/resume; **prod pauses not toggled** | Staff UI pause click on production |
| Privileged deny matrix | Yes — `scripts/qa-privileged-rpc-matrix.mjs` | Yes — overallPass true (incl. ops pauses + canary deny) | Staff-positive matrix rows |

Evidence: `docs/OVERHAUL_SECURITY_SLICE.md`, `.local-review/privileged-rpc-matrix-evidence.json`, `.local-review/ops-integrity-local-evidence.json`

---

## 2. Accessibility

| Item | Implemented | Validated | Unverified |
| --- | --- | --- | --- |
| Skip link, lightbox trap, reveal contracts | Yes | Source/unit + prior lab | — |
| Reduced motion / mobile / 200% zoom spot | Yes | Lab notes in a11y slice | Full matrix every page |
| Screen-reader journeys | Checklist only | Tooling unavailable (Narrator present; no NVDA/automation harness) | Full SR pass — see checklist in `docs/OVERHAUL_A11Y_SLICE.md` |

---

## 3. Performance

| Item | Implemented | Validated | Unverified |
| --- | --- | --- | --- |
| Lab baselines home/gallery/collection/reveal | Yes | Lighthouse lab files under `.local-review/perf/` | Field p75 (insufficient traffic) |

---

## 4. Admin ops

| Item | Implemented | Validated | Unverified |
| --- | --- | --- | --- |
| Hub capability gates | Yes | Source review | Staff browser gate walk |
| Bulk/daily confirms | Yes | Source review | Staff browser confirms |
| Odds validation | Yes | Existing booster validator tests | — |
| Audit history | Yes | RPCs write audit for pause/cohort/stage | Staff UI log view |
| Ops pause UI | Yes — Health page | Isolated SQL; deny probes | Staff browser toggles (avoid prod global toggles for evidence) |

Evidence: `docs/OVERHAUL_ADMIN_OPS_SLICE.md`

**Staff access fact:** production has **2** staff rows (`owner`×1, `admin`×1). QA A/B are collectors only. No staff QA identity in `.local-review`. **Remaining access requirement:** credentials (or approved temporary staff role) for an authorized QA staff account — do not promote collectors without approval.

---

## 5. Release readiness / staged exposure

| Item | Implemented | Validated | Unverified |
| --- | --- | --- | --- |
| Staff canary banner | Yes | Source | Staff browser while stage=canary |
| **Server-gated canary feature** | Yes — `get_canary_feature` + `ops_release_cohort` + feature flags | Yes — isolated allow/deny/disable; prod collectors get `allowed:false` under stable | Live canary cohort member on production (would require approved cohort add) |
| Disable path | Yes — stage→stable or `feature.enabled=false` | Yes — isolated suite | — |
| Backup restore (Postgres JSON) | Yes — `scripts/qa-backup-restore-local.mjs` → DB `starlight_backup_restore_qa` | Yes — shape + load + joins | Auth/Storage/full pg_dump restore |
| Compat matrix | Yes | Documented | — |

Evidence: `docs/OVERHAUL_RELEASE_READINESS.md`, `.local-review/backup-restore-local-evidence.json`

Migrations: `20261015015020` pauses, `20261015015155` stage, `20261015020017` canary cohort gates.

---

## Externally blocked (required)

1. QA-linked Twitch EventSub **live retry**
2. Screen-reader full journeys (manual checklist ready)
3. Staff-positive UI exercise (needs staff QA credentials — **not** expanding QA A/B)
4. Production canary cohort positive path (needs approved cohort membership; keep stage stable until intentionally enabled)

## Optional backlog

- Wishlists / collecting goals / recent-pulls
- Non-iframe shell pilot; design-token / legacy CSS consolidation
- Sign Out discoverability; embed a11y dual exposure

## Notes

- Do not install `starlight_test` / integrity fixtures on production.
- Do not rewrite applied migrations.
- Do not toggle production global pauses solely for evidence.
- Never commit `.local-review/` credentials.
