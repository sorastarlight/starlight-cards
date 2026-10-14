-- Reconciled with production apply order (do not edit applied prod history).
-- Source content from 20261014080000 monolith, split to match:
--   20261014152518 schema, 20261014152704 helpers/status, 20261014152749 open RPCs
--
-- Server-backed Free Daily / unlimited opening recovery.
-- Does NOT reconstruct historical unlimited openings that never wrote a claim row
-- (cannot be reconstructed).
-- Rollback: restore prior RPC bodies only. Do NOT drop rows or restore the old
-- UNIQUE(user_id, claim_date) while unlimited multi-open rows exist.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
alter table public.daily_booster_claims
  add column if not exists mode text not null default 'daily';

alter table public.daily_booster_claims
  add column if not exists request_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_booster_claims_mode_check'
      and conrelid = 'public.daily_booster_claims'::regclass
  ) then
    alter table public.daily_booster_claims
      add constraint daily_booster_claims_mode_check
      check (mode in ('daily', 'unlimited'));
  end if;
end $$;

-- Existing rows are once-per-day daily claims.
update public.daily_booster_claims
set mode = 'daily'
where mode is distinct from 'daily' and mode is distinct from 'unlimited';

alter table public.daily_booster_claims
  drop constraint if exists daily_booster_claims_user_id_claim_date_key;

drop index if exists public.daily_booster_claims_user_id_claim_date_key;

-- Daily mode remains one opening per user per America/New_York calendar day.
-- Unlimited rows (mode <> 'daily') do not participate â€” they cannot block a daily claim.
create unique index if not exists daily_booster_claims_one_daily_per_day
  on public.daily_booster_claims (user_id, claim_date)
  where mode = 'daily';

-- Client request UUID is unique per owner (idempotent open / lost-response recovery).
create unique index if not exists daily_booster_claims_user_request_id
  on public.daily_booster_claims (user_id, request_id)
  where request_id is not null;

-- Deterministic "latest opening" ordering.
create index if not exists daily_booster_claims_user_claimed_at_id_idx
  on public.daily_booster_claims (user_id, claimed_at desc, id desc);

comment on column public.daily_booster_claims.request_id is
  'Client-generated opening request UUID. Unique per user when present. Historical unlimited opens before this migration have no recoverable request_id or claim row.';

comment on column public.daily_booster_claims.mode is
  'daily = once per ET day; unlimited = many openings per day, each with its own request_id. Unlimited rows do not satisfy the daily unique index.';

