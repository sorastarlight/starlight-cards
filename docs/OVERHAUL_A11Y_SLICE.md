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
| Screen-reader full journey | **Unavailable** | No VoiceOver/NVDA/JAWS session in this environment; do not claim AA |

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
