# Overhaul accessibility slice — evidence

Date: 2026-10-15. Does **not** claim WCAG 2.2 AA conformance.

## Acceptance tracked

| Check | Result | Evidence |
| --- | --- | --- |
| Reveal entry points on canonical engine | Pass (source) | `tests/reward-reveal.test.mjs` — daily, shop, received, redeem → `reward-reveal.js?v=1.5.23` |
| Reveal keyboard / focus restore / Escape | Pass (source + prior QA) | Focus restore + Escape handlers in `reward-reveal.js`; unit contract tests |
| Shared modal focus trap | Pass (source) | `shared-ui.js` Tab cycle + Escape; shop/admin adoptModal |
| PNG lightbox focus trap | Fixed this slice | Tab cycle + Escape/arrows; focus restore on close (`card-png-lightbox.js` **1.0.4**) |
| Skip link (bypass blocks) | Fixed this slice | `binder.html` → `#main-content`; `.shell-skip-link` in `app-shell.css` **1.6.42** |
| Reduced motion reveal path | Pass (source) | Reveal All surfaced under `prefers-reduced-motion`; unit tests |
| Mobile layout (390×844) | Pass (lab) | Live binder: no horizontal overflow (`scrollW===clientW`) |
| 200% zoom / reflow | Pass (lab spot) | Emulated **640×900** viewport (≈200% of 1280-wide layout): binder `scrollWidth===clientWidth`, no overflowing chrome. Note: CSS `zoom:200%` inflated `scrollWidth` without element overflow and was treated as a false positive. |
| Screen-reader full journey | **Unavailable** | Manual checklist below; do not claim AA |
| Skip-link keyboard activation (lab) | Pass (2026-10-15) | Local `docs/` serve: focus skip → activate → `#main-content` is activeElement (`tabindex="-1"`) |
| Admin Health status live region | Fixed | `role="status"` on `#status`; ops panels use `aria-labelledby` (unit-tested) |

## Explicitly unavailable manual checks

- Full screen-reader completion of reveal (pack → pile → cards → results → Done) with spoken name/rarity
- Full modal keyboard matrix on every admin dialog
- Firefox/WebKit assistive-tech pass
- Contrast audit with a calibrated meter beyond existing high-contrast CSS rules

## Defects fixed this slice

1. Missing skip link on application shell
2. PNG lightbox lacked Tab focus trapping while `aria-modal="true"`

## Remaining required a11y work

- Staff/manual SR pass on reveal + shop purchase confirm (external tooling)
- Re-run signed-in mobile reveal keyboard path with QA session in browser automation

## Manual screen-reader checklist (required; tooling unavailable here)

Environment note (2026-10-15): Windows Narrator binary exists; NVDA/JAWS/VoiceOver automation is not available in this agent session. Do **not** claim WCAG AA from this checklist alone.

### Setup
1. Use NVDA (Windows) or VoiceOver (macOS) with Chromium on `docs/` over HTTP (not `file://`).
2. Sign in with a disposable QA collector.
3. Enable “speak focus / browse mode” defaults; keep screen magnification off for the first pass.

### Journey A — Shell + skip link
1. Land on Card Gallery shell. Confirm page title spoken.
2. Tab until “Skip to main content”; Activate; confirm focus moves into main landmark.
3. Open account menu with keyboard; Escape closes and restores focus.

### Journey B — Reveal (Daily or Received Gift)
1. Open a pack with keyboard (Enter on pack CTA).
2. Confirm reveal dialog/region announces title; Tab stays inside until Done/Escape.
3. Advance pile/cards with keyboard; hear name + rarity (or equivalent text alternative).
4. Finish → results; focus returns to the launching control.

### Journey C — Modal trap (Shop confirm or Admin confirm)
1. Open a confirm modal; confirm initial focus in dialog.
2. Tab cycles only dialog controls; Escape closes; focus restores.

### Journey D — Mobile + reduced motion
1. 390-wide viewport: no off-screen focus traps.
2. `prefers-reduced-motion: reduce`: reveal still completable via Reveal All / Skip without granting inventory client-side.

Record pass/fail per step with SR product + browser version.
