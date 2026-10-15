# Supabase Auth & Storage recovery (separate from PostgreSQL)

Date: 2026-10-15. This document describes recovery scope. **No Auth/Storage restore was executed in this environment.** Do not treat this procedure as a passed drill.

## What PostgreSQL alone covers

| Asset | In Postgres dump? | Notes |
| --- | --- | --- |
| `public` schema (tables, RPCs, RLS, triggers, grants) | Yes | Covered by `pg_dump` / Admin JSON catalog export (JSON is not a substitute for `pg_dump`) |
| `auth.users` / `auth.identities` / sessions | Partially / platform-managed | Supabase Auth tables live in the Auth service; a DB dump may include `auth` schema rows depending on project backup mode, but password hashes, MFA factors, and GoTrue config are not recovered by app-level JSON backups |
| Storage **object bytes** | No | Files live in the Storage service (S3-compatible). Postgres holds `storage.objects` metadata only |
| Storage bucket policies | Metadata in DB if `storage` schema dumped | Object payloads still missing without Storage restore |
| Edge Function secrets / Worker secrets | No | Outside Postgres |

## What the site’s Admin “Download Backup” covers

`admin_export_database_backup_v902` returns format `starlight-database-backup-v90.2`: catalog content (series, cards, boosters, slots, rates, tags, etc.). It does **not** export Auth users, sessions, Storage files, or full schema DDL.

Validated separately: JSON shape + disposable row-load (`qa-backup-restore-local.mjs`). That is **not** Auth/Storage recovery.

## Auth recovery procedure (manual / platform)

1. Prefer Supabase Dashboard → **Project Settings → Database → Backups** (or PITR if on a plan that includes it) for a point-in-time restore onto a **new / disposable** project — never overwrite production without explicit approval.
2. Confirm Auth providers (email, Twitch OAuth client IDs) and redirect URLs on the restored project.
3. Re-issue or invalidate sessions as needed; JWT secret rotation requires coordinated client updates.
4. Verify a disposable user can sign in and that `auth.uid()`-scoped RPCs succeed.
5. Only then cut DNS / client URL if this was a real DR event.

**Status:** procedure documented; **not executed** here (no disposable Supabase project restore performed).

## Storage recovery procedure (manual / platform)

1. From Supabase Backup / PITR restore of a project that includes Storage, **or** restore objects from an external object-store backup if one exists.
2. Confirm buckets (`site-assets`, etc.), public/private flags, and RLS/storage policies.
3. Spot-check public URLs for card artwork and site assets used by the Binder.
4. If only Postgres metadata was restored, re-upload missing objects from a known-good asset archive (`docs/site_assets`, `docs/cards`, `docs/thumbs` in git are a partial offline source for site-shipped art — not a full Storage substitute for user uploads).

**Status:** procedure documented; **not executed** here.

## Local Postgres round trip (executed)

Disposable local `pg_dump -Fc` → `pg_restore` of an integrity schema (functions, grants, RLS, constraints, triggers, representative rows, post-restore canary/admin behavior):

- Script: `scripts/qa-pg-dump-restore-local.mjs`
- Evidence: `.local-review/pg-dump-restore-local-evidence.json`
- Explicitly **not** a Supabase Auth or Storage recovery drill
