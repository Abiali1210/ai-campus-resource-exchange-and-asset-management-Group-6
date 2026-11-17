-- C9 basic report: a table of requests and transfers for a period, exportable as CSV
-- by the client. Additive and read-only.
--
-- Visibility reuses the Part 2 workflow rules, so the report never shows a row the
-- caller could not already see in Requests and transfers:
--   * requests:  workflow_request_access(request_id)
--   * transfers: write access to the linked request, supplier representative, or the
--                assigned Facilities user (same as workflow_workspace)
--   * business administrators see every row (institution-wide reporting).
-- Handling/transport costs are never included, so financial redaction is not needed.
-- Rows are selected by the linked request's submission date (Asia/Dubai), matching
-- ai5_outcome_breakdown.

create function public.c9_can_read_transfer(p_transfer_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('business_administrator') or exists(
  select 1 from public.transfers t join public.reservations r using(reservation_id)
  where t.transfer_id=p_transfer_id and (public.workflow_request_access(r.request_id,true)
   or public.can_manage_department(t.supplier_department_id)
   or (t.facilities_id=auth.uid() and public.has_role('facilities'))))
$$;

create function public.c9_activity_report(p_start date,p_end date,p_department uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare dep_name text; reqs jsonb; trs jsonb; admin boolean;
begin
 perform public.require_active();
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366 then
  raise exception 'Validation: period must run start to end and span at most 367 days'; end if;
 if p_end>(now() at time zone 'Asia/Dubai')::date then raise exception 'Validation: period cannot end in the future'; end if;
 if p_department is not null then
  select name into dep_name from public.departments where department_id=p_department;
  if dep_name is null then raise exception 'Validation: unknown department'; end if;
 end if;
 admin:=public.has_role('business_administrator');

 with q as (select * from public.resource_requests r
  where (r.submitted_at at time zone 'Asia/Dubai')::date between p_start and p_end
  and (p_department is null or r.department_id=p_department)
  and (admin or public.workflow_request_access(r.request_id)))
 select coalesce(jsonb_agg(jsonb_build_object(
   'requestId',q.request_id,'submittedAt',q.submitted_at,
   'requesterName',p.name,'departmentName',d.name,'categoryName',c.name,
   'purpose',q.purpose,'urgency',q.urgency,'requiredDate',q.required_date,
   'requestedQty',q.requested_qty,'status',q.status) || public.workflow_totals(q.request_id)
  order by q.submitted_at,q.request_id),'[]') into reqs
 from q join public.profiles p on p.user_id=q.requester_id
  join public.departments d on d.department_id=q.department_id
  join public.categories c on c.category_id=q.category_id;

 with t as (select t.*,r.request_id,r.portion_id from public.transfers t
  join public.reservations r using(reservation_id)
  join public.resource_requests q on q.request_id=r.request_id
  where (q.submitted_at at time zone 'Asia/Dubai')::date between p_start and p_end
  and (p_department is null or t.supplier_department_id=p_department or t.receiver_department_id=p_department)
  and public.c9_can_read_transfer(t.transfer_id))
 select coalesce(jsonb_agg(jsonb_build_object(
   'transferId',t.transfer_id,'requestId',t.request_id,'assetName',a.name,'qty',t.approved_qty,
   'supplierDepartmentName',sd.name,'receiverDepartmentName',rd.name,'state',t.state,
   'scheduledAt',t.scheduled_at,
   'dispatchedAt',(select min(h.recorded_at) from public.handovers h where h.transfer_id=t.transfer_id and h.kind='Dispatch'),
   'receivedAt',(select max(h.recorded_at) from public.handovers h where h.transfer_id=t.transfer_id and h.kind in ('Receipt','Reconciliation') and h.accepted),
   'lastActivityAt',(select max(h.recorded_at) from public.handovers h where h.transfer_id=t.transfer_id))
  order by t.scheduled_at nulls last,t.transfer_id),'[]') into trs
 from t join public.stock_portions s on s.portion_id=t.portion_id
  join public.assets a on a.asset_id=s.asset_id
  join public.departments sd on sd.department_id=t.supplier_department_id
  join public.departments rd on rd.department_id=t.receiver_department_id;

 return jsonb_build_object('period',jsonb_build_object('start',p_start,'end',p_end),
  'scope',jsonb_build_object('departmentId',p_department,'departmentName',coalesce(dep_name,'All departments'),
   'visibility',case when admin then 'institution' else 'permitted' end),
  'basis','Requests submitted in the period and their linked transfers, as currently recorded',
  'requests',reqs,'transfers',trs);
end $$;

revoke all on function public.c9_can_read_transfer(uuid) from public,anon,authenticated;
revoke all on function public.c9_activity_report(date,date,uuid) from public,anon;
grant execute on function public.c9_activity_report(date,date,uuid) to authenticated;
