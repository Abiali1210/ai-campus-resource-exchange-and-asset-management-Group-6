-- Part 1: C1-C3 account, role and catalogue foundation for the Phase 6 minimum.
-- No user-controlled role/department is trusted as authorization.
revoke create on schema public from public;

create table public.departments (
  department_id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  active boolean not null default true,
  unique(name)
);
create table public.roles (role text primary key);
insert into public.roles values
 ('requester'),('representative'),('business_administrator'),('maintenance'),
 ('facilities'),('procurement'),('finance'),('sustainability'),('system_administrator');
create table public.profiles (
  user_id uuid primary key references auth.users(id),
  department_id uuid not null references public.departments,
  name text not null check (length(trim(name)) between 1 and 120),
  active boolean not null default true
);
create table public.user_roles (
  user_id uuid references public.profiles,
  role text references public.roles,
  primary key(user_id,role)
);
create table public.categories (
  category_id uuid primary key default gen_random_uuid(),
  parent_category_id uuid references public.categories,
  name text not null unique check(length(trim(name)) between 1 and 120)
);
create table public.assets (
  asset_id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 1 and 200),
  description text not null default '' check(length(description)<=10000),
  category_id uuid not null references public.categories,
  specifications jsonb not null default '{}' check(jsonb_typeof(specifications)='object'),
  tags jsonb not null default '[]' check(jsonb_typeof(tags)='array'),
  materials jsonb not null default '[]' check(jsonb_typeof(materials)='array'),
  tracking_mode text not null check(tracking_mode in ('individual','batch')),
  total_qty integer not null check(total_qty>0),
  purchase_date date,
  unit_value numeric(14,2) check(unit_value>=0 and unit_value<>'NaN'::numeric),
  unit_mass_kg numeric(12,4) check(unit_mass_kg>0 and unit_mass_kg<>'NaN'::numeric),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  check(tracking_mode<>'individual' or total_qty=1)
);
create table public.stock_portions (
  portion_id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets,
  parent_portion_id uuid references public.stock_portions,
  qty integer not null check(qty>0),
  active boolean not null default true,
  state text not null default 'Registered' check(state in ('Registered','In Use','Available','Reserved','In Transfer','Under Maintenance','Unfit','Pending End-of-Life','Retired','Donated','Recycled','Dismantled','Disposed')),
  condition text not null default 'Unknown' check(condition in ('Excellent','Good','Fair','Poor','Unknown')),
  owner_department_id uuid not null references public.departments,
  custodian_id uuid not null references public.profiles,
  assigned_location text not null check(length(trim(assigned_location)) between 1 and 200),
  holder_id uuid references public.profiles,
  physical_location text not null,
  prior_state text
);
create index stock_asset_idx on public.stock_portions(asset_id);
create index stock_scope_idx on public.stock_portions(owner_department_id,state) where active;
create table public.audit_logs (
  audit_id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles,
  event text not null,
  target_type text not null,
  target_id uuid not null,
  occurred_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb,
  operation_key uuid
);
create table public.committed_events (
  event_id uuid primary key default gen_random_uuid(),
  event text not null,
  target_type text not null,
  target_id uuid not null,
  actor_id uuid not null references public.profiles,
  occurred_at timestamptz not null default now(),
  operation_key uuid,
  scope jsonb not null default '{}'
);
create table public.operation_results (
  user_id uuid not null references public.profiles,
  operation_key uuid not null,
  kind text not null,
  input_hash text not null,
  result jsonb,
  primary key(user_id,operation_key)
);

create function public.check_stock_conservation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare aid uuid; total integer; actual bigint;
begin
 aid:=case when TG_OP='DELETE' then old.asset_id else new.asset_id end;
 select total_qty into total from public.assets where asset_id=aid;
 if not found then return null; end if;
 select coalesce(sum(qty),0) into actual from public.stock_portions where asset_id=aid and active;
 if actual<>total then raise exception 'Conflict: active stock quantity must equal asset total'; end if;
 if exists(select 1 from public.stock_portions c join public.stock_portions p on p.portion_id=c.parent_portion_id where c.asset_id=aid and c.active and (p.active or p.asset_id<>c.asset_id)) then raise exception 'Conflict: active portions must be homogeneous leaves of their own asset'; end if;
 return null;
end $$;
create constraint trigger stock_conservation after insert or update or delete on public.stock_portions deferrable initially deferred for each row execute function public.check_stock_conservation();
create constraint trigger asset_conservation after insert or update on public.assets deferrable initially deferred for each row execute function public.check_stock_conservation();

-- All ordinary access goes through the explicit caller-scoped RPC projections.
-- In particular, granting SELECT assets would expose unit_value to marketplace users.
do $$ declare t text; begin
 foreach t in array array['departments','roles','profiles','user_roles','categories','assets','stock_portions','audit_logs','committed_events','operation_results'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
end $$;

create function public.require_active() returns public.profiles
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles;
begin
 select pr.* into p from public.profiles pr join public.departments d using(department_id)
 where pr.user_id=auth.uid() and pr.active and d.active;
 if not found then raise exception 'Unauthorized: active account required'; end if;
 return p;
end $$;
create function public.has_role(p_role text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.user_roles r join public.profiles p using(user_id)
 join public.departments d using(department_id)
 where r.user_id=auth.uid() and r.role=p_role and p.active and d.active)
$$;
create function public.can_manage_department(p_department_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('representative') and exists(select 1 from public.profiles p
 where p.user_id=auth.uid() and p.department_id=p_department_id)
$$;
create function public.can_read_portion(p_portion_id uuid) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles; s public.stock_portions;
begin
 p:=public.require_active();
 select * into s from public.stock_portions where portion_id=p_portion_id;
 if not found then return false; end if;
 if public.can_manage_department(s.owner_department_id) or public.has_role('business_administrator') then return true; end if;
 if s.state='Available' and s.active and (public.has_role('requester') or public.has_role('representative')) then return true; end if;
 if s.owner_department_id=p.department_id and (public.has_role('procurement') or public.has_role('finance') or public.has_role('sustainability')) then return true; end if;
 if s.holder_id=p.user_id and (public.has_role('maintenance') or public.has_role('facilities')) then return true; end if;
 return false;
end $$;
create function public.asset_access(p_asset_id uuid,p_write boolean default false) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles;
begin
 p:=public.require_active();
 if p_write then
  return exists(select 1 from public.stock_portions s where s.asset_id=p_asset_id and s.active)
   and not exists(select 1 from public.stock_portions s where s.asset_id=p_asset_id and s.active and not public.can_manage_department(s.owner_department_id));
 end if;
 return exists(select 1 from public.stock_portions s where s.asset_id=p_asset_id and s.active and public.can_read_portion(s.portion_id));
end $$;
create function public.can_read_finance(p_asset_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('business_administrator') or exists(select 1 from public.stock_portions s join public.profiles p on p.user_id=auth.uid()
 where s.asset_id=p_asset_id and s.active and s.owner_department_id=p.department_id
 and (public.has_role('representative') or public.has_role('finance')))
$$;
create function public.write_audit(p_event text,p_target_type text,p_target_id uuid,p_before jsonb,p_after jsonb,p_operation_key uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.audit_logs(actor_id,event,target_type,target_id,before_data,after_data,operation_key)
 values(auth.uid(),p_event,p_target_type,p_target_id,p_before,p_after,p_operation_key);
 insert into public.committed_events(actor_id,event,target_type,target_id,operation_key)
 values(auth.uid(),p_event,p_target_type,p_target_id,p_operation_key);
end $$;
create function public.begin_operation(p_key uuid,p_kind text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.operation_results; h text;
begin
 perform public.require_active();
 if p_key is null then raise exception 'Validation: operationKey required'; end if;
 h:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
 insert into public.operation_results(user_id,operation_key,kind,input_hash) values(auth.uid(),p_key,p_kind,h) on conflict do nothing;
 select * into r from public.operation_results where user_id=auth.uid() and operation_key=p_key for update;
 if r.kind<>p_kind or r.input_hash<>h then raise exception 'Conflict: operation key reused for different input'; end if;
 return r.result;
end $$;
create function public.finish_operation(p_key uuid,p_result jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.operation_results set result=p_result where user_id=auth.uid() and operation_key=p_key;
 return p_result;
end $$;

create function public.foundation_bootstrap() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles; role_list jsonb; user_list jsonb:='[]';
begin
 p:=public.require_active();
 select coalesce(jsonb_agg(r.role order by r.role),'[]') into role_list from public.user_roles r where r.user_id=p.user_id;
 if public.has_role('system_administrator') then
  select coalesce(jsonb_agg(jsonb_build_object('userId',u.user_id,'departmentId',u.department_id,'name',u.name,'active',u.active,
   'roles',(select coalesce(jsonb_agg(r.role order by r.role),'[]') from public.user_roles r where r.user_id=u.user_id)) order by u.name),'[]') into user_list from public.profiles u;
 end if;
 return jsonb_build_object('profile',jsonb_build_object('userId',p.user_id,'departmentId',p.department_id,'name',p.name,'active',p.active,'roles',role_list),
 'departments',(select coalesce(jsonb_agg(jsonb_build_object('departmentId',d.department_id,'name',d.name,'active',d.active) order by d.name),'[]') from public.departments d),
 'categories',(select coalesce(jsonb_agg(jsonb_build_object('categoryId',c.category_id,'parentCategoryId',c.parent_category_id,'name',c.name) order by c.name),'[]') from public.categories c),
 'custodians',(select coalesce(jsonb_agg(jsonb_build_object('userId',u.user_id,'name',u.name,'departmentId',u.department_id) order by u.name),'[]') from public.profiles u where u.active and u.department_id=p.department_id and exists(select 1 from public.user_roles r where r.user_id=u.user_id and r.role='representative')),
 'profiles',case when public.has_role('system_administrator') then user_list else (select coalesce(jsonb_agg(jsonb_build_object('userId',u.user_id,'departmentId',u.department_id,'name',u.name,'active',u.active,'roles',jsonb_build_array('representative')) order by u.name),'[]') from public.profiles u where u.active and u.department_id=p.department_id and public.has_role('representative') and exists(select 1 from public.user_roles r where r.user_id=u.user_id and r.role='representative')) end,'users',user_list);
end $$;

create function public.search_assets(p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles; result jsonb;
begin
 p:=public.require_active();
 if (p_filters ? 'minValue' or p_filters ? 'maxValue') and not(public.has_role('representative') or public.has_role('finance') or public.has_role('business_administrator')) then raise exception 'Forbidden: financial filter not permitted'; end if;
 select coalesce(jsonb_agg(item order by item->>'name',item->>'portionId'),'[]') into result from (
 select jsonb_build_object('assetId',a.asset_id,'portionId',s.portion_id,'name',a.name,'description',a.description,
 'categoryId',a.category_id,'categoryName',c.name,'specifications',a.specifications,'tags',a.tags,'materials',a.materials,
 'trackingMode',a.tracking_mode,'totalQty',a.total_qty,'qty',s.qty,'state',s.state,'condition',s.condition,
 'ownerDepartmentId',s.owner_department_id,'departmentName',d.name,'custodianId',s.custodian_id,
 'assignedLocation',s.assigned_location,'physicalLocation',s.physical_location,'holderId',s.holder_id,
 'purchaseDate',a.purchase_date,'unitMassKg',a.unit_mass_kg,'version',a.version,'canEdit',public.asset_access(a.asset_id,true))
 || case when public.can_read_finance(a.asset_id) then jsonb_build_object('unitValue',a.unit_value) else '{}'::jsonb end as item
 from public.assets a join public.stock_portions s using(asset_id)
 left join public.categories c using(category_id) join public.departments d on d.department_id=s.owner_department_id
 where s.active and public.can_read_portion(s.portion_id)
 and (nullif(p_filters->>'assetId','') is null or a.asset_id=(p_filters->>'assetId')::uuid)
 and (not coalesce((p_filters->>'marketplaceOnly')::boolean,false) or s.state='Available')
 and (not coalesce((p_filters->>'ownOnly')::boolean,(p_filters->>'own')::boolean,false) or s.owner_department_id=p.department_id)
 and (nullif(p_filters->>'keyword','') is null or (a.name||' '||a.description||' '||a.tags::text) ilike '%'||(p_filters->>'keyword')||'%')
 and (nullif(p_filters->>'categoryId','') is null or a.category_id=(p_filters->>'categoryId')::uuid)
 and (nullif(p_filters->>'departmentId','') is null or s.owner_department_id=(p_filters->>'departmentId')::uuid)
 and (nullif(p_filters->>'condition','') is null or s.condition=p_filters->>'condition')
 and (nullif(p_filters->>'state','') is null or s.state=p_filters->>'state')
 and (lower(coalesce(p_filters->>'availability',''))<>'available' or s.state='Available')
 and (nullif(p_filters->>'minAge','') is null or (current_date-a.purchase_date)/365.25>=(p_filters->>'minAge')::numeric)
 and (nullif(p_filters->>'maxAge','') is null or (current_date-a.purchase_date)/365.25<=(p_filters->>'maxAge')::numeric)
 and (nullif(p_filters->>'location','') is null or s.assigned_location ilike '%'||(p_filters->>'location')||'%')
 and (nullif(p_filters->>'minQty','') is null or s.qty>=(p_filters->>'minQty')::integer)
 and (nullif(p_filters->>'maxAgeYears','') is null or a.purchase_date>=current_date-make_interval(years=>(p_filters->>'maxAgeYears')::integer))
 and (nullif(p_filters->>'minValue','') is null or (public.can_read_finance(a.asset_id) and a.unit_value>=(p_filters->>'minValue')::numeric))
 and (nullif(p_filters->>'maxValue','') is null or (public.can_read_finance(a.asset_id) and a.unit_value<=(p_filters->>'maxValue')::numeric))
 order by a.name,s.portion_id limit least(greatest(coalesce((p_filters->>'limit')::integer,100),1),200)
 offset greatest(coalesce((p_filters->>'offset')::integer,0),0)
 ) q;
 return result;
end $$;

create function public.save_department(p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare id uuid:=coalesce((p_input->>'departmentId')::uuid,gen_random_uuid()); old jsonb; result jsonb; k uuid:=(p_input->>'operationKey')::uuid;
begin
 perform public.require_active();
 if not public.has_role('system_administrator') then raise exception 'Forbidden: technical administrator required'; end if;
 result:=public.begin_operation(k,'saveDepartment',p_input); if result is not null then return result; end if;
 select to_jsonb(d) into old from public.departments d where department_id=id for update;
 if length(trim(coalesce(p_input->>'name','')))=0 then raise exception 'Validation: name required'; end if;
 if id=(select department_id from public.profiles where user_id=auth.uid()) and not coalesce((p_input->>'active')::boolean,true) then raise exception 'Conflict: cannot deactivate own active administration department'; end if;
 insert into public.departments(department_id,name,active) values(id,trim(p_input->>'name'),coalesce((p_input->>'active')::boolean,true))
 on conflict(department_id) do update set name=excluded.name,active=excluded.active;
 perform public.write_audit('department.saved','department',id,old,p_input-'operationKey',k);
 return public.finish_operation(k,jsonb_build_object('departmentId',id,'name',trim(p_input->>'name'),'active',coalesce((p_input->>'active')::boolean,true)));
end $$;
create function public.save_profile(p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare id uuid:=(p_input->>'userId')::uuid; dep uuid:=(p_input->>'departmentId')::uuid; k uuid:=(p_input->>'operationKey')::uuid; old jsonb; result jsonb;
begin
 perform public.require_active();
 if not public.has_role('system_administrator') then raise exception 'Forbidden: technical administrator required'; end if;
 result:=public.begin_operation(k,'saveProfile',p_input); if result is not null then return result; end if;
 if id is null or dep is null or length(trim(coalesce(p_input->>'name','')))=0 or coalesce(jsonb_typeof(p_input->'roles'),'null')<>'array' then raise exception 'Validation: profile fields and roles required'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_input->'roles') r where not exists(select 1 from public.roles x where x.role=r.value)) then raise exception 'Validation: unknown role'; end if;
 if not exists(select 1 from public.departments where department_id=dep and active) then raise exception 'Validation: active department required'; end if;
 -- Serialize administrator edits so the final active technical administrator survives.
 lock table public.user_roles in share row exclusive mode;
 select to_jsonb(p) into old from public.profiles p where user_id=id for update;
 if id=auth.uid() and (not coalesce((p_input->>'active')::boolean,true) or not (p_input->'roles' ? 'system_administrator')) then raise exception 'Conflict: cannot deactivate or remove own administrator role'; end if;
 insert into public.profiles(user_id,department_id,name,active) values(id,dep,trim(p_input->>'name'),coalesce((p_input->>'active')::boolean,true))
 on conflict(user_id) do update set department_id=excluded.department_id,name=excluded.name,active=excluded.active;
 delete from public.user_roles where user_id=id;
 insert into public.user_roles(user_id,role) select distinct id,value from jsonb_array_elements_text(p_input->'roles');
 perform public.write_audit('profile.saved','profile',id,old,p_input-'operationKey',k);
 return public.finish_operation(k,jsonb_build_object('userId',id,'departmentId',dep,'name',trim(p_input->>'name'),'active',coalesce((p_input->>'active')::boolean,true),'roles',p_input->'roles'));
end $$;

create function public.save_asset(p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare id uuid:=coalesce((p_input->>'assetId')::uuid,gen_random_uuid()); dep uuid:=(p_input->>'ownerDepartmentId')::uuid;
 cust uuid:=(p_input->>'custodianId')::uuid; k uuid:=(p_input->>'operationKey')::uuid; result jsonb; old public.assets;
 q integer; v integer; s public.stock_portions;
begin
 perform public.require_active();
 if not public.can_manage_department(dep) then raise exception 'Forbidden: owning department representative required'; end if;
 result:=public.begin_operation(k,'saveAsset',p_input); if result is not null then return result; end if;
 if nullif(trim(p_input->>'name'),'') is null or nullif(trim(p_input->>'assignedLocation'),'') is null then raise exception 'Validation: name and assignedLocation required'; end if;
 if nullif(p_input->>'categoryId','') is null or not exists(select 1 from public.categories where category_id=(p_input->>'categoryId')::uuid) then raise exception 'Validation: known categoryId required'; end if;
 if coalesce(p_input->>'totalQty','') !~ '^[1-9][0-9]*$' then raise exception 'Validation: totalQty must be a positive integer'; end if;
 q:=(p_input->>'totalQty')::integer;
 if not exists(select 1 from public.profiles p join public.user_roles r using(user_id) where p.user_id=cust and p.department_id=dep and p.active and r.role='representative') then raise exception 'Validation: active department custodian required'; end if;
 if not exists(select 1 from public.departments where department_id=dep and active) then raise exception 'Validation: active department required'; end if;
 if (p_input->>'purchaseDate')::date>current_date then raise exception 'Validation: purchaseDate cannot be future'; end if;
 if jsonb_typeof(coalesce(p_input->'specifications','{}'))<>'object' or jsonb_typeof(coalesce(p_input->'tags','[]'))<>'array' or jsonb_typeof(coalesce(p_input->'materials','[]'))<>'array' then raise exception 'Validation: invalid metadata structure'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_input->'tags','[]')) x where jsonb_typeof(x)<>'string') or exists(select 1 from jsonb_array_elements(coalesce(p_input->'materials','[]')) x where jsonb_typeof(x)<>'string') then raise exception 'Validation: tags/materials must contain text'; end if;
 select * into old from public.assets where asset_id=id for update;
 if found then
  if not public.asset_access(id,true) then raise exception 'Forbidden: asset scope'; end if;
  if old.version<>coalesce((p_input->>'expectedVersion')::integer,0) then raise exception 'Conflict: asset was changed; reload before editing'; end if;
  if (select count(*) from public.stock_portions where asset_id=id and active)<>1 then raise exception 'Conflict: split stock requires workflow-aware editing'; end if;
  select * into s from public.stock_portions where asset_id=id and active for update;
  if s.state not in ('Registered','In Use','Available') then raise exception 'Conflict: active workflow or condition blocks editing'; end if;
  -- The ordinary catalogue cannot certify condition or change assigned custody.
  if s.owner_department_id<>dep or s.custodian_id<>cust or s.condition<>coalesce(p_input->>'condition','Unknown') then raise exception 'Conflict: custody and condition updates require their authorized workflow'; end if;
  if old.total_qty<>q or old.tracking_mode<>p_input->>'trackingMode' then raise exception 'Conflict: tracked quantity cannot be rewritten after registration'; end if;
  v:=old.version+1;
  update public.assets set name=trim(p_input->>'name'),description=coalesce(p_input->>'description',''),category_id=(p_input->>'categoryId')::uuid,
   specifications=coalesce(p_input->'specifications','{}'),tags=coalesce(p_input->'tags','[]'),materials=coalesce(p_input->'materials','[]'),purchase_date=(p_input->>'purchaseDate')::date,
   unit_value=(p_input->>'unitValue')::numeric,unit_mass_kg=(p_input->>'unitMassKg')::numeric,version=v where asset_id=id;
  update public.stock_portions set assigned_location=trim(p_input->>'assignedLocation') where portion_id=s.portion_id;
 else
  v:=1;
  insert into public.assets(asset_id,name,description,category_id,specifications,tags,materials,tracking_mode,total_qty,purchase_date,unit_value,unit_mass_kg)
  values(id,trim(p_input->>'name'),coalesce(p_input->>'description',''),(p_input->>'categoryId')::uuid,coalesce(p_input->'specifications','{}'),coalesce(p_input->'tags','[]'),coalesce(p_input->'materials','[]'),p_input->>'trackingMode',q,(p_input->>'purchaseDate')::date,(p_input->>'unitValue')::numeric,(p_input->>'unitMassKg')::numeric);
  insert into public.stock_portions(asset_id,qty,owner_department_id,custodian_id,assigned_location,holder_id,physical_location,condition)
  values(id,q,dep,cust,trim(p_input->>'assignedLocation'),cust,trim(p_input->>'assignedLocation'),coalesce(p_input->>'condition','Unknown'));
 end if;
 perform public.write_audit('asset.saved','asset',id,to_jsonb(old),(select to_jsonb(a) from public.assets a where a.asset_id=id),k);
 return public.finish_operation(k,public.asset_detail(id)->'asset');
end $$;

create function public.set_publication(p_asset_id uuid,p_expected_version integer,p_publish boolean,p_operation_key uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.assets; result jsonb; before_value jsonb; wanted text;
begin
 perform public.require_active();
 if not public.asset_access(p_asset_id,true) then raise exception 'Forbidden: asset scope'; end if;
 result:=public.begin_operation(p_operation_key,'publication',jsonb_build_object('assetId',p_asset_id,'expectedVersion',p_expected_version,'publish',p_publish)); if result is not null then return result; end if;
 select * into a from public.assets where asset_id=p_asset_id for update;
 if a.version<>p_expected_version then raise exception 'Conflict: asset was changed'; end if;
 if p_publish is null then raise exception 'Validation: declared publication required'; end if;
 if exists(select 1 from public.stock_portions where asset_id=p_asset_id and active and state not in ('Registered','In Use','Available')) then raise exception 'Conflict: unavailable stock or active workflow'; end if;
 if not p_publish and exists(select 1 from public.stock_portions where asset_id=p_asset_id and active and state<>'Available') then raise exception 'Conflict: only available stock can be withdrawn'; end if;
 if p_publish and (a.name is null or a.category_id is null or a.total_qty<=0 or exists(select 1 from public.stock_portions where asset_id=p_asset_id and active and (qty<=0 or nullif(trim(assigned_location),'') is null))) then raise exception 'Validation: publication fields missing'; end if;
 wanted:=case when p_publish then 'Available' else 'In Use' end;
 select jsonb_agg(to_jsonb(s)) into before_value from public.stock_portions s where asset_id=p_asset_id and active;
 update public.stock_portions set state=wanted where asset_id=p_asset_id and active;
 update public.assets set version=version+1 where asset_id=p_asset_id;
 perform public.write_audit(case when p_publish then 'asset.published' else 'asset.withdrawn' end,'asset',p_asset_id,before_value,jsonb_build_object('state',wanted),p_operation_key);
 return public.finish_operation(p_operation_key,jsonb_build_object('assetId',p_asset_id,'version',a.version+1,'state',wanted));
end $$;

create function public.list_asset_audit(p_asset_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.require_active();
 -- Marketplace visibility does not grant access to private before/after records.
 if not public.asset_access(p_asset_id,true) and not(public.has_role('business_administrator') or (public.has_role('finance') and public.can_read_finance(p_asset_id))) then raise exception 'Forbidden: private asset audit'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('auditId',l.audit_id,'actorId',l.actor_id,'event',l.event,'targetId',l.target_id,'occurredAt',l.occurred_at,'before',l.before_data,'after',l.after_data) order by l.occurred_at desc),'[]') from public.audit_logs l where l.target_type='asset' and l.target_id=p_asset_id);
end $$;






create function public.asset_detail(p_asset_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare item jsonb; hist jsonb:='[]';
begin
 perform public.require_active();
 if not public.asset_access(p_asset_id,false) then raise exception 'Forbidden: asset scope'; end if;
 item:=public.search_assets(jsonb_build_object('assetId',p_asset_id))->0;
 if public.asset_access(p_asset_id,true) or public.has_role('business_administrator') or (public.has_role('finance') and public.can_read_finance(p_asset_id)) then hist:=public.list_asset_audit(p_asset_id); end if;
 return jsonb_build_object('asset',item,'history',hist);
end $$;
-- Only first-administrator bootstrap uses the service secret; normal edits use save_profile.
create function public.bootstrap_administrator(p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare id uuid:=(p_input->>'userId')::uuid; dep uuid:=(p_input->>'departmentId')::uuid;
begin
 lock table public.user_roles in share row exclusive mode;
 if exists(select 1 from public.user_roles where role='system_administrator') then raise exception 'Conflict: initial administrator already exists'; end if;
 insert into public.profiles(user_id,department_id,name,active) values(id,dep,p_input->>'name',true);
 insert into public.user_roles values(id,'system_administrator');
 insert into public.audit_logs(actor_id,event,target_type,target_id,after_data) values(id,'administrator.bootstrapped','profile',id,jsonb_build_object('departmentId',dep,'name',p_input->>'name'));
 return jsonb_build_object('userId',id);
end $$;

revoke all on all functions in schema public from public,anon,authenticated;
grant execute on function public.foundation_bootstrap(),public.search_assets(jsonb),public.save_department(jsonb),public.save_profile(jsonb),public.save_asset(jsonb),public.set_publication(uuid,integer,boolean,uuid),public.list_asset_audit(uuid),public.asset_access(uuid,boolean),public.asset_detail(uuid) to authenticated;
grant execute on function public.bootstrap_administrator(jsonb) to service_role;
grant all on all tables in schema public to service_role;
