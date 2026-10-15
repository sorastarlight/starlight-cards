# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue from this Games folder clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live: `https://cards.sorastarlight.net/`. Canonical: `AGENTS.md`.

**Repository identity:** GitHub remote is **`sorastarlight/starlight-cards`** (repo id `1298841027` / `R_kgDOTWq9ww`). Earlier audit notes that used `starlight-card-binder` refer to the same product; the binder name redirects to / was renamed to **starlight-cards**. Prefer `starlight-cards` in all new links and handoffs.

Original overhaul plan: Codex audit `card-site-audit.md` (2026-10-13) — keep foundation; incremental Phase 0–6 delivery; prioritize card-focused presentation and a coherent collector journey over new feature surfaces.

## Live verified (2026-10-14 / 15)

| Asset / check | Live / evidence value |
| --- | --- |
| Progression clarity (`18d5c32`) | Pages deploy **success**; live cache-busts: dashboard **1.2.0**, star-bits **2.2**, season-pass **2.6**, `progression-clarity.js` present |
| QA A signed-in progression vs server | XP **63** / Lv **2** / **12 XP to Lv. 3** / frame unlock **75 XP** / bits **0** / extras **1** / unique **7** · copies **8** — UI matched |
| QA A season | Locked (no Twitch link); eligibility copy correct; countdown **Ended Sep 30, 2026** |
| Reveal favorites slice | Reveal **1.5.23** + `favorite-service.js` — pending Pages after this push |
| Twitch worker `/health` | **1.1.4** ok |
| `admin-twitch-page.js` | **1.4.3** live |

Production daily mode still **unlimited**. Opening recovery + Twitch grant harden applied earlier.

### Authenticated QA smoke (API; redacted)

Evidence: `.local-review/qa-auth-smoke-evidence.json` (gitignored).

| Check | Result |
| --- | --- |
| Sign-in QA A / B | Pass |
| Controlled UUID open / replay | One claim; replay inventory **+0** |
| Owner isolation | B cannot read A’s opening |
| Twitch grant RPCs (ordinary JWT) | **403 / 42501** |

### Browser scenarios (existing QA opening; no new claims)

| Scenario | Result |
| --- | --- |
| QA A Daily **View latest pack** | Pass — replay; favorites hydrate from `set_card_favorite` / `user_cards` |
| Reveal result favorite toggle | Pass — starred `s01-004`; server `is_favorite=true` |
| Replay after favorite | Pass — star remains pressed; not reset |
| Mobile ~390px results | Pass — star control readable on card art |
| Account B isolation | Pass — no A pull list; B favorites empty; A favorite retained |
| Safe QA-linked Worker EventSub retry | **Pending external** — QA A/B have **0** Twitch links |

### A11y / perf evidence

- Zoom ~200%: filters wrap; set progress readable.
- Broken art → card back (local).
- Slow network (~50 KB/s): gallery usable (~1.7 s DCL).
- Synthetic 400-tile render ~10 ms.
- Reveal result favorites: `aria-pressed`, saving/error labels, `:focus-visible`, retry via re-activate.

## Completed this overhaul push

1. Reward integrity — recovery + isolated DB/concurrency + live UUID open/replay + owner isolation + browser View recovery.
2. Home featured sets.
3. Reveal fanfare — Reveal All/Skip, mute, reduced-motion, **View Collection** results CTA; **per-card favorites on results** (1.5.23).
4. Collection — set progress, favorites, copy protection.
5. Twitch — EventSub harden + admin reconciliation + grant RPC permission harden.
6. Deploy hygiene + a11y/perf matrix.
7. Navigation — drop duplicate Card Series → Gallery; top-bar **My Binder**; restore **Sign Out** in account menu.
8. Progression clarity — XP vs Star Bits vs season copy beside totals/actions; next milestones; signed-out states.
9. Signed-in progression verification against server for QA A (no rule changes needed).

## Remaining overhaul (product experience)

Reliability for daily open/replay and Twitch client denial is done. Still unfinished vs audit:

- Admin/Twitch ops — Worker live retry once a safe QA-linked event exists (**still pending external**).
- Optional: Sign Out chrome discoverability; iframe a11y tree still exposes native gallery under embeds.
- Optional polish only — not release blockers.

## Notes

- Do not install `starlight_test` on production.
- Do not rewrite previously applied migrations.
- Economic changes, destructive ops, paid resources, and expanded permissions stay out of scope unless newly authorized.
- Never commit `.local-review/` QA credentials or temporary inject scripts.
