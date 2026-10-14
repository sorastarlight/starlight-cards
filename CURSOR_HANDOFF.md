# StarlightCard Site — Cursor handoff

Project: `S:\NewVTuberProject\Stream Assets\Games\StarlightCard Site`

## Start here

Continue from this Games folder clone of `https://github.com/sorastarlight/starlight-cards.git` on `main`. Live: `https://cards.sorastarlight.net/`. Canonical: `AGENTS.md`.

**Repository identity:** GitHub remote is **`sorastarlight/starlight-cards`** (repo id `1298841027` / `R_kgDOTWq9ww`). Earlier audit notes that used `starlight-card-binder` refer to the same product; the binder name redirects to / was renamed to **starlight-cards**. Prefer `starlight-cards` in all new links and handoffs.

Original overhaul plan: Codex audit `card-site-audit.md` (2026-10-13) — keep foundation; incremental Phase 0–6 delivery; prioritize card-focused presentation and a coherent collector journey over new feature surfaces.

## Live verified (2026-10-14)

| Asset / check | Live / evidence value |
| --- | --- |
| Checkout (pre-progression slice) | **`5fced1e`** — collector-loop / reveal CTA |
| Progression clarity slice | Shared `docs/js/progression-clarity.js` on My Collection, Star Bits, Season Pass — `npm run check` **234/234** pending Pages deploy |
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
| QA A Daily **View latest pack** | Pass — 4 cards titled “Cards already received today”, each “Already received” |
| Account switch A → B | Pass — B daily has no View CTA / 0 reward cards; collection **0 / 24** |
| Switch back B → A | Pass — A collection **7 Unique / 8 Copies**, series progress visible |
| Shell Sign Out control | Was missing from default account menu on live; restored in this slice (defaults + sanitize inject) |
| Safe QA-linked Worker EventSub retry | **Pending external** — QA A/B have **0** Twitch links |

### Progression clarity (this slice; local + `npm run check`)

Rules mirrored from server (no economy value changes):

| System | What collectors see |
| --- | --- |
| Collector XP / level | Lifetime XP from cards earned; rarity rates Common→Legendary **1/2/5/15/50**; next level milestone + next avatar-frame unlock; never reduced by Star Bits conversion |
| Star Bits | Spendable balance; convert extras only (one copy protected); spend in Card Shop; missions/gifts/season can grant |
| Season Pass | Separate season points with soft-capped sources; Twitch subscriber eligibility; countdown/expiry; next claimable or locked tier |

Signed-out: Collection shows “Sign in to track level progress”; Star Bits keeps clarity + sign-in status; Season Pass shows clarity + eligibility + Sign In (no raw RPC permission text).

### A11y / perf evidence

- Zoom ~200%: filters wrap; set progress readable.
- Broken art → card back (local).
- Slow network (~50 KB/s): gallery usable (~1.7 s DCL).
- Synthetic 400-tile render ~10 ms.
- Progression surfaces spot-checked at ~390px width; Star Bits clarity links have `:focus-visible` styles.

## Completed this overhaul push

1. Reward integrity — recovery + isolated DB/concurrency + live UUID open/replay + owner isolation + browser View recovery.
2. Home featured sets.
3. Reveal fanfare — Reveal All/Skip, mute, reduced-motion, **View Collection** results CTA (1.5.22).
4. Collection — set progress, favorites, copy protection.
5. Twitch — EventSub harden + admin reconciliation + grant RPC permission harden.
6. Deploy hygiene + a11y/perf matrix.
7. Navigation — drop duplicate Card Series → Gallery; top-bar **My Binder**; restore **Sign Out** in account menu.
8. Progression clarity — XP vs Star Bits vs season copy beside totals/actions; next milestones; signed-out states.

## Remaining overhaul (product experience)

Reliability for daily open/replay and Twitch client denial is done. Still unfinished vs audit:

- Post-reveal per-card favorite (results CTA navigates to collection; inline favorite still open).
- Admin/Twitch ops — Worker live retry once a safe QA-linked event exists (**still pending external**).
- Optional: Sign Out chrome discoverability; iframe a11y tree still exposes native gallery under embeds.
- Signed-in visual QA of progression milestones on live after Pages deploy (local signed-out + unit coverage done).

## Notes

- Do not install `starlight_test` on production.
- Do not rewrite previously applied migrations.
- Economic changes, destructive ops, paid resources, and expanded permissions stay out of scope unless newly authorized.
