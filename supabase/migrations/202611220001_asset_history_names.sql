-- Issue 4: readable asset history in the asset record pop-up. Additive and
-- read-only: no table, row or stored audit record changes.
--
-- 1. Every history event gains actorName, the acting profile's display name
--    (never e-mail, roles or department), so the pop-up need not show actor
--    UUIDs. Precedent: 202611140003_ai5_actor_names.sql.
-- 2. The full private audit keeps its rule: write access to every active
--    portion, business administrator, or finance of an owning department,
--    served by list_asset_audit. A batch split between two departments fails
--    that rule for both representatives, so its pop-up showed no history while
--    Requests and transfers -> History showed the trail. Callers outside the
--    full rule now get only this asset's reservation and transfer events that
--    workflow_workspace already shows them: the same participant rule and the
--    same transfer-cost redaction. Marketplace visibility alone still gives
--    no history.
begin;

-- Private helper for both asset_detail overloads; never granted to API roles.
create function public.asset_history(p_asset_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor public.profiles:=public.require_active(); hist jsonb;
begin
 if public.asset_access(p_asset_id,true) or public.has_role('business_administrator')
 or (public.has_role('finance') and public.can_read_finance(p_asset_id)) then
  hist:=public.list_asset_audit(p_asset_id);
 else
  -- Same scope as the workflow_workspace history, limited to this asset.
  with permitted_transfers as (select t.transfer_id from public.transfers t
   join public.reservations r using(reservation_id) join public.stock_portions s on s.portion_id=r.portion_id
   where s.asset_id=p_asset_id and (public.workflow_request_access(r.request_id,true)
    or public.can_manage_department(t.supplier_department_id)
    or (t.facilities_id=actor.user_id and public.has_role('facilities')))),
  permitted_interests as (select i.interest_id from public.interests i join public.stock_portions s using(portion_id)
   where s.asset_id=p_asset_id and (public.workflow_request_access(i.request_id,true)
    or public.can_manage_department(i.supplier_department_id)
    or exists(select 1 from public.reservations r join public.transfers t using(reservation_id)
     where r.interest_id=i.interest_id and (public.can_manage_department(t.supplier_department_id)
      or (t.facilities_id=actor.user_id and public.has_role('facilities'))))))
  select coalesce(jsonb_agg((jsonb_build_object('auditId',l.audit_id,'actorId',l.actor_id,'event',l.event,'targetId',l.target_id,'occurredAt',l.occurred_at)
   ||public.workflow_audit_payload(l.before_data,l.after_data)) order by l.occurred_at desc),'[]') into hist
  from public.audit_logs l
  where l.target_type='asset' and l.target_id=p_asset_id
  and (l.event like 'transfer.%' or l.event like 'reservation.%')
  and ((l.after_data->'transfer'->>'transfer_id')::uuid in (select transfer_id from permitted_transfers)
   or (l.after_data->>'transferId')::uuid in (select transfer_id from permitted_transfers)
   or (l.after_data->>'interestId')::uuid in (select interest_id from permitted_interests));
 end if;
 return (select coalesce(jsonb_agg(e.value||jsonb_build_object('actorName',p.name) order by e.ordinality),'[]')
  from jsonb_array_elements(hist) with ordinality e(value,ordinality)
  left join public.profiles p on p.user_id=(e.value->>'actorId')::uuid);
end $$;
revoke all on function public.asset_history(uuid) from public,anon,authenticated;

-- Unchanged signatures, guards and asset projection; only the history source differs.
create or replace function public.asset_detail(p_asset_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare item jsonb;
begin
 perform public.require_active();
 if not public.asset_access(p_asset_id,false) then raise exception 'Forbidden: asset scope'; end if;
 item:=public.search_assets(jsonb_build_object('assetId',p_asset_id))->0;
 return jsonb_build_object('asset',item,'history',public.asset_history(p_asset_id));
end $$;

create or replace function public.asset_detail(p_asset_id uuid,p_portion_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare item jsonb;
begin
 perform public.require_active();
 if not exists(select 1 from public.stock_portions where portion_id=p_portion_id and asset_id=p_asset_id and active)
 or not public.can_read_portion(p_portion_id) then raise exception 'Forbidden: selected portion unavailable'; end if;
 item:=public.search_assets(jsonb_build_object('assetId',p_asset_id,'limit',1,'offset',
  (select count(*) from public.stock_portions s where s.asset_id=p_asset_id and s.active and public.can_read_portion(s.portion_id) and s.portion_id<p_portion_id)))->0;
 if item->>'portionId' is distinct from p_portion_id::text then raise exception 'Conflict: selected portion changed; reload catalogue'; end if;
 if item is null then raise exception 'Conflict: selected portion changed; reload catalogue'; end if;
 return jsonb_build_object('asset',item,'history',public.asset_history(p_asset_id));
end $$;

-- CREATE OR REPLACE keeps the existing grants; reassert them explicitly.
revoke all on function public.asset_detail(uuid),public.asset_detail(uuid,uuid) from public,anon;
grant execute on function public.asset_detail(uuid),public.asset_detail(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
