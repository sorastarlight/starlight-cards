# Overhaul performance slice — lab baselines

Date: 2026-10-15. Tool: Lighthouse 13.5 (lab). **Not field p75 Core Web Vitals.**

## Lab method

- Desktop: `--preset=desktop`
- Mobile: default Lighthouse mobile (slow-4G CPU/network throttle)
- URLs: `binder?view=home`, gallery (`binder`), `binder?view=collection`, `binder?view=daily`
- Raw JSON: `.local-review/perf/*.json` (gitignored); summary regenerated locally

## Baseline (before CLS fix)

| Page | Form | Score | FCP ms | LCP ms | TBT ms | CLS | SI ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| home | desktop | 0.80 | 470 | 675 | 0 | **0.369** | 1548 |
| home | mobile | 0.42 | 2830 | 14444 | 7 | **0.476** | 8878 |
| gallery | desktop | 0.93 | 529 | 1596 | 0 | 0.001 | 1245 |
| gallery | mobile | 0.66 | 2613 | 12975 | 0 | 0 | 6069 |
| collection | desktop | 0.91 | 493 | 697 | 0 | 0.161 | 1689 |
| collection | mobile | 0.65 | 2806 | 9160 | 6 | 0 | 6290 |
| daily (reveal entry) | desktop | 0.98 | 467 | 670 | 0 | 0.026 | 1451 |
| daily (reveal entry) | mobile | 0.62 | 2854 | 17013 | 1 | 0 | 9471 |

Notes:

- Mobile LCP is dominated by Lighthouse slow-4G + large Supabase/site images; treat as lab stress, not field truth.
- Home CLS was the clear evidenced layout defect (empty hero track + featured grid swap).

## Fixes shipped this slice

1. Hero placeholder slide + viewport `min-height` (reserve space before spotlight JS)
2. Featured-set skeleton cards with reserved grid min-height
3. First featured pack image: `fetchpriority=high`, `loading=eager`, explicit width/height

## Reveal animation frames

- Not measured in Lighthouse navigation. Reveal uses CSS animations + reduced-motion path; frame-time profiling remains a follow-up when a signed-in pack open can be automated without awarding unintended inventory.

## Field p75

Insufficient production RUM traffic wired here. Lack of field data is a **reporting limitation**, not a stop. Revisit when CrUX/RUM is available.
