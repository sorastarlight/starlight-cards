-- Fix NULL role gate on admin SECURITY DEFINER RPCs.
-- Pattern `IF actor_role NOT IN ('owner','admin')` is false when actor_role IS NULL,
-- so collectors with no site_roles row could pass the check. Rewrite to
-- `coalesce(actor_role, '') not in (...)` across matching admin_* functions.
-- Does not change role tiers or economic rules.

do $$
declare
  r record;
  def text;
  newdef text;
  fixed int := 0;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'admin\_%' escape '\'
      and pg_get_functiondef(p.oid) ~* 'actor_role[[:space:]]+not[[:space:]]+in'
  loop
    def := pg_get_functiondef(r.oid);
    -- Avoid double-wrapping already-fixed functions.
    if def ~* 'coalesce[[:space:]]*\([[:space:]]*actor_role' then
      continue;
    end if;
    newdef := regexp_replace(
      def,
      'actor_role([[:space:]]+not[[:space:]]+in[[:space:]]*\()',
      'coalesce(actor_role, '''')\1',
      'gi'
    );
    if newdef is distinct from def then
      execute newdef;
      fixed := fixed + 1;
    end if;
  end loop;

  if fixed < 1 then
    raise exception 'Expected to rewrite at least one admin_* NULL role gate; fixed=%', fixed;
  end if;
end;
$$;

comment on function public.is_content_admin() is
  'True when auth.uid() has site_roles.role owner or admin. Prefer this (or coalesce(actor_role,'''') NOT IN) over bare actor_role NOT IN, which fails open on NULL.';
