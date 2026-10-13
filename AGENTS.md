# Starlight Card Binder — Codex Guide

## Product direction

Starlight Card Binder is a collector-focused web application. Treat it as a product, not a collection of one-off pages. Prefer shared systems, predictable behavior, accessibility, and regression prevention over page-specific patches.

The active milestone is **V1.0 — Foundation**. Unless the user explicitly changes the priority, finish foundation work before starting new collector, Twitch, or social features.

## Working agreement

- Preferred local home: `S:\NewVTuberProject\Stream Assets\Games\StarlightCards` (Games folder setup, same pattern as PokemonRPG). Start from `CURSOR_HANDOFF.md` when orienting a new chat.
- Work in this local clone. The live site is not edited directly in GitHub's cloud UI.
- Use the currently checked-out branch, normally `main`. Do not create a branch, worktree, fork, or pull request unless the user explicitly asks for one.
- Commit and push when a task is complete unless the user says otherwise.
- Before editing, inspect the current files and preserve unrelated user changes.
- Organize work by milestone and a small, testable vertical slice. State the active milestone and acceptance criteria when beginning substantial work.
- Do not combine a broad refactor with unrelated feature work.
- Favor incremental migrations with compatibility adapters over a site-wide rewrite.
- Prefer complete implementation in the repository over instructions, snippets, or replacement files for the user to apply manually.

## Execution pace and scope

- For routine visual, CSS, wording, and layout changes, work quickly and stay tightly scoped.
- Inspect only the files and dependencies directly relevant to the requested change, then implement it without extended planning or a repository-wide audit.
- Preserve existing functionality and all unrelated user changes. Do not opportunistically reformat, rename, reorganize, or clean up neighboring code.
- Use targeted validation for routine work: review the affected diff, run the narrowest applicable check, and inspect only the changed page or component at the relevant viewport when visual behavior is involved.
- Do not require a full-project analysis or full smoke-test matrix for routine changes.
- Use broader analysis and validation when the work affects Supabase, authentication, purchases, security, user data, or shared application logic. These areas take precedence over the fast path because regressions can affect authorization, persistence, currency, rewards, or multiple product flows.
- Deployment, publishing, commits, pushes, branches, worktrees, forks, and pull requests require explicit user direction. Completing an implementation does not imply permission to perform any of them.

## Repository map

- `docs/` is the production website and GitHub Pages root.
- `docs/*.html` contains user, account, shop, reward, Twitch, trading, and administration pages.
- `docs/css/` contains global and shared styles. `style.css` is an import-only compatibility entry point, `legacy/` contains its ordered legacy layers, and `pages/` contains route-specific styles. `shared-ui.css` and `app-shell.css` contain newer shared layers.
- `docs/js/` contains browser ES modules and shared services. `pages/` contains route entry points. Keep data access in service modules and reusable UI behavior in focused UI modules.
- `docs/js/reward-reveal.js` is the canonical reveal engine. Daily Boosters, Shop packs, Twitch rewards, redemption, and Received Gifts must call this engine rather than implement their own reveal sequence.
- `supabase/migrations/` is the canonical, forward-only migration directory. `supabase/seed.sql` contains reproducible configuration data for local resets.
- `docs/supabase/` is the legacy SQL archive and diagnostics collection. Do not add new migrations there or replay the directory wholesale.
- `docs/data/`, `docs/cards/`, `docs/thumbs/`, and `docs/site_assets/` contain production content and artwork.
- `legacy-v79.9/` and `docs.zip` are historical references. Do not modify or use them as production sources unless the user explicitly asks.
- `docs/DEPLOYMENT_NOTES*.md` and version notes document prior releases; they are context, not the architectural source of truth.

The dependency-free root validation harness is declared in `package.json`. Run `npm run check` for the full static/configuration/test suite, `npm test` for the Node tests, and `npm run validate:boosters` for booster configuration validation. The underlying scripts live in `scripts/`, fixtures and tests live in `tests/`, and no dependency install is required.

## Architecture rules

### HTML

- Keep HTML pages thin: semantic structure, page-specific markup, and module entry points only.
- Do not add new inline `<style>` blocks or large inline `<script>` blocks.
- When touching an existing inline block, extract reusable code when it is safe and within task scope.
- Preserve relative URLs that work when `docs/` is served as the site root.
- Use buttons for actions and links for navigation. Preserve keyboard access, visible focus, meaningful labels, and status announcements.

### CSS and design system

- New colors, spacing, radii, shadows, typography, motion, and layering values belong in shared design tokens, not page-local literals.
- Shared components must use one documented class/API contract. Avoid copying a component's rules into another page.
- The V1.0 design system must cover at least buttons, badges, form controls, sliders, cards, panels, empty/loading/error states, and modals.
- Keep page layout rules separate from component rules.
- Preserve the existing Starlight visual identity while reducing duplicate selectors and overrides.
- Support narrow mobile layouts, reduced motion, and sufficient color contrast.

### JavaScript

- Prefer small ES modules with explicit imports and exports.
- Keep DOM rendering, business rules, persistence, and remote data access separate.
- Reuse existing services before adding a new service or duplicating a Supabase query.
- A shared component owns its lifecycle: creation, events, focus, cleanup, and error/empty states.
- Avoid new globals. If compatibility requires one temporarily, document it and keep the module API canonical.
- Escape or safely construct all user-controlled content; do not insert untrusted strings into HTML.

### Modal system

- All new dialogs must use one reusable modal component.
- The component must provide open/close methods, backdrop and Escape handling, initial focus, focus trapping, focus restoration, scroll locking, labelled title/description hooks, stacking behavior, and cleanup.
- Confirmation, informational, form, and media/card views should be variants of the same primitive.
- Migrate existing modals in small page groups and remove old CSS/JavaScript only after each group passes browser validation.

### Reveal and booster systems

- `docs/js/reward-reveal.js` is the single presentation engine for pack artwork, opening animation, card ordering, rarity effects, progress, completion, and cleanup.
- Entry points may adapt their data into a shared reveal payload, but must not fork animation or stacking behavior.
- Keep reward granting and persistence outside the presentation engine. The UI must reveal an already-authorized result and must not independently decide or award inventory.
- Use one normalized card/reward shape. Validate required fields at the boundary and handle missing optional artwork gracefully.
- Booster selection rules, odds validation, reward persistence, and reveal presentation are separate concerns.
- Odds calculations must be deterministic under an injected random source so they can be tested.

### Supabase and sensitive operations

- Treat the production database as external state. Never run migrations, modify production data, or perform destructive operations without explicit user approval.
- Do not edit an already-deployed migration to change history. Add a new ordered migration for schema or policy changes.
- Preserve authentication, staff authorization, row-level security, and server-side validation. A hidden admin control is not authorization.
- Never commit secrets, service-role keys, access tokens, private user data, or local environment files.

## Milestone roadmap

### V1.0 — Foundation (active)

Goal: make the existing product consistent, maintainable, and safe to extend without changing its core feature set.

Deliver in this order:

1. **Baseline and guardrails**
   - Inventory inline CSS/JavaScript, duplicated components, modal implementations, reveal entry points, and booster configuration shapes.
   - Add lightweight automated checks without requiring a framework rewrite.
   - Record a smoke-test matrix for critical user journeys.
2. **Design tokens and primitives**
   - Establish shared tokens and component contracts.
   - Migrate buttons, badges, controls, sliders, cards, panels, and state messages in small cohorts.
3. **Unified modal component**
   - Build the accessible primitive and migrate dialogs page group by page group.
4. **Unified reveal engine**
   - Normalize adapters for Daily Boosters, Shop packs, Twitch rewards, redemption, and Received Gifts.
   - Remove legacy reveal implementations only after behavioral parity is verified.
5. **Booster engine and validation**
   - Define a canonical configuration schema.
   - Validate required fields, rarity names, numeric ranges, duplicate identifiers, referenced card pools, non-empty eligible pools, and odds totals/tolerance.
   - Add deterministic tests for selection boundaries, fallback behavior, and malformed configurations.
6. **Cleanup and performance**
   - Remove proven dead code and duplicate rules.
   - Reduce repeated downloads and unnecessary DOM work.
   - Complete navigation and responsive UI consistency checks.

V1.0 is complete only when all current entry points use the shared systems, automated configuration validation passes, and the critical smoke-test matrix passes on desktop and mobile widths.

### V1.1 — Collector Features

- Better binder experience
- Trading improvements
- Favorites
- Search
- Profiles

### V1.2 — Twitch Integration

- Rewards
- Viewer gifts
- Event history
- Stream overlays

### V2.0 — Social

- Friends
- Public collections
- Trading marketplace
- Collection showcases

Do not pull later-milestone work into V1.0 unless it is required to preserve existing behavior or the user explicitly reprioritizes it.

## Validation expectations

Match validation effort to risk, but do not hand off unverified changes.

For routine visual, CSS, wording, and layout changes:

- Review only the affected diff for unintended edits and stale asset references.
- Run the narrowest relevant syntax, structure, or targeted test command.
- When layout or interaction changes, serve `docs/` locally and inspect the affected page or component at the relevant desktop or mobile width.
- Check the affected page for obvious console errors or failed assets when browser validation is warranted.
- Stop when the requested change is implemented and the targeted checks pass; do not expand into unrelated cleanup or a full-project audit.

For Supabase, authentication, purchases, security, user data, shared application logic, or explicitly requested broad foundation work:

- Review the diff for unintended edits, copied logic, secrets, and stale asset references.
- Check modified JavaScript for syntax errors with an available JavaScript runtime.
- Serve `docs/` through a local HTTP server; do not rely only on opening HTML with a `file://` URL.
- Exercise the changed flow in a real browser at desktop and mobile widths.
- Check the browser console for new errors and failed network requests.
- Verify keyboard interaction, focus behavior, loading/empty/error states, and reduced-motion behavior when relevant.
- Confirm the site still works under its GitHub Pages path and caching model.

Critical smoke journeys for V1.0 are:

- Sign in and sign out
- Navigate through the application shell
- Browse binder and collection views
- Open a Daily Booster
- Purchase and open a Shop pack
- Redeem and reveal a reward
- Claim and reveal a Received Gift or Twitch reward
- Open, operate, and close each migrated modal with keyboard and pointer
- Load staff/admin pages without exposing privileged actions to unauthorized users

For booster configuration validation, the automated command must return a nonzero exit status and a useful message for invalid configuration. Add fixtures for valid, boundary, and invalid cases once the validation harness exists.

If a required validation cannot run because credentials, production data, or tooling are unavailable, say exactly what was checked and what remains for the user to verify.

## Change and release discipline

- Keep commits focused on one milestone slice and use an outcome-based message.
- Update cache-busting query strings consistently when a changed shared asset requires it; do not churn unrelated pages.
- Add concise deployment notes only for a real release or when the user requests them. Include behavior changed, migrations required, validation performed, and rollback concerns.
- Database changes, destructive cleanup, dependency additions, deployment, commits, and pushes require the corresponding user intent or approval.
- End each task with: milestone, files changed, validation performed, known limitations, and the next recommended slice.

## Definition of done

A task is done when its acceptance criteria are met, shared code is used instead of duplicated code, affected user journeys have been validated, no known regression is hidden, and the repository is left in a state the user can safely review and publish.
