# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue from this Games folder clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live: `https://cards.sorastarlight.net/`. Canonical: `AGENTS.md`.

**Repository identity:** `sorastarlight/starlight-cards` (repo id `1298841027`). Earlier audit used `starlight-card-binder` (same product after rename).

Original audit: `C:\Users\FET\Documents\Codex\2026-10-13\referenced-chatgpt-conversation-this-is-an\outputs\card-site-audit.md` (2026-10-13).

## Overhaul status (honest)

**Not complete as a full Phase 0–6 audit delivery.** Authorized collector-integrity and UX slices shipped and are live. Gaps remain in measured performance, full accessibility, admin workflows, staged rollout, and externally blocked Worker live retry.

Latest required fix: daily pull-list safe DOM (`1c28b25`, `daily-booster-page.js` **1.7.6**) — removes catalog-field `innerHTML` interpolation called out in the audit. Pages deploy success: https://github.com/sorastarlight/starlight-cards/actions/runs/38663720493

### Externally blocked

- Safe QA-linked Worker EventSub retry — QA A/B have **0** Twitch links; do not trigger viewer rewards.

### Optional backlog (not release blockers for this overhaul)

- Wishlists / chosen collecting goals / recent-pulls strip
- Non-iframe shell pilot; full design-token migration; legacy CSS consolidation
- Full WCAG 2.2 AA / screen-reader matrix; Core Web Vitals baseline
- Full privileged-RPC role matrix beyond anon revoke + Twitch grant denial
- Kill switches, formal canary/cohort rollout, backup restore rehearsal
- Sign Out discoverability polish; embed a11y tree dual exposure

## Live verified markers

| Item | Evidence |
| --- | --- |
| HEAD daily safe DOM | `1c28b25` Pages success; daily **1.7.6** |
| Reveal favorites | `59181c3`; reveal **1.5.23** |
| Progression | `18d5c32`; QA A UI matched wallet XP 63 / bits 0 / season ended |
| Twitch worker health | **1.1.4**; admin Twitch UI **1.4.3** |
| `npm run check` | **237/237** |

## Notes

- Do not install `starlight_test` on production.
- Do not rewrite previously applied migrations.
- Economic changes, destructive ops, paid resources, expanded permissions, and viewer reward triggers stay out of scope unless newly authorized.
- Never commit `.local-review/` credentials or inject scripts.
