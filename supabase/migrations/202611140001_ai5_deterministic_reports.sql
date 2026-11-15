-- AI5 Stage 1: immutable deterministic snapshots; no generated narrative.
create table public.ai5_report_snapshots (
 snapshot_id uuid primary key default gen_random_uuid(),
 schema_version integer not null default 1 check(schema_version=1),
 calculation_version text not null default 'ai5-all-time-v1',
 period_start timestamptz not null,
 period_end timestamptz not null,
 captured_at timestamptz not null,
 facts jsonb not null check(jsonb_typeof(facts)='object'),
 idempotency_key text not null check(length(trim(idempotency_key)) between 1 and 200),
 created_by uuid not null references public.profiles(user_id),
 unique(created_by,idempotency_key),
 check(period_start<=period_end and period_end=captured_at)
);
alter table public.ai5_report_snapshots enable row level security;
revoke all on public.ai5_report_snapshots from public,anon,authenticated;
grant all on public.ai5_report_snapshots to service_role;

create function public.ai5_snapshot_immutable() returns trigger language plpgsql
set search_path=public,pg_temp as $$ begin
 raise exception 'Immutable: report snapshots cannot be changed or deleted';
end $$;
create trigger ai5_snapshot_immutable before update or delete on public.ai5_report_snapshots
for each row execute function public.ai5_snapshot_immutable();

create function public.ai5_capture_report(p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare captured timestamptz:=transaction_timestamp(); result public.ai5_report_snapshots; facts_value jsonb; start_at timestamptz;
begin
 perform public.require_active();
 if not public.has_role('business_administrator') then raise exception 'Forbidden: business administrator required'; end if;
 if nullif(trim(p_idempotency_key),'') is null or length(p_idempotency_key)>200 then raise exception 'Validation: nonblank idempotency key required'; end if;
 select coalesce(min(ts),captured) into start_at from (
  select submitted_at ts from public.resource_requests where submitted_at<=captured
   union all select h.recorded_at from public.handovers h join public.transfers t using(transfer_id)
    where t.state='Completed' and h.kind in ('Receipt','Reconciliation')
     and h.accepted and h.recorded_at<=captured
 ) activity;
 facts_value:=jsonb_build_object(
  'requests_submitted',(select count(*) from public.resource_requests where submitted_at<=captured),
  'open_requests',(select count(*) from public.resource_requests where submitted_at<=captured and status in ('Open','Reserved','Partially Fulfilled')),
    'completed_transfers',(select count(*) from public.transfers t where t.state='Completed' and exists (
      select 1 from public.handovers h where h.transfer_id=t.transfer_id
       and h.kind in ('Receipt','Reconciliation') and h.accepted and h.recorded_at<=captured
    )),
    'units_successfully_transferred',(select coalesce(sum(t.approved_qty),0) from public.transfers t where t.state='Completed' and exists (
      select 1 from public.handovers h where h.transfer_id=t.transfer_id
       and h.kind in ('Receipt','Reconciliation') and h.accepted and h.recorded_at<=captured
    ))
 );
 insert into public.ai5_report_snapshots(period_start,period_end,captured_at,facts,idempotency_key,created_by)
  values(start_at,captured,captured,facts_value,p_idempotency_key,auth.uid()) on conflict(created_by,idempotency_key) do nothing returning * into result;
  if not found then select * into result from public.ai5_report_snapshots where created_by=auth.uid() and idempotency_key=p_idempotency_key; end if;
 return to_jsonb(result);
end $$;

create function public.ai5_report_workspace(p_limit integer default 20) returns setof jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$ begin
 perform public.require_active();
 if not public.has_role('business_administrator') then raise exception 'Forbidden: business administrator required'; end if;
 return query select to_jsonb(s) from public.ai5_report_snapshots s order by s.captured_at desc,s.snapshot_id limit least(greatest(coalesce(p_limit,20),1),20);
end $$;
revoke all on function public.ai5_capture_report(text),public.ai5_report_workspace(integer),public.ai5_snapshot_immutable() from public,anon,authenticated;
grant execute on function public.ai5_capture_report(text),public.ai5_report_workspace(integer) to authenticated;
