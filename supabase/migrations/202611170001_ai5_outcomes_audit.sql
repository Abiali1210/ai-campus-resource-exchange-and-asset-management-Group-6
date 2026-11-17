-- AI5 additions on top of the deterministic/narrative stages. Additive only:
-- (1) period- and department-filtered calculated outcome breakdown, kept apart from
--     the narrative facts so the narrative validator and bound snapshots are unchanged;
-- (2) audit_logs entries for the report lifecycle, written by triggers so existing
--     RPCs keep their behaviour. Audit rows hold ids/status/hashes, never narrative text.

create function public.ai5_outcome_breakdown(p_start date,p_end date,p_department uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare req jsonb; alloc jsonb; tr jsonb; dep_name text;
begin
 perform public.require_active();
 if not public.has_role('business_administrator') then raise exception 'Forbidden: business administrator required'; end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366 then
  raise exception 'Validation: period must run start to end and span at most 367 days'; end if;
 if p_end>(now() at time zone 'Asia/Dubai')::date then raise exception 'Validation: period cannot end in the future'; end if;
 if p_department is not null then
  select name into dep_name from public.departments where department_id=p_department;
  if dep_name is null then raise exception 'Validation: unknown department'; end if;
 end if;
 with q as (select * from public.resource_requests r
  where (r.submitted_at at time zone 'Asia/Dubai')::date between p_start and p_end
  and (p_department is null or r.department_id=p_department))
 select jsonb_build_object('submitted',count(*),
  'open',count(*) filter(where status in ('Open','Reserved','Partially Fulfilled')),
  'partiallyFulfilled',count(*) filter(where status='Partially Fulfilled'),
  'fulfilled',count(*) filter(where status='Fulfilled'),
  'closed',count(*) filter(where status='Closed'),
  'canceled',count(*) filter(where status='Canceled'),
  'requestedUnits',coalesce(sum(requested_qty),0)) into req from q;
 -- 'open' includes partiallyFulfilled; the other statuses are disjoint.
 with q as (select request_id from public.resource_requests r
  where (r.submitted_at at time zone 'Asia/Dubai')::date between p_start and p_end
  and (p_department is null or r.department_id=p_department))
 select jsonb_build_object('approved',count(*),'approvedUnits',coalesce(sum(r.qty),0),
  'activeUnits',coalesce(sum(r.qty) filter(where r.status='Active'),0),
  'acceptedUnits',coalesce(sum(r.qty) filter(where r.status='Accepted'),0),
  'releasedUnits',coalesce(sum(r.qty) filter(where r.status='Released'),0)) into alloc
  from public.reservations r where r.request_id in (select request_id from q);
 with q as (select request_id from public.resource_requests r
  where (r.submitted_at at time zone 'Asia/Dubai')::date between p_start and p_end
  and (p_department is null or r.department_id=p_department))
 select jsonb_build_object('total',count(*),
  'completed',count(*) filter(where t.state='Completed'),
  'pending',count(*) filter(where t.state in ('Pending Approval','Approved','Scheduled','In Transit')),
  'canceled',count(*) filter(where t.state='Canceled'),
  'disputed',count(*) filter(where t.state='Disputed'),
  'returned',count(*) filter(where t.state='Returned'),
  'completedUnits',coalesce(sum(t.approved_qty) filter(where t.state='Completed'),0)) into tr
  from public.transfers t join public.reservations r using(reservation_id)
  where r.request_id in (select request_id from q);
 return jsonb_build_object('period',jsonb_build_object('start',p_start,'end',p_end),
  'scope',jsonb_build_object('departmentId',p_department,'departmentName',coalesce(dep_name,'All departments')),
  'basis','Requests submitted in the period and their linked allocations and transfers as currently recorded; not a frozen snapshot',
  'requests',req,'allocations',alloc,'transfers',tr);
end $$;
revoke all on function public.ai5_outcome_breakdown(date,date,uuid) from public,anon;
grant execute on function public.ai5_outcome_breakdown(date,date,uuid) to authenticated;

create function public.ai5_audit_snapshot() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.audit_logs(actor_id,event,target_type,target_id,after_data,operation_key)
 values(new.created_by,'report.snapshot_captured','report',new.snapshot_id,
  jsonb_build_object('snapshotId',new.snapshot_id,'calculationVersion',new.calculation_version,'capturedAt',new.captured_at),null);
 return null;
end $$;
create function public.ai5_audit_narrative() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare ev text; actor uuid;
begin
 if tg_op='INSERT' then
  insert into public.audit_logs(actor_id,event,target_type,target_id,after_data)
  values(new.created_by,'report.narrative_generated','report',new.narrative_id,
   jsonb_build_object('narrativeId',new.narrative_id,'snapshotId',new.snapshot_id,'model',new.model_id,'textHash',encode(sha256(convert_to(new.generated_text,'UTF8')),'hex')));
  return null;
 end if;
 if new.current_text is distinct from old.current_text then
  insert into public.audit_logs(actor_id,event,target_type,target_id,before_data,after_data)
  values(new.edited_by,'report.narrative_edited','report',new.narrative_id,
   jsonb_build_object('textHash',encode(sha256(convert_to(old.current_text,'UTF8')),'hex')),
   jsonb_build_object('snapshotId',new.snapshot_id,'textHash',encode(sha256(convert_to(new.current_text,'UTF8')),'hex')));
 end if;
 if new.status is distinct from old.status then
  ev:=case new.status when 'Ready' then 'report.narrative_ready' when 'Published' then 'report.narrative_published' end;
  actor:=case new.status when 'Ready' then new.reviewed_by else new.published_by end;
  if ev is not null then
   insert into public.audit_logs(actor_id,event,target_type,target_id,before_data,after_data)
   values(actor,ev,'report',new.narrative_id,jsonb_build_object('status',old.status),
    jsonb_build_object('status',new.status,'snapshotId',new.snapshot_id,'textHash',encode(sha256(convert_to(new.current_text,'UTF8')),'hex')));
  end if;
 end if;
 return null;
end $$;
revoke all on function public.ai5_audit_snapshot(),public.ai5_audit_narrative() from public,anon,authenticated;
create trigger ai5_audit_snapshot after insert on public.ai5_report_snapshots for each row execute function public.ai5_audit_snapshot();
create trigger ai5_audit_narrative after insert or update on public.ai5_report_narratives for each row execute function public.ai5_audit_narrative();
