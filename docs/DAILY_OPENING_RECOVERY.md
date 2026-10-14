# Free Daily / unlimited opening recovery

**Status:** migration applied to production; client shipping with request-UUID recovery.  
Historical unlimited openings (pre-migration, no claim row) **cannot be reconstructed.**

## Production evidence

| Check | Result |
| --- | --- |
| Isolated suite (`starlight_test.run_opening_recovery_suite`) | PASS on local Postgres fixture |
| Two-session concurrency (same owner+request UUID) | PASS — one claim id, one inventory grant, loser `idempotentReplay` |
| Production overloads | `open_daily_booster()` + `open_daily_booster(uuid)` both present |
| Anon EXECUTE | revoked on both; authenticated granted |
| `get_my_daily_booster_opening` | present |
| Live `free_daily` mode | unchanged (`unlimited` at apply time) |
| `starlight_test` on production | **not** installed |

Local re-run: `node scripts/run-opening-recovery-local.mjs` (requires local PostgreSQL).

## Design (summary)

1. Client UUID persisted per owner before open.
2. Server `UNIQUE (user_id, request_id)`; advisory xact locks for concurrent same-request / daily slot.
3. Lost response → `get_my_daily_booster_opening` or idempotent open(same id); never new UUID; never zero-arg after ambiguous timeout.
4. View latest pack uses `latestOpening` (`claimed_at DESC, id DESC`) only.
5. Daily once/ET day via partial unique `WHERE mode = 'daily'`.
6. Unlimited rows do not block a later daily claim after mode change.
7. Replay returns original opening across midnight/mode change.
8. Streak uses `EXISTS(claim_date)` (no day inflation); XP from real grants; feed one post per opening.

## Rollback

New forward migration restoring prior RPC bodies only. Keep rows + partial uniques. Do **not** restore old `UNIQUE(user_id, claim_date)` while unlimited multi-open rows exist.
