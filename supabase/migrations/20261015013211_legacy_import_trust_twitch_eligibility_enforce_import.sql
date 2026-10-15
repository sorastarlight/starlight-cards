-- Authoritative import trust + XP skip body (production functions verified live).
-- Remote ledger version 20261015013211; rebuilds must run this full SQL.

-- Harden legacy collection import trust and enforce Twitch rule eligibility
-- (cooldown / max claims) inside apply_twitch_reward_v890 under a transaction lock.
-- Does not delete inventory or change pack/shop/currency payout rules.
-- Rollback: restore prior function bodies and re-grant anon execute only if
-- intentionally reopening the legacy import surface (not recommended).

-- ---------------------------------------------------------------------------
-- Collector XP: allow trusted paths to skip XP without changing normal awards
-- ---------------------------------------------------------------------------
create or replace function public.award_collector_xp_from_card_quantity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  gained_quantity integer := 0;
  rarity_points integer := 0;
begin
  -- Transaction-local opt-out for non-earning inventory writes (legacy import).
  if current_setting('starlight.skip_collector_xp', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    gained_quantity := greatest(coalesce(new.quantity, 0), 0);
  elsif tg_op = 'UPDATE' then
    gained_quantity := greatest(
      coalesce(new.quantity, 0) - coalesce(old.quantity, 0),
      0
    );
  end if;

  if gained_quantity <= 0 then
    return new;
  end if;

  select case rarity
    when 'Common' then 1
    when 'Uncommon' then 2
    when 'Rare' then 5
    when 'Epic' then 15
    when 'Legendary' then 50
    else 0
  end
  into rarity_points
  from public.cards
  where id = new.card_id;

  insert into public.user_wallets (
    user_id,
    collector_xp
  )
  values (
    new.user_id,
    gained_quantity * coalesce(rarity_points, 0)
  )
  on conflict (user_id)
  do update set
    collector_xp = public.user_wallets.collector_xp
      + excluded.collector_xp,
    updated_at = now();

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Legacy import: one attempt per user; hash is not ownership proof; no XP;
-- revoke anon execute
-- ---------------------------------------------------------------------------
create or replace function public.import_legacy_collection(
  collected_card_ids text[],
  requested_import_hash text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  valid_card_ids text[];
  imported_count integer := 0;
  prior_import boolean := false;
  already_imported boolean := false;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'You must be signed in to import a collection.';
  end if;

  if requested_import_hash is null
     or length(trim(requested_import_hash)) < 8 then
    raise exception 'The import hash is invalid.';
  end if;

  if collected_card_ids is null then
    raise exception 'No collection data was supplied.';
  end if;

  if cardinality(collected_card_ids) > 1000 then
    raise exception 'The collection import is too large.';
  end if;

  -- Browser-supplied IDs + client hash are not proof of prior ownership.
  -- Allow at most one legacy import attempt per collector account.
  select exists (
    select 1
    from public.collection_imports
    where user_id = current_user_id
  )
  into prior_import;

  if prior_import then
    raise exception
      'A legacy collection import was already recorded for this account. Additional imports are not allowed.';
  end if;

  select exists (
    select 1
    from public.collection_imports
    where user_id = current_user_id
      and import_hash = requested_import_hash
  )
  into already_imported;

  if already_imported then
    return jsonb_build_object(
      'success', true,
      'alreadyImported', true,
      'importedCount', 0
    );
  end if;

  select coalesce(
    array_agg(cards.id order by cards.id),
    array[]::text[]
  )
  into valid_card_ids
  from public.cards
  where cards.id = any(collected_card_ids)
    and cards.is_visible = true
    and cards.is_collectible = true;

  -- Inventory may be restored for migration, but must not farm Collector XP.
  perform set_config('starlight.skip_collector_xp', 'on', true);

  insert into public.user_cards (
    user_id,
    card_id,
    quantity,
    is_favorite
  )
  select
    current_user_id,
    valid_card_id,
    1,
    false
  from unnest(valid_card_ids) as valid_card_id
  on conflict (user_id, card_id)
  do nothing;

  get diagnostics imported_count = row_count;

  insert into public.collection_imports (
    user_id,
    import_version,
    import_hash,
    imported_card_count,
    imported_favorite_count
  )
  values (
    current_user_id,
    'v79.9-local-storage',
    requested_import_hash,
    imported_count,
    0
  );

  return jsonb_build_object(
    'success', true,
    'alreadyImported', false,
    'requestedCount', cardinality(collected_card_ids),
    'validCount', cardinality(valid_card_ids),
    'importedCount', imported_count,
    'collectorXpAwarded', false
  );
end;
$function$;

revoke all on function public.import_legacy_collection(text[], text) from public, anon;
grant execute on function public.import_legacy_collection(text[], text) to authenticated, service_role;

comment on function public.import_legacy_collection(text[], text) is
  'One-time legacy browser-collection import per user. Client hash is not ownership proof; inserts visible collectible IDs only and does not award Collector XP.';
