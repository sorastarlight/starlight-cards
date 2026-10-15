# Manual handoff — remaining human / external checks only

Three items require a human or an external account. Everything else in the overhaul verification queue is automated or isolated-local.

## 1. Screen-reader completion

- Checklist: `docs/OVERHAUL_A11Y_SLICE.md` → “Manual screen-reader checklist”
- Journeys: shell skip-link, reveal (daily/gift), modal trap, mobile + reduced motion
- Do not claim WCAG AA from automated scans

## 2. Existing staff UI session

- Use an **already-authorized** owner/admin browser session (or a private gitignored credential file if you supply one). Do **not** promote QA collectors.
- Walk: Admin Hub capability gates → Database Health ops pauses (confirm dialogs) → release stage display → canary cohort list (read-only)
- Keep production `ops_release_stage` at **stable** unless intentionally enabling canary for a real cohort
- Do not toggle global production pauses solely for evidence

## 3. Safely linked QA Twitch live retry

- Requires a QA collector with Twitch already linked (current QA A/B have **0** links)
- Retry a failed/stale EventSub delivery via Twitch admin; confirm Worker **1.1.5** `ignored` / success path without granting unintended viewer rewards
- Keep pending until that link exists

## Out of scope for this handoff

Automated deny matrices, isolated canary allow/deny/disable, local `pg_dump`/`pg_restore`, JSON backup shape restore, Auth/Storage **documentation** (Auth/Storage restore itself was **not** executed).
