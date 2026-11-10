-- Design v1.4 section 6.1: financial read permission is independent of
-- workflow participation. Requesters and Facilities may track a transfer without
-- receiving its costs. Apply to existing data without rewriting immutable audits.
begin;

create function public.workflow_can_read_transfer_costs(p_transfer_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.transfers t
 where t.transfer_id=p_transfer_id and
 (public.has_role('business_administrator') or exists(
  select 1 from public.profiles p where p.user_id=auth.uid()
  and p.department_id in (t.supplier_department_id,t.receiver_department_id)
  and (public.has_role('representative') or public.has_role('finance')))))
$$;

-- Strip both public projection names and raw SQL snapshot names at any depth.
-- Nulls, scalar values, array order and all nonfinancial evidence are preserved.
create function public.workflow_redact_transfer_costs(p_value jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_value)='object' then
  return (select coalesce(jsonb_object_agg(e.key,public.workflow_redact_transfer_costs(e.value)),'{}'::jsonb)
   from jsonb_each(p_value) e where e.key not in ('handlingCost','transportCost','handling_cost','transport_cost'));
 elsif jsonb_typeof(p_value)='array' then
  return (select coalesce(jsonb_agg(public.workflow_redact_transfer_costs(e.value) order by e.ordinality),'[]'::jsonb)
   from jsonb_array_elements(p_value) with ordinality e(value,ordinality));
 end if;
 return p_value;
end $$;

-- Scope each audit to its original transfer, never the asset's current owner.
-- Both snapshots use the same authoritative transfer. Unknown scope is redacted.
create function public.workflow_audit_payload(p_before jsonb,p_after jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare transfer_id uuid;
begin
 transfer_id:=coalesce(p_after->'transfer'->>'transfer_id',p_before->'transfer'->>'transfer_id',
  p_after->>'transferId',p_before->>'transferId')::uuid;
 if public.workflow_can_read_transfer_costs(transfer_id) then
  return jsonb_build_object('before',p_before,'after',p_after);
 end if;
 return jsonb_build_object('before',public.workflow_redact_transfer_costs(p_before),
  'after',public.workflow_redact_transfer_costs(p_after));
end $$;

revoke all on function public.workflow_can_read_transfer_costs(uuid),
 public.workflow_redact_transfer_costs(jsonb),public.workflow_audit_payload(jsonb,jsonb)
 from public,anon,authenticated;

-- Preserve the existing record visibility; filter financial fields separately.
create or replace function public.workflow_workspace() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor public.profiles:=public.require_active(); result jsonb;
begin
 with permitted_requests as (select q.* from public.resource_requests q where public.workflow_request_access(q.request_id)),
 permitted_interests as (select i.* from public.interests i join public.stock_portions s using(portion_id)
 where public.workflow_request_access(i.request_id,true) or public.can_manage_department(i.supplier_department_id)
 or exists(select 1 from public.reservations r join public.transfers t using(reservation_id) where r.interest_id=i.interest_id and (public.can_manage_department(t.supplier_department_id) or (t.facilities_id=actor.user_id and public.has_role('facilities'))))),
 permitted_transfers as (select t.*,r.request_id,r.portion_id,r.interest_id,r.status allocation_status from public.transfers t join public.reservations r using(reservation_id)
 where public.workflow_request_access(r.request_id,true) or public.can_manage_department(t.supplier_department_id) or (t.facilities_id=actor.user_id and public.has_role('facilities')))
 select jsonb_build_object(
 'requests',(select coalesce(jsonb_agg(jsonb_build_object('requestId',q.request_id,'requesterId',q.requester_id,'departmentId',q.department_id,'categoryId',q.category_id,'purpose',q.purpose,'requestedQty',q.requested_qty,'specifications',q.specifications,'condition',q.condition,'urgency',q.urgency,'requiredDate',q.required_date,'destination',q.destination,'status',q.status,'version',q.version,'submittedAt',q.submitted_at)
 ||public.workflow_totals(q.request_id) order by q.submitted_at),'[]') from permitted_requests q),
 'interests',(select coalesce(jsonb_agg(jsonb_build_object('interestId',i.interest_id,'requestId',i.request_id,'portionId',i.portion_id,'createdBy',i.created_by,'qty',i.qty,'status',i.status,'version',i.version,'submittedAt',i.submitted_at,'supplierDepartmentId',i.supplier_department_id,'assetName',a.name,'assetId',a.asset_id,'currentAvailable',s.active and s.state='Available' and s.owner_department_id=i.supplier_department_id) order by i.submitted_at),'[]') from permitted_interests i join public.stock_portions s using(portion_id) join public.assets a using(asset_id)),
 'transfers',(select coalesce(jsonb_agg(jsonb_build_object('transferId',t.transfer_id,'reservationId',t.reservation_id,'requestId',t.request_id,'interestId',t.interest_id,'portionId',t.portion_id,'supplierDepartmentId',t.supplier_department_id,'receiverDepartmentId',t.receiver_department_id,'qty',t.approved_qty,'state',t.state,'version',t.version,'facilitiesId',t.facilities_id,'scheduledAt',t.scheduled_at,'arrangements',t.arrangements,'assetName',a.name,'assetId',a.asset_id,
 'ownerDepartmentId',coalesce(t.tracking_snapshot->'ownerDepartmentId',to_jsonb(s.owner_department_id)),
 'custodianId',coalesce(t.tracking_snapshot->'custodianId',to_jsonb(s.custodian_id)),
 'holderId',coalesce(t.tracking_snapshot->'holderId',to_jsonb(s.holder_id)),
 'assignedLocation',coalesce(t.tracking_snapshot->'assignedLocation',to_jsonb(s.assigned_location)),
 'physicalLocation',coalesce(t.tracking_snapshot->'physicalLocation',to_jsonb(s.physical_location)),
 'condition',coalesce(t.tracking_snapshot->'condition',to_jsonb(s.condition)),'allocationStatus',t.allocation_status,
 'holders',(select coalesce(jsonb_agg(jsonb_build_object('userId',p.user_id,'name',p.name)),'[]') from public.profiles p where
  (p.user_id=t.facilities_id and public.workflow_person(p.user_id,'facilities'))
  or public.workflow_person(p.user_id,'representative',t.supplier_department_id)
  or public.workflow_person(p.user_id,'representative',t.receiver_department_id)
  or public.workflow_person(p.user_id,'requester',t.receiver_department_id)),
 'approvals',(select coalesce(jsonb_agg(to_jsonb(ap) order by ap.decided_at),'[]') from public.approvals ap where ap.transfer_id=t.transfer_id or ap.reservation_id=t.reservation_id),
 'handovers',(select coalesce(jsonb_agg(to_jsonb(h) order by h.recorded_at),'[]') from public.handovers h where h.transfer_id=t.transfer_id)
 ) || case when public.workflow_can_read_transfer_costs(t.transfer_id) then jsonb_build_object('handlingCost',t.handling_cost,'transportCost',t.transport_cost) else '{}'::jsonb end),'[]') from permitted_transfers t join public.stock_portions s using(portion_id) join public.assets a using(asset_id)),
 'decisions',(select coalesce(jsonb_agg(to_jsonb(ap) order by ap.decided_at),'[]') from public.approvals ap where ap.interest_id in (select interest_id from permitted_interests)),
 'facilities',(select coalesce(jsonb_agg(jsonb_build_object('userId',p.user_id,'name',p.name)),'[]') from public.profiles p where public.workflow_person(p.user_id,'facilities') and (public.has_role('representative') or public.has_role('facilities'))),
 'history',(select coalesce(jsonb_agg((jsonb_build_object('auditId',l.audit_id,'actorId',l.actor_id,'event',l.event,'occurredAt',l.occurred_at)||public.workflow_audit_payload(l.before_data,l.after_data)) order by l.occurred_at desc),'[]') from public.audit_logs l where
 (l.target_type='request' and l.target_id in (select request_id from permitted_requests) and public.workflow_request_access(l.target_id,true))
 or (l.target_type='asset' and (l.event like 'transfer.%' or l.event like 'reservation.%') and
 ((l.after_data->'transfer'->>'transfer_id')::uuid in (select transfer_id from permitted_transfers)
 or (l.after_data->>'transferId')::uuid in (select transfer_id from permitted_transfers)
 or (l.after_data->>'interestId')::uuid in (select interest_id from permitted_interests))))) into result;
 return result;
end $$;

-- Both asset_detail overloads already delegate to this guarded audit RPC.
create or replace function public.list_asset_audit(p_asset_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.require_active();
 -- Marketplace visibility does not grant access to private before/after records.
 if not public.asset_access(p_asset_id,true) and not(public.has_role('business_administrator') or (public.has_role('finance') and public.can_read_finance(p_asset_id))) then raise exception 'Forbidden: private asset audit'; end if;
 return (select coalesce(jsonb_agg((jsonb_build_object('auditId',l.audit_id,'actorId',l.actor_id,'event',l.event,'targetId',l.target_id,'occurredAt',l.occurred_at)||public.workflow_audit_payload(l.before_data,l.after_data)) order by l.occurred_at desc),'[]') from public.audit_logs l where l.target_type='asset' and l.target_id=p_asset_id);
end $$;

-- CREATE OR REPLACE preserves the existing authenticated RPC grants. Reassert
-- that neither public nor anonymous callers can invoke these entry points.
revoke all on function public.workflow_workspace(),public.list_asset_audit(uuid) from public,anon;
grant execute on function public.workflow_workspace(),public.list_asset_audit(uuid) to authenticated;
commit;
