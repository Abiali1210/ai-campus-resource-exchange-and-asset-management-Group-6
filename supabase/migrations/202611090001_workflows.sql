-- C4-C6. Additive to the catalogue foundation; no shared data is reset.
create table public.resource_requests (
 request_id uuid primary key default gen_random_uuid(),
 requester_id uuid not null references public.profiles,
 department_id uuid not null references public.departments,
 category_id uuid not null references public.categories,
 purpose text not null check(length(trim(purpose)) between 1 and 2000),
 requested_qty integer not null check(requested_qty>0),
 specifications jsonb not null default '{}' check(jsonb_typeof(specifications)='object'),
 condition text not null check(condition in ('Excellent','Good','Fair')),
 urgency text not null check(urgency in ('Low','Normal','High')),
 required_date date not null,
 destination text not null check(length(trim(destination)) between 1 and 200),
 status text not null default 'Open' check(status in ('Open','Reserved','Partially Fulfilled','Fulfilled','Closed','Canceled')),
 version integer not null default 1,
 submitted_at timestamptz not null default now()
);
create table public.interests (
 interest_id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.resource_requests,
 portion_id uuid not null references public.stock_portions,
 created_by uuid not null references public.profiles,
 supplier_department_id uuid not null references public.departments,
 qty integer not null check(qty>0),
 status text not null default 'Pending' check(status in ('Pending','Approved','Rejected','Canceled')),
 version integer not null default 1,
 submitted_at timestamptz not null default now(),
 unique(interest_id,request_id,portion_id)
);
create table public.reservations (
 reservation_id uuid primary key default gen_random_uuid(),
 interest_id uuid not null unique,
 request_id uuid not null,
 source_portion_id uuid not null,
 portion_id uuid not null references public.stock_portions,
 qty integer not null check(qty>0),
 status text not null default 'Active' check(status in ('Active','Accepted','Released')),
 foreign key(interest_id,request_id,source_portion_id) references public.interests(interest_id,request_id,portion_id)
);
create unique index one_active_portion_allocation on public.reservations(portion_id) where status='Active';
create table public.transfers (
 transfer_id uuid primary key default gen_random_uuid(),
 reservation_id uuid not null unique references public.reservations,
 supplier_department_id uuid not null references public.departments,
 receiver_department_id uuid not null references public.departments,
 approved_qty integer not null check(approved_qty>0),
 state text not null default 'Pending Approval' check(state in ('Pending Approval','Approved','Scheduled','In Transit','Disputed','Completed','Returned','Canceled')),
 version integer not null default 1,
 facilities_id uuid references public.profiles,
 scheduled_at timestamptz,
 arrangements text,
 tracking_snapshot jsonb,
 handling_cost numeric(14,2) check(handling_cost>=0 and handling_cost<>'NaN'::numeric),
 transport_cost numeric(14,2) check(transport_cost>=0 and transport_cost<>'NaN'::numeric)
);
create table public.approvals (
 approval_id uuid primary key default gen_random_uuid(),
 interest_id uuid references public.interests,
 reservation_id uuid references public.reservations,
 transfer_id uuid references public.transfers,
 actor_id uuid not null references public.profiles,
 decision_type text not null check(decision_type in ('Reservation','Release')),
 decision text not null check(decision in ('Approved','Rejected')),
 reason text not null check(length(trim(reason)) between 1 and 2000),
 decided_at timestamptz not null default now(),
 check((decision_type='Reservation' and interest_id is not null and transfer_id is null
       and ((decision='Approved' and reservation_id is not null) or (decision='Rejected' and reservation_id is null)))
    or (decision_type='Release' and transfer_id is not null and interest_id is null and reservation_id is null))
);
create table public.handovers (
 handover_id uuid primary key default gen_random_uuid(),
 transfer_id uuid not null references public.transfers,
 recorded_by uuid not null references public.profiles,
 kind text not null check(kind in ('Dispatch','Receipt','Reconciliation','Return')),
 qty integer not null check(qty>=0),
 condition text not null check(condition in ('Excellent','Good','Fair','Poor','Unknown')),
 accepted boolean not null,
 holder_id uuid not null references public.profiles,
 location text not null check(length(trim(location)) between 1 and 200),
 reason text not null check(length(trim(reason)) between 1 and 2000),
 recorded_at timestamptz not null default now()
);
create index request_actor_idx on public.resource_requests(requester_id,department_id);
create index interest_request_idx on public.interests(request_id);
create index reservation_request_idx on public.reservations(request_id);
create index transfer_scope_idx on public.transfers(supplier_department_id,receiver_department_id,facilities_id);
do $$ declare t text; begin
 foreach t in array array['resource_requests','interests','reservations','transfers','approvals','handovers'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.workflow_request_access(p_id uuid,p_write boolean default false) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.resource_requests q where q.request_id=p_id and
 ((q.requester_id=auth.uid() and (public.has_role('requester') or public.has_role('representative'))) or public.can_manage_department(q.department_id)
 or (not p_write and exists(select 1 from public.interests i
 where i.request_id=q.request_id and public.can_manage_department(i.supplier_department_id)))
 or (not p_write and exists(select 1 from public.reservations r join public.transfers t using(reservation_id)
 where r.request_id=q.request_id and (public.can_manage_department(t.supplier_department_id)
 or (t.facilities_id=auth.uid() and public.has_role('facilities')))))))
$$;
create function public.workflow_totals(p_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('acceptedQty',coalesce(sum(r.qty) filter(where r.status='Accepted'),0),
 'allocatedQty',coalesce(sum(r.qty) filter(where r.status='Active'),0),
 'remainingQty',q.requested_qty-coalesce(sum(r.qty) filter(where r.status in ('Active','Accepted')),0))
 from public.resource_requests q left join public.reservations r using(request_id) where q.request_id=p_id group by q.request_id
$$;
create function public.workflow_refresh_request(p_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare totals jsonb:=public.workflow_totals(p_id);
begin
 update public.resource_requests set version=version+1,status=case
 when status in ('Canceled','Closed') then status
 when (totals->>'acceptedQty')::integer=requested_qty then 'Fulfilled'
 when (totals->>'acceptedQty')::integer>0 then 'Partially Fulfilled'
 when (totals->>'allocatedQty')::integer>0 then 'Reserved' else 'Open' end where request_id=p_id;
end $$;
create function public.workflow_suitable(p_request uuid,p_portion uuid,p_condition text default null) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select a.category_id=q.category_id and a.specifications @> q.specifications
 and coalesce(p_condition,s.condition) in ('Excellent','Good','Fair')
 and array_position(array['Excellent','Good','Fair'],coalesce(p_condition,s.condition))
 <=array_position(array['Excellent','Good','Fair'],q.condition)
 from public.resource_requests q,public.stock_portions s join public.assets a using(asset_id)
 where q.request_id=p_request and s.portion_id=p_portion
$$;
create function public.workflow_person(p_id uuid,p_role text,p_department uuid default null) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles p join public.departments d using(department_id)
 join public.user_roles r using(user_id) where p.user_id=p_id and p.active and d.active and r.role=p_role
 and (p_department is null or p.department_id=p_department))
$$;

-- One transaction per command. Internal helpers are never granted to API roles.
-- Every stock mutation locks request -> asset -> portion -> transfer/interest.
create function public.workflow_command(p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor public.profiles:=public.require_active(); action text:=p_input->>'action';
 k uuid:=(p_input->>'operationKey')::uuid; result jsonb;
 q public.resource_requests; i public.interests; s public.stock_portions; a public.assets;
 r public.reservations; t public.transfers; old_value jsonb; new_value jsonb;
 id uuid; allocated uuid; qty integer; reason text:=trim(p_input->>'reason');
 accepted boolean; observed text; location text; holder uuid; totals jsonb; due_date date;
begin
 result:=public.begin_operation(k,'workflow',p_input); if result is not null then return result; end if;
 if action='submitRequest' then
  if not(public.has_role('requester') or public.has_role('representative')) then raise exception 'Forbidden: requester role required'; end if;
  begin due_date:=(p_input->>'requiredDate')::date;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Validation: valid required date required'; end;
  if p_input->>'condition' is null or p_input->>'condition' not in ('Excellent','Good','Fair')
  or p_input->>'urgency' is null or p_input->>'urgency' not in ('Low','Normal','High')
  or not exists(select 1 from public.categories where category_id=(p_input->>'categoryId')::uuid)
  or jsonb_typeof(coalesce(p_input->'specifications','{}')) is distinct from 'object'
  then raise exception 'Validation: known category, suitable condition, urgency and specification object required'; end if;
  if coalesce(p_input->>'qty','') !~ '^[1-9][0-9]*$' or nullif(trim(p_input->>'purpose'),'') is null
  or nullif(trim(p_input->>'destination'),'') is null or (p_input->>'requiredDate') is null
  or due_date<(now() at time zone 'Asia/Dubai')::date then raise exception 'Validation: purpose, positive quantity, destination and current/future required date required'; end if;
  insert into public.resource_requests(requester_id,department_id,category_id,purpose,requested_qty,specifications,condition,urgency,required_date,destination)
  values(actor.user_id,actor.department_id,(p_input->>'categoryId')::uuid,trim(p_input->>'purpose'),(p_input->>'qty')::integer,
   coalesce(p_input->'specifications','{}'),p_input->>'condition',p_input->>'urgency',due_date,trim(p_input->>'destination')) returning * into q;
  perform public.write_audit('request.submitted','request',q.request_id,null,to_jsonb(q),k);
  return public.finish_operation(k,jsonb_build_object('requestId',q.request_id,'version',q.version));
 end if;
 if action in ('recordInterest','closeRequest','cancelRequest') then
  if not public.workflow_request_access((p_input->>'requestId')::uuid,true) then raise exception 'Forbidden: own request or department representative required'; end if;
  select * into q from public.resource_requests where request_id=(p_input->>'requestId')::uuid for update;
 elsif action in ('approveReservation','rejectReservation') then
  select * into i from public.interests where interest_id=(p_input->>'interestId')::uuid;
  select * into q from public.resource_requests where request_id=i.request_id for update;
 else
  select * into t from public.transfers where transfer_id=(p_input->>'transferId')::uuid;
  select * into r from public.reservations where reservation_id=t.reservation_id;
  select * into q from public.resource_requests where request_id=r.request_id for update;
 end if;
 if q.request_id is null then raise exception 'Forbidden: workflow record unavailable'; end if;
 if action in ('closeRequest','cancelRequest') then
  if q.version is distinct from (p_input->>'expectedVersion')::integer then raise exception 'Conflict: stale request version; reload'; end if;
  if q.status in ('Closed','Canceled','Fulfilled') then raise exception 'Conflict: request already terminal'; end if;
  if nullif(reason,'') is null then raise exception 'Validation: reason required'; end if;
  totals:=public.workflow_totals(q.request_id);
  if (totals->>'allocatedQty')::integer<>0 then raise exception 'Conflict: reconcile or cancel active transfers first'; end if;
  if action='cancelRequest' and (totals->>'acceptedQty')::integer<>0 then raise exception 'Conflict: close partially fulfilled need instead'; end if;
  update public.resource_requests set status=case when action='closeRequest' then 'Closed' else 'Canceled' end,version=version+1 where request_id=q.request_id returning to_jsonb(resource_requests.*) into new_value;
  update public.interests set status='Canceled',version=version+1 where request_id=q.request_id and status='Pending';
  perform public.write_audit('request.'||action,'request',q.request_id,to_jsonb(q),new_value||jsonb_build_object('reason',reason),k);
  return public.finish_operation(k,jsonb_build_object('requestId',q.request_id,'version',q.version+1));
 end if;
 if action='recordInterest' then
  if nullif(reason,'') is null then raise exception 'Validation: selection reason required'; end if;
  if q.version is distinct from (p_input->>'expectedVersion')::integer then raise exception 'Conflict: stale request version; reload'; end if;
  if q.status in ('Closed','Canceled','Fulfilled') then raise exception 'Conflict: request no longer open'; end if;
  if coalesce(p_input->>'qty','') !~ '^[1-9][0-9]*$' then raise exception 'Validation: positive whole quantity required'; end if;
  select * into s from public.stock_portions where portion_id=(p_input->>'portionId')::uuid;
  select * into a from public.assets where asset_id=s.asset_id for update;
  select * into s from public.stock_portions where portion_id=s.portion_id for update;
  if s.portion_id is null or not public.can_read_portion(s.portion_id) then raise exception 'Forbidden: listing unavailable'; end if;
  if not s.active or s.state<>'Available' then raise exception 'Conflict: select a current available leaf portion'; end if;
  totals:=public.workflow_totals(q.request_id);
  qty:=(p_input->>'qty')::integer;
  if qty>s.qty or qty>(totals->>'remainingQty')::integer then raise exception 'Conflict: interest exceeds stock or remaining demand'; end if;
  insert into public.interests(request_id,portion_id,created_by,supplier_department_id,qty) values(q.request_id,s.portion_id,actor.user_id,s.owner_department_id,qty) returning * into i;
  perform public.workflow_refresh_request(q.request_id);
  perform public.write_audit('interest.recorded','request',q.request_id,null,to_jsonb(i)||jsonb_build_object('reason',reason),k);
  return public.finish_operation(k,jsonb_build_object('interestId',i.interest_id,'version',i.version));
 end if;
 if action in ('approveReservation','rejectReservation') then
  select * into s from public.stock_portions where portion_id=i.portion_id;
 else
  select * into i from public.interests where interest_id=r.interest_id;
  select * into s from public.stock_portions where portion_id=r.portion_id;
 end if;
 select * into a from public.assets where asset_id=s.asset_id for update;
 select * into s from public.stock_portions where portion_id=s.portion_id for update;
 if action in ('approveReservation','rejectReservation') then
  select * into i from public.interests where interest_id=i.interest_id for update;
  if not public.can_manage_department(i.supplier_department_id) then raise exception 'Forbidden: supplier representative required'; end if;
  if actor.user_id in (q.requester_id,i.created_by) then raise exception 'Forbidden: no self-approval, including multiple roles'; end if;
  if i.version is distinct from (p_input->>'expectedVersion')::integer then raise exception 'Conflict: stale interest version; reload'; end if;
  if i.status<>'Pending' or q.status in ('Closed','Canceled','Fulfilled') then raise exception 'Conflict: interest/request not open'; end if;
  if nullif(reason,'') is null then raise exception 'Validation: decision reason required'; end if;
  if action='rejectReservation' then
   insert into public.approvals(interest_id,actor_id,decision_type,decision,reason) values(i.interest_id,actor.user_id,'Reservation','Rejected',reason);
   update public.interests set status='Rejected',version=version+1 where interest_id=i.interest_id;
   perform public.workflow_refresh_request(q.request_id);
   perform public.write_audit('reservation.rejected','asset',a.asset_id,to_jsonb(i),jsonb_build_object('requestId',q.request_id,'interestId',i.interest_id,'reason',reason),k);
   return public.finish_operation(k,jsonb_build_object('interestId',i.interest_id,'version',i.version+1));
  end if;
  if coalesce(p_input->>'qty','') !~ '^[1-9][0-9]*$' then raise exception 'Validation: positive whole approved quantity required'; end if;
  qty:=(p_input->>'qty')::integer;
  if s.owner_department_id<>i.supplier_department_id or not s.active or s.state<>'Available' or not coalesce(public.workflow_suitable(q.request_id,s.portion_id),false) then raise exception 'Conflict: unavailable, unsuitable or missing mandatory evidence; select current stock'; end if;
  totals:=public.workflow_totals(q.request_id);
  if qty>s.qty or qty>i.qty or qty>(totals->>'remainingQty')::integer then raise exception 'Conflict: insufficient stock or remaining demand'; end if;
  old_value:=to_jsonb(s);
  allocated:=s.portion_id;
  if qty<s.qty then
   update public.stock_portions set active=false where portion_id=s.portion_id;
   insert into public.stock_portions(asset_id,parent_portion_id,qty,state,condition,owner_department_id,custodian_id,assigned_location,holder_id,physical_location,prior_state)
   values(s.asset_id,s.portion_id,qty,'Reserved',s.condition,s.owner_department_id,s.custodian_id,s.assigned_location,s.holder_id,s.physical_location,'Available') returning portion_id into allocated;
   insert into public.stock_portions(asset_id,parent_portion_id,qty,state,condition,owner_department_id,custodian_id,assigned_location,holder_id,physical_location)
   values(s.asset_id,s.portion_id,s.qty-qty,'Available',s.condition,s.owner_department_id,s.custodian_id,s.assigned_location,s.holder_id,s.physical_location);
  else update public.stock_portions set state='Reserved',prior_state='Available' where portion_id=s.portion_id;
  end if;
  insert into public.reservations(interest_id,request_id,source_portion_id,portion_id,qty) values(i.interest_id,q.request_id,i.portion_id,allocated,qty) returning * into r;
  insert into public.transfers(reservation_id,supplier_department_id,receiver_department_id,approved_qty) values(r.reservation_id,s.owner_department_id,q.department_id,qty) returning * into t;
  insert into public.approvals(interest_id,reservation_id,actor_id,decision_type,decision,reason) values(i.interest_id,r.reservation_id,actor.user_id,'Reservation','Approved',reason);
  update public.interests set status='Approved',version=version+1 where interest_id=i.interest_id;
  update public.assets set version=version+1 where asset_id=a.asset_id;
  perform public.workflow_refresh_request(q.request_id);
  perform public.write_audit('reservation.approved','asset',a.asset_id,old_value,to_jsonb(r)||jsonb_build_object('transferId',t.transfer_id,'reason',reason),k);
  return public.finish_operation(k,jsonb_build_object('transferId',t.transfer_id,'reservationId',r.reservation_id,'version',t.version));
 end if;
 select * into t from public.transfers where transfer_id=t.transfer_id for update;
 if not (public.workflow_request_access(q.request_id,true) or public.can_manage_department(t.supplier_department_id)
 or (t.facilities_id=actor.user_id and public.has_role('facilities'))) then raise exception 'Forbidden: transfer scope'; end if;
 if t.version is distinct from (p_input->>'expectedVersion')::integer then raise exception 'Conflict: stale transfer version; reload'; end if;
 if nullif(reason,'') is null then raise exception 'Validation: action reason required'; end if;
 old_value:=jsonb_build_object('transfer',to_jsonb(t),'portion',to_jsonb(s),'reservation',to_jsonb(r));
 if action in ('approveRelease','rejectRelease') then
  if not public.can_manage_department(t.supplier_department_id) then raise exception 'Forbidden: supplier representative required'; end if;
  if actor.user_id in (q.requester_id,i.created_by) then raise exception 'Forbidden: no self-approval, including multiple roles'; end if;
  if t.state<>'Pending Approval' then raise exception 'Conflict: release already decided'; end if;
  if action='approveRelease' then
   if s.state<>'Reserved' or not coalesce(public.workflow_suitable(q.request_id,s.portion_id),false) or q.required_date<(now() at time zone 'Asia/Dubai')::date then raise exception 'Conflict: unsuitable stock or required date has passed'; end if;
   if not public.workflow_person((p_input->>'facilitiesId')::uuid,'facilities') then raise exception 'Validation: active Facilities assignee required'; end if;
   update public.transfers set state='Approved',facilities_id=(p_input->>'facilitiesId')::uuid where transfer_id=t.transfer_id;
  end if;
  insert into public.approvals(transfer_id,actor_id,decision_type,decision,reason) values(t.transfer_id,actor.user_id,'Release',case when action='approveRelease' then 'Approved' else 'Rejected' end,reason);
 end if;
 if action in ('cancelTransfer','rejectRelease') then
  if action='cancelTransfer' and not(public.workflow_request_access(q.request_id,true) or public.can_manage_department(t.supplier_department_id)) then raise exception 'Forbidden: requester or representative required'; end if;
  if t.state not in ('Pending Approval','Approved','Scheduled') then raise exception 'Conflict: moved stock cannot be canceled'; end if;
  update public.transfers set state='Canceled' where transfer_id=t.transfer_id;
  update public.reservations set status='Released' where reservation_id=r.reservation_id;
  update public.stock_portions set state=case when state<>'Reserved' then state when condition in ('Excellent','Good','Fair') then coalesce(prior_state,'Available') when condition='Unknown' then 'Registered' else 'Unfit' end where portion_id=s.portion_id;
 elsif action='schedule' then
  if t.facilities_id is distinct from actor.user_id or not public.has_role('facilities') then raise exception 'Forbidden: assigned Facilities only'; end if;
  if t.state not in ('Approved','Scheduled') then raise exception 'Conflict: approved release required'; end if;
  if (p_input->>'scheduledAt') is null or (p_input->>'scheduledAt')::timestamptz<now()
  or ((p_input->>'scheduledAt')::timestamptz at time zone 'Asia/Dubai')::date>q.required_date
  or nullif(trim(p_input->>'arrangements'),'') is null then raise exception 'Validation: future slot before required date and arrangements required'; end if;
  update public.transfers set state='Scheduled',scheduled_at=(p_input->>'scheduledAt')::timestamptz,arrangements=trim(p_input->>'arrangements'),handling_cost=(p_input->>'handlingCost')::numeric,transport_cost=(p_input->>'transportCost')::numeric where transfer_id=t.transfer_id;
 elsif action='dispatch' then
  if t.facilities_id is distinct from actor.user_id or not public.has_role('facilities') then raise exception 'Forbidden: assigned Facilities only'; end if;
  if t.state<>'Scheduled' or s.state<>'Reserved' or not coalesce(public.workflow_suitable(q.request_id,s.portion_id),false) then raise exception 'Conflict: scheduled suitable stock required'; end if;
  if (p_input->>'qty')::integer is distinct from t.approved_qty then raise exception 'Validation: dispatch full approved quantity'; end if;
  location:=trim(p_input->>'location');
  if nullif(location,'') is null then raise exception 'Validation: physical location required'; end if;
  update public.stock_portions set state='In Transfer',holder_id=actor.user_id,physical_location=location where portion_id=s.portion_id;
  update public.transfers set state='In Transit' where transfer_id=t.transfer_id;
  insert into public.handovers(transfer_id,recorded_by,kind,qty,condition,accepted,holder_id,location,reason)
  values(t.transfer_id,actor.user_id,'Dispatch',t.approved_qty,s.condition,true,actor.user_id,location,reason);
 elsif action in ('receive','reconcile','confirmReturn') then
  if action='confirmReturn' then
   if not public.can_manage_department(t.supplier_department_id) then raise exception 'Forbidden: supplier confirms return'; end if;
   if t.state<>'Disputed' then raise exception 'Conflict: disputed transfer required for return'; end if;
  else
   if not public.can_manage_department(t.receiver_department_id) then raise exception 'Forbidden: receiving representative required'; end if;
   if (action='receive' and t.state<>'In Transit') or (action='reconcile' and t.state<>'Disputed') then raise exception 'Conflict: receipt/reconciliation state'; end if;
  end if;
  if coalesce(p_input->>'qty','') !~ '^[0-9]+$' then raise exception 'Validation: nonnegative observed whole quantity required'; end if;
  qty:=(p_input->>'qty')::integer; observed:=p_input->>'condition'; location:=trim(p_input->>'location');
  if qty>t.approved_qty or nullif(location,'') is null or observed is null or observed not in ('Excellent','Good','Fair','Poor','Unknown') then raise exception 'Validation: bounded observation, condition and location required'; end if;
  if action='confirmReturn' and qty<>t.approved_qty then raise exception 'Conflict: full physically reconciled return required; unresolved stock stays allocated'; end if;
  accepted:=action<>'confirmReturn' and coalesce((p_input->>'accept')::boolean,false) and qty=t.approved_qty and coalesce(public.workflow_suitable(q.request_id,s.portion_id,observed),false);
  if action='reconcile' and not accepted then raise exception 'Conflict: reconciled full suitable acceptance required'; end if;
  -- Observation authority and physical possession are different facts. Permit
  -- only current participants, never a browser-supplied arbitrary identity.
  holder:=coalesce((p_input->>'holderId')::uuid,actor.user_id);
  if holder<>actor.user_id and not
   (holder=t.facilities_id and public.workflow_person(holder,'facilities'))
   and not public.workflow_person(holder,'representative',t.supplier_department_id)
   and not public.workflow_person(holder,'representative',t.receiver_department_id)
   and not public.workflow_person(holder,'requester',t.receiver_department_id)
   then raise exception 'Forbidden: physical holder must be an active transfer participant'; end if;
  insert into public.handovers(transfer_id,recorded_by,kind,qty,condition,accepted,holder_id,location,reason)
  values(t.transfer_id,actor.user_id,case when action='confirmReturn' then 'Return' when action='reconcile' then 'Reconciliation' else 'Receipt' end,qty,observed,accepted,holder,location,reason);
  if accepted then
   update public.transfers set state='Completed' where transfer_id=t.transfer_id;
   update public.reservations set status='Accepted' where reservation_id=r.reservation_id;
   update public.stock_portions set state='In Use',condition=observed,owner_department_id=t.receiver_department_id,custodian_id=actor.user_id,assigned_location=location,holder_id=holder,physical_location=location,prior_state=null where portion_id=s.portion_id;
  elsif action='confirmReturn' then
   update public.transfers set state='Returned' where transfer_id=t.transfer_id;
   update public.reservations set status='Released' where reservation_id=r.reservation_id;
   update public.stock_portions set condition=observed,state=case when observed in ('Excellent','Good','Fair') then 'Available' when observed='Unknown' then 'Registered' else 'Unfit' end,holder_id=holder,physical_location=location where portion_id=s.portion_id;
  else
   update public.transfers set state='Disputed' where transfer_id=t.transfer_id;
   update public.stock_portions set condition=observed,holder_id=holder,physical_location=location where portion_id=s.portion_id;
  end if;
 elsif action not in ('approveRelease','rejectRelease','cancelTransfer','schedule','dispatch') then
  raise exception 'Validation: unknown workflow action';
 end if;
 update public.transfers set version=version+1,tracking_snapshot=case when state in ('Completed','Canceled','Returned') then
  (select jsonb_build_object('ownerDepartmentId',sp.owner_department_id,'custodianId',sp.custodian_id,'holderId',sp.holder_id,'assignedLocation',sp.assigned_location,'physicalLocation',sp.physical_location,'condition',sp.condition) from public.stock_portions sp where sp.portion_id=s.portion_id)
  else tracking_snapshot end where transfer_id=t.transfer_id;
 update public.assets set version=version+1 where asset_id=a.asset_id;
 perform public.workflow_refresh_request(q.request_id);
 select jsonb_build_object('transfer',to_jsonb(tr),'portion',to_jsonb(sp),'reason',reason) into new_value from public.transfers tr,public.stock_portions sp where tr.transfer_id=t.transfer_id and sp.portion_id=s.portion_id;
 perform public.write_audit('transfer.'||action,'asset',a.asset_id,old_value,new_value,k);
 return public.finish_operation(k,jsonb_build_object('transferId',t.transfer_id,'version',t.version+1));
end $$;

-- Permission-scoped workflow projection. No financial asset metadata is exposed.
create function public.workflow_workspace() returns jsonb
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
 'transfers',(select coalesce(jsonb_agg(jsonb_build_object('transferId',t.transfer_id,'reservationId',t.reservation_id,'requestId',t.request_id,'interestId',t.interest_id,'portionId',t.portion_id,'supplierDepartmentId',t.supplier_department_id,'receiverDepartmentId',t.receiver_department_id,'qty',t.approved_qty,'state',t.state,'version',t.version,'facilitiesId',t.facilities_id,'scheduledAt',t.scheduled_at,'arrangements',t.arrangements,'handlingCost',t.handling_cost,'transportCost',t.transport_cost,'assetName',a.name,'assetId',a.asset_id,
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
 )),'[]') from permitted_transfers t join public.stock_portions s using(portion_id) join public.assets a using(asset_id)),
 'decisions',(select coalesce(jsonb_agg(to_jsonb(ap) order by ap.decided_at),'[]') from public.approvals ap where ap.interest_id in (select interest_id from permitted_interests)),
 'facilities',(select coalesce(jsonb_agg(jsonb_build_object('userId',p.user_id,'name',p.name)),'[]') from public.profiles p where public.workflow_person(p.user_id,'facilities') and (public.has_role('representative') or public.has_role('facilities'))),
 'history',(select coalesce(jsonb_agg(jsonb_build_object('auditId',l.audit_id,'actorId',l.actor_id,'event',l.event,'occurredAt',l.occurred_at,'before',l.before_data,'after',l.after_data) order by l.occurred_at desc),'[]') from public.audit_logs l where
 (l.target_type='request' and l.target_id in (select request_id from permitted_requests) and public.workflow_request_access(l.target_id,true))
 or (l.target_type='asset' and (l.event like 'transfer.%' or l.event like 'reservation.%') and
 ((l.after_data->'transfer'->>'transfer_id')::uuid in (select transfer_id from permitted_transfers)
 or (l.after_data->>'transferId')::uuid in (select transfer_id from permitted_transfers)
 or (l.after_data->>'interestId')::uuid in (select interest_id from permitted_interests))))) into result;
 return result;
end $$;
revoke all on function public.workflow_request_access(uuid,boolean),public.workflow_totals(uuid),public.workflow_refresh_request(uuid),public.workflow_suitable(uuid,uuid,text),public.workflow_person(uuid,text,uuid),public.workflow_command(jsonb),public.workflow_workspace() from public,anon,authenticated;
grant execute on function public.workflow_command(jsonb),public.workflow_workspace() to authenticated;

-- Part 1 used the first visible portion for an asset. After a batch split the
-- selected leaf must remain selected; the legacy one-argument RPC stays intact.
create function public.asset_detail(p_asset_id uuid,p_portion_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare item jsonb; hist jsonb:='[]';
begin
 perform public.require_active();
 if not exists(select 1 from public.stock_portions where portion_id=p_portion_id and asset_id=p_asset_id and active)
 or not public.can_read_portion(p_portion_id) then raise exception 'Forbidden: selected portion unavailable'; end if;
 item:=public.search_assets(jsonb_build_object('assetId',p_asset_id,'limit',1,'offset',
  (select count(*) from public.stock_portions s where s.asset_id=p_asset_id and s.active and public.can_read_portion(s.portion_id) and s.portion_id<p_portion_id)))->0;
 if item->>'portionId' is distinct from p_portion_id::text then raise exception 'Conflict: selected portion changed; reload catalogue'; end if;
 if item is null then raise exception 'Conflict: selected portion changed; reload catalogue'; end if;
 if public.asset_access(p_asset_id,true) or public.has_role('business_administrator') or (public.has_role('finance') and public.can_read_finance(p_asset_id)) then hist:=public.list_asset_audit(p_asset_id); end if;
 return jsonb_build_object('asset',item,'history',hist);
end $$;
revoke all on function public.asset_detail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.asset_detail(uuid,uuid) to authenticated;
