begin;

create extension if not exists vector with schema extensions;
grant usage on schema extensions to authenticated,service_role;

-- Future canonical-content pipeline owns this authoritative expected digest.
-- It is intentionally not writable through browser grants; until populated,
-- candidate search fails closed rather than accepting a browser assertion.
alter table public.assets add column ai_content_hash text
 check(ai_content_hash is null or ai_content_hash ~ '^[0-9a-f]{64}$');
alter table public.stock_portions add constraint stock_asset_portion_unique unique(asset_id,portion_id);

create table public.asset_embeddings (
 asset_id uuid primary key references public.assets(asset_id),
 embedding extensions.vector(384) not null,
 model text not null check(model='gte-small'),
 content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
 embedded_at timestamptz not null default now()
);

-- Whole-asset scope deliberately matches asset_access(asset,true): every active
-- portion must remain under the representative's active department authority.
create function public.ai2_embedding_actor_manages(p_actor uuid,p_asset uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles p join public.departments d on d.department_id=p.department_id and d.active
  join public.user_roles r on r.user_id=p.user_id and r.role='representative'
  where p.user_id=p_actor and p.active
   and exists(select 1 from public.stock_portions s where s.asset_id=p_asset and s.active)
   and not exists(select 1 from public.stock_portions s where s.asset_id=p_asset and s.active and (s.owner_department_id<>p.department_id or not exists(select 1 from public.departments sd where sd.department_id=s.owner_department_id and sd.active))))
$$;
revoke all on function public.ai2_embedding_actor_manages(uuid,uuid) from public,anon,authenticated,service_role;

create function public.ai2_embedding_fingerprint(p_asset uuid) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select encode(sha256(convert_to(jsonb_build_object('version',a.version,'name',a.name,'category',c.name,'description',a.description,'tags',a.tags,'specifications',a.specifications)::text,'UTF8')),'hex')
 from public.assets a join public.categories c using(category_id) where a.asset_id=p_asset
$$;
revoke all on function public.ai2_embedding_fingerprint(uuid) from public,anon,authenticated,service_role;

create function public.ai2_embedding_source(p_actor uuid,p_asset uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a public.assets; out jsonb;
begin
 if not public.ai2_embedding_actor_manages(p_actor,p_asset) then raise exception 'Forbidden: asset unavailable'; end if;
 select * into a from public.assets where asset_id=p_asset;
 select jsonb_build_object('assetId',a.asset_id,'version',a.version,'name',a.name,'category',c.name,
  'description',a.description,'tags',a.tags,'specifications',a.specifications,
  'contentHash',a.ai_content_hash,'storedModel',e.model,'storedContentHash',e.content_hash,
  'sourceFingerprint',public.ai2_embedding_fingerprint(a.asset_id))
 into out from public.categories c left join public.asset_embeddings e on e.asset_id=a.asset_id where c.category_id=a.category_id;
 return out;
end $$;
revoke all on function public.ai2_embedding_source(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai2_embedding_source(uuid,uuid) to service_role;

-- service_role is the provenance boundary for canonical text and its SHA-256.
-- The snapshot fingerprint prevents stale writes; this transaction binds the
-- trusted canonical hash and vector atomically without duplicating canonicalization.
create function public.ai2_upsert_asset_embedding(p_actor uuid,p_asset uuid,p_expected_version integer,p_source_fingerprint text,p_content_hash text,p_embedding extensions.vector(384)) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare a public.assets; existed boolean;
begin
 if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then raise exception 'Validation: lowercase SHA-256 required'; end if;
 if p_source_fingerprint is null or p_source_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Validation: source fingerprint required'; end if;
 if p_embedding is null or abs(extensions.vector_norm(p_embedding)-1)>0.02 then raise exception 'Validation: normalized finite vector required'; end if;
 if not public.ai2_embedding_actor_manages(p_actor,p_asset) then raise exception 'Forbidden: asset unavailable'; end if;
 select * into a from public.assets where asset_id=p_asset for update;
 if a.version<>p_expected_version then raise exception 'Conflict: asset version changed'; end if;
 if public.ai2_embedding_fingerprint(p_asset)<>p_source_fingerprint then raise exception 'Conflict: source snapshot changed'; end if;
 select exists(select 1 from public.asset_embeddings where asset_id=p_asset) into existed;
 insert into public.asset_embeddings(asset_id,embedding,model,content_hash,embedded_at)
 values(p_asset,p_embedding,'gte-small',p_content_hash,now())
 on conflict(asset_id) do update set embedding=excluded.embedding,model='gte-small',content_hash=excluded.content_hash,embedded_at=excluded.embedded_at;
 update public.assets set ai_content_hash=p_content_hash where asset_id=p_asset;
 return jsonb_build_object('status',case when existed then 'updated' else 'created' end,'model','gte-small');
end $$;
revoke all on function public.ai2_upsert_asset_embedding(uuid,uuid,integer,text,text,extensions.vector) from public,anon,authenticated;
grant execute on function public.ai2_upsert_asset_embedding(uuid,uuid,integer,text,text,extensions.vector) to service_role;

create table public.ai_match_runs (
 run_id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.resource_requests(request_id),
 actor_id uuid not null references public.profiles(user_id),
 operation_key uuid not null,
 payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 status text not null check(status in ('running','completed','failed')),
 model text not null check(model='gte-small'),
 configuration_version text not null check(length(configuration_version) between 1 and 80),
 candidate_fingerprint text not null check(candidate_fingerprint ~ '^[0-9a-f]{64}$'),
 candidate_count smallint not null check(candidate_count between 0 and 20),
 provider_call_count smallint not null check(provider_call_count between 0 and 1),
 started_at timestamptz not null default now(),
 completed_at timestamptz,
 duration_ms integer check(duration_ms is null or duration_ms>=0),
 error_code text check(error_code is null or error_code in ('no_candidates','stale_request','invalid_candidates')),
 unique(actor_id,operation_key), unique(run_id,request_id),
 check((status='running' and completed_at is null and duration_ms is null and error_code is null)
    or (status in ('completed','failed') and completed_at is not null and duration_ms is not null)),
 check(status<>'completed' or error_code is null),
 check(status<>'failed' or error_code is not null)
);
create table public.ai_match_recommendations (
 recommendation_id uuid primary key default gen_random_uuid(),
 run_id uuid not null references public.ai_match_runs(run_id) on delete cascade,
 request_id uuid not null references public.resource_requests(request_id),
 asset_id uuid not null references public.assets(asset_id),
 portion_id uuid not null references public.stock_portions(portion_id),
 rank smallint not null check(rank between 1 and 5),
 semantic_cosine_score real not null check(semantic_cosine_score between -1 and 1),
 s real not null check(s between 0 and 1), c real not null check(c between 0 and 1),
 q real not null check(q between 0 and 1), l real not null check(l between 0 and 1),
 f real not null check(f between 0 and 1), t real not null check(t between 0 and 1),
 k real not null check(k between 0 and 1), w real not null check(w between 0 and 1),
 e real not null check(e between 0 and 1),
 compatibility_score real not null check(compatibility_score between 0 and 100),
 final_rank_score real not null check(final_rank_score between 0 and 100),
 reason text not null check(length(trim(reason)) between 1 and 300),
 missing_evidence jsonb not null default '[]' check(jsonb_typeof(missing_evidence)='array' and length(missing_evidence::text)<=2000),
 review_state text not null default 'pending' check(review_state in ('pending','accepted','rejected')),
 reviewed_by uuid references public.profiles(user_id), reviewed_at timestamptz,
 review_note text check(review_note is null or length(review_note)<=1000),
 interest_id uuid references public.interests(interest_id),
 created_at timestamptz not null default now(),
 unique(run_id,rank), unique(run_id,portion_id),
  check(abs(compatibility_score-100*(.65*s+.15*c+.10*q+.10*l))<=.02),
  check(abs(f-compatibility_score/100)<=.0002),
  check(abs(final_rank_score-100*(.60*f+.15*t+.10*k+.10*w+.05*e))<=.02),
  check((review_state='pending' and reviewed_by is null and reviewed_at is null and interest_id is null)
  or (review_state='rejected' and reviewed_by is not null and reviewed_at is not null and interest_id is null)
  or (review_state='accepted' and reviewed_by is not null and reviewed_at is not null and interest_id is not null)),
 foreign key(run_id,request_id) references public.ai_match_runs(run_id,request_id) deferrable initially deferred,
 foreign key(asset_id,portion_id) references public.stock_portions(asset_id,portion_id) deferrable initially deferred
);
create index ai_recommendations_run_idx on public.ai_match_recommendations(run_id);

alter table public.asset_embeddings enable row level security;
alter table public.ai_match_runs enable row level security;
alter table public.ai_match_recommendations enable row level security;
revoke all on public.asset_embeddings,public.ai_match_runs,public.ai_match_recommendations from public,anon,authenticated;
grant all on public.asset_embeddings,public.ai_match_runs,public.ai_match_recommendations to service_role;

-- ai_content_hash is authoritative and future-pipeline-owned; callers cannot
-- supply or override it. Null/mismatched digests fail closed.
-- Saving runs is a service-role gateway operation. Explicit actor identity is
-- revalidated from authoritative database state below.
create function public.ai2_candidates(p_request uuid,p_query extensions.vector(384),p_limit integer default 20)
returns table(portion_id uuid,asset_id uuid,asset_name text,description text,category_id uuid,specifications jsonb,
 qty integer,condition text,department_id uuid,department_name text,assigned_location text,physical_location text,similarity real)
language plpgsql stable security definer set search_path=public,extensions,pg_temp as $$
declare q public.resource_requests; totals jsonb;
begin
 perform public.require_active();
  if p_limit is null or p_limit<1 then raise exception 'Validation: candidate limit must be positive'; end if;
  if p_query is null then raise exception 'Validation: query vector required'; end if;
  if not public.workflow_request_access(p_request,false) then raise exception 'Forbidden: request unavailable'; end if;
 select * into q from public.resource_requests where request_id=p_request;
 totals:=public.workflow_totals(p_request);
 if q.status<>'Open' or (totals->>'remainingQty')::integer<=0 then raise exception 'Conflict: request is not open or has no remaining demand'; end if;
 return query
 select s.portion_id,a.asset_id,a.name,a.description,a.category_id,a.specifications,s.qty,s.condition,
  s.owner_department_id,d.name,s.assigned_location,s.physical_location,
  (1-(e.embedding <=> p_query))::real
 from public.stock_portions s join public.assets a using(asset_id)
 join public.departments d on d.department_id=s.owner_department_id and d.active
 join public.asset_embeddings e using(asset_id)
 where s.active and s.state='Available' and s.qty>0
  and not exists(select 1 from public.stock_portions child where child.parent_portion_id=s.portion_id and child.active)
 and public.can_read_portion(s.portion_id)
 and coalesce(public.workflow_suitable(p_request,s.portion_id),false)
 and e.model='gte-small'
 and a.ai_content_hash is not null and a.ai_content_hash=e.content_hash
 order by e.embedding <=> p_query,a.asset_id,s.portion_id
  limit least(p_limit,20);
end $$;
revoke all on function public.ai2_candidates(uuid,extensions.vector,integer) from public,anon,authenticated;
grant execute on function public.ai2_candidates(uuid,extensions.vector,integer) to authenticated;

-- Narrow caller-scoped projection; no requester identity or private request fields.
create function public.ai2_request_source(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare q public.resource_requests; totals jsonb;
begin
 perform public.require_active();
 if not public.workflow_request_access(p_request,false) then raise exception 'Forbidden: request unavailable'; end if;
 select * into q from public.resource_requests where request_id=p_request;
 totals:=public.workflow_totals(p_request);
 if q.status<>'Open' or (totals->>'remainingQty')::integer<=0 then raise exception 'Conflict: request is not open or has no remaining demand'; end if;
 return jsonb_build_object('requestId',q.request_id,'version',q.version,'category',(select c.name from public.categories c where c.category_id=q.category_id),'purpose',q.purpose,
  'requirements',q.specifications,'minimumCondition',q.condition,'remainingQty',(totals->>'remainingQty')::integer);
end $$;
revoke all on function public.ai2_request_source(uuid) from public,anon;
grant execute on function public.ai2_request_source(uuid) to authenticated;

create function public.ai2_match_operation(p_request uuid,p_operation_key uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.ai_match_runs; out jsonb;
begin
 perform public.require_active();
 if p_operation_key is null or not public.workflow_request_access(p_request,false) then raise exception 'Forbidden: request unavailable'; end if;
 if exists(select 1 from public.ai_match_runs where actor_id=auth.uid() and operation_key=p_operation_key and request_id<>p_request) then raise exception 'Conflict: operation key reused for different input'; end if;
 select * into r from public.ai_match_runs where actor_id=auth.uid() and operation_key=p_operation_key and request_id=p_request;
 if not found then return null; end if;
 select public.ai2_match_results(r.run_id) into out;
 return out;
end $$;
revoke all on function public.ai2_match_operation(uuid,uuid) from public,anon;
grant execute on function public.ai2_match_operation(uuid,uuid) to authenticated;

create function public.ai2_actor_request_access(p_actor uuid,p_request uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles p join public.departments d using(department_id) where p.user_id=p_actor and p.active and d.active)
 and exists(select 1 from public.resource_requests q where q.request_id=p_request and ((q.requester_id=p_actor and exists(select 1 from public.user_roles r where r.user_id=p_actor and r.role in ('requester','representative'))) or exists(select 1 from public.profiles p join public.user_roles r using(user_id) where p.user_id=p_actor and p.department_id=q.department_id and p.active and r.role='representative') or exists(select 1 from public.interests i join public.profiles p on p.user_id=p_actor join public.user_roles r using(user_id) where i.request_id=q.request_id and i.supplier_department_id=p.department_id and p.active and r.role='representative') or exists(select 1 from public.reservations z join public.transfers t using(reservation_id) where z.request_id=q.request_id and (exists(select 1 from public.profiles p join public.user_roles r using(user_id) where p.user_id=p_actor and p.department_id=t.supplier_department_id and p.active and r.role='representative') or (t.facilities_id=p_actor and exists(select 1 from public.user_roles r where r.user_id=p_actor and r.role='facilities'))))))
$$;
revoke all on function public.ai2_actor_request_access(uuid,uuid) from public,anon,authenticated,service_role;
create function public.ai2_actor_portion_access(p_actor uuid,p_portion uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.stock_portions s join public.profiles p on p.user_id=p_actor join public.departments d on d.department_id=p.department_id and d.active where s.portion_id=p_portion and p.active and ((p.department_id=s.owner_department_id and exists(select 1 from public.user_roles r where r.user_id=p_actor and r.role in ('representative','procurement','finance','sustainability'))) or exists(select 1 from public.user_roles r where r.user_id=p_actor and r.role='business_administrator') or (s.state='Available' and s.active and exists(select 1 from public.user_roles r where r.user_id=p_actor and r.role in ('requester','representative'))) or (s.holder_id=p_actor and exists(select 1 from public.user_roles r where r.user_id=p_actor and r.role in ('maintenance','facilities')))))
$$;
revoke all on function public.ai2_actor_portion_access(uuid,uuid) from public,anon,authenticated,service_role;

create function public.ai2_save_match_run(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare k uuid:=(p_input->>'operationKey')::uuid; q public.resource_requests; r_id uuid; rec jsonb; n integer:=0; seen uuid[]:='{}'; totals jsonb; result jsonb; expected text; outcome text; p_query extensions.vector(384); authoritative_snapshot jsonb; authoritative_count integer; authoritative_fingerprint text;
begin
 if p_actor is null or k is null then raise exception 'Validation: actor and operationKey required'; end if;
 if not public.ai2_actor_request_access(p_actor,(p_input->>'requestId')::uuid) then raise exception 'Forbidden: request unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||k::text,0));
 select run_id into r_id from public.ai_match_runs where actor_id=p_actor and operation_key=k;
 if r_id is not null then
   if (select payload_hash from public.ai_match_runs where run_id=r_id)<>encode(sha256(convert_to((p_input-ARRAY['durationMs','providerCallCount','candidateCount','candidateFingerprint','queryVector','candidateSnapshot'])::text,'UTF8')),'hex') then raise exception 'Conflict: operation key reused for different input'; end if;
   select jsonb_build_object('runId',r.run_id,'requestId',r.request_id,'recommendationCount',(select count(*) from public.ai_match_recommendations m where m.run_id=r.run_id),'outcome',case when r.error_code='no_candidates' then 'no_candidates' else 'completed' end) into result from public.ai_match_runs r where r.run_id=r_id;
   return result;
 end if;
 select * into q from public.resource_requests where request_id=(p_input->>'requestId')::uuid for update;
 if q.request_id is null or q.version<>(p_input->>'requestVersion')::integer then raise exception 'Conflict: stale_request'; end if;
 totals:=public.workflow_totals(q.request_id);
 if q.status<>'Open' or (totals->>'remainingQty')::int<=0 then raise exception 'Conflict: stale_request'; end if;
 if jsonb_typeof(p_input->'queryVector') is distinct from 'array' or jsonb_array_length(p_input->'queryVector')<>384 or jsonb_typeof(p_input->'candidateSnapshot') is distinct from 'array' or jsonb_array_length(p_input->'candidateSnapshot')>20 then raise exception 'Validation: bounded candidate snapshot and query vector required'; end if;
 p_query:=(p_input->'queryVector')::text::extensions.vector(384);
 if p_query is null or abs(extensions.vector_norm(p_query)-1)>.02 then raise exception 'Validation: normalized finite request vector required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('portion_id',c.portion_id,'asset_id',c.asset_id,'asset_name',c.asset_name,'description',c.description,'category_id',c.category_id,'specifications',c.specifications,'qty',c.qty,'condition',c.condition,'department_id',c.department_id,'department_name',c.department_name,'assigned_location',c.assigned_location,'physical_location',c.physical_location,'similarity',c.similarity) order by c.distance,c.asset_id,c.portion_id),'[]'::jsonb)
 into authoritative_snapshot from (
  select s.portion_id,a.asset_id,a.name asset_name,a.description,a.category_id,a.specifications,s.qty,s.condition,s.owner_department_id department_id,d.name department_name,s.assigned_location,s.physical_location,(1-(e.embedding <=> p_query))::real similarity,e.embedding <=> p_query distance
  from public.stock_portions s join public.assets a using(asset_id) join public.departments d on d.department_id=s.owner_department_id and d.active join public.asset_embeddings e using(asset_id)
  where s.active and s.state='Available' and s.qty>0 and not exists(select 1 from public.stock_portions child where child.parent_portion_id=s.portion_id and child.active)
   and public.ai2_actor_portion_access(p_actor,s.portion_id) and coalesce(public.workflow_suitable(q.request_id,s.portion_id),false)
   and e.model='gte-small' and a.ai_content_hash is not null and a.ai_content_hash=e.content_hash
  order by e.embedding <=> p_query,a.asset_id,s.portion_id limit 20
 ) c;
 authoritative_count:=jsonb_array_length(authoritative_snapshot);
 if p_input->'candidateSnapshot' is distinct from authoritative_snapshot then raise exception 'Conflict: candidate_set_changed'; end if;
 authoritative_fingerprint:=encode(sha256(convert_to(authoritative_snapshot::text,'UTF8')),'hex');
 outcome:=p_input->>'outcome';
 if outcome not in ('completed','no_candidates') or jsonb_typeof(p_input->'recommendations') is distinct from 'array' or jsonb_array_length(p_input->'recommendations')>5 then raise exception 'Validation: invalid match outcome or recommendations'; end if;
 if (outcome='no_candidates' and (jsonb_array_length(p_input->'recommendations')<>0 or authoritative_count<>0)) or (outcome='completed' and (jsonb_array_length(p_input->'recommendations')=0 or authoritative_count=0)) then raise exception 'Validation: outcome/recommendation mismatch'; end if;
 if p_input->>'model' is distinct from 'gte-small' or length(coalesce(p_input->>'configurationVersion','')) not between 1 and 80 or coalesce((p_input->>'durationMs')::integer,-1)<0 or coalesce((p_input->>'providerCallCount')::integer,0)<>1 then raise exception 'Validation: invalid trusted run metadata'; end if;
 expected:=encode(sha256(convert_to((p_input-ARRAY['durationMs','providerCallCount','candidateCount','candidateFingerprint','queryVector','candidateSnapshot'])::text,'UTF8')),'hex');
 insert into public.ai_match_runs(request_id,actor_id,operation_key,payload_hash,status,model,configuration_version,candidate_fingerprint,candidate_count,provider_call_count,completed_at,duration_ms,error_code)
 values(q.request_id,p_actor,k,expected,case when outcome='no_candidates' then 'failed' else 'completed' end,'gte-small',p_input->>'configurationVersion',authoritative_fingerprint,authoritative_count::smallint,1,now(),(p_input->>'durationMs')::integer,case when outcome='no_candidates' then 'no_candidates' else null end) returning run_id into r_id;
 for rec in select value from jsonb_array_elements(p_input->'recommendations') loop
  n:=n+1;
  if (rec->>'rank')::int<>n or (rec->>'portionId')::uuid=any(seen) then raise exception 'Validation: invalid ranks or duplicate portions'; end if;
  seen:=array_append(seen,(rec->>'portionId')::uuid);
  if not exists(select 1 from public.stock_portions s join public.assets a using(asset_id) join public.asset_embeddings e using(asset_id) join public.departments d on d.department_id=s.owner_department_id and d.active where s.portion_id=(rec->>'portionId')::uuid and s.asset_id=(rec->>'assetId')::uuid and s.active and s.state='Available' and s.qty>0 and not exists(select 1 from public.stock_portions ch where ch.parent_portion_id=s.portion_id and ch.active) and public.ai2_actor_portion_access(p_actor,s.portion_id) and public.workflow_suitable(q.request_id,s.portion_id) and e.model='gte-small' and a.ai_content_hash=e.content_hash) then raise exception 'Conflict: candidate_set_changed'; end if;
  if abs((rec->>'compatibilityScore')::numeric-100*(.65*(rec->>'s')::numeric+.15*(rec->>'c')::numeric+.10*(rec->>'q')::numeric+.10*(rec->>'l')::numeric))>.02 or abs((rec->>'finalRankScore')::numeric-100*(.60*(rec->>'f')::numeric+.15*(rec->>'t')::numeric+.10*(rec->>'k')::numeric+.10*(rec->>'w')::numeric+.05*(rec->>'e')::numeric))>.02 then raise exception 'Validation: score formula mismatch'; end if;
  if abs((rec->>'s')::numeric-greatest(0,least(1,(rec->>'semanticCosineScore')::numeric)))>.0002 or (rec->>'l')::numeric<>0 or (rec->>'t')::numeric<>0 or (rec->>'k')::numeric<>0 or (rec->>'w')::numeric<>0 or (rec->>'e')::numeric<>0 or abs((rec->>'f')::numeric-(rec->>'compatibilityScore')::numeric/100)>.0002 or not exists(select 1 from public.stock_portions s where s.portion_id=(rec->>'portionId')::uuid and abs((rec->>'q')::numeric-least(s.qty::numeric/(totals->>'remainingQty')::numeric,1))<.0002 and (rec->>'c')::numeric=1) then raise exception 'Validation: persisted factor mismatch'; end if;
  insert into public.ai_match_recommendations(run_id,request_id,asset_id,portion_id,rank,semantic_cosine_score,s,c,q,l,f,t,k,w,e,compatibility_score,final_rank_score,reason,missing_evidence)
  values(r_id,q.request_id,(rec->>'assetId')::uuid,(rec->>'portionId')::uuid,n,(rec->>'semanticCosineScore')::real,(rec->>'s')::real,(rec->>'c')::real,(rec->>'q')::real,(rec->>'l')::real,(rec->>'f')::real,(rec->>'t')::real,(rec->>'k')::real,(rec->>'w')::real,(rec->>'e')::real,(rec->>'compatibilityScore')::real,(rec->>'finalRankScore')::real,rec->>'reason',coalesce(rec->'missingEvidence','[]'));
 end loop;
 return jsonb_build_object('runId',r_id,'requestId',q.request_id,'recommendationCount',n,'outcome',outcome);
end $$;

create function public.ai2_match_results(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare rid uuid; req uuid; out jsonb;
begin
 perform public.require_active();
 select run_id,request_id into rid,req from public.ai_match_runs where run_id=p_id;
  if rid is null then
   req:=p_id;
   if not public.workflow_request_access(req,false) then raise exception 'Forbidden: request unavailable'; end if;
   select run_id into rid from public.ai_match_runs where request_id=req order by started_at desc,run_id desc limit 1;
  end if;
 if not public.workflow_request_access(req,false) then raise exception 'Forbidden: request unavailable'; end if;
   select jsonb_build_object('outcome',case when r.error_code='no_candidates' then 'no_candidates' else 'completed' end,'runId',r.run_id,'requestId',r.request_id,
   'recommendations',coalesce(jsonb_agg(jsonb_build_object('recommendationId',m.recommendation_id,'portionId',m.portion_id,'assetId',m.asset_id,'rank',m.rank,'assetName',a.name,'condition',s.condition,'availableQty',s.qty,'compatibilityScore',m.compatibility_score,'finalRankScore',m.final_rank_score,'reason',m.reason,'missingEvidence',m.missing_evidence,'reviewState',m.review_state,'interestId',m.interest_id) order by m.rank) filter(where m.recommendation_id is not null),'[]')) into out
   from public.ai_match_runs r left join public.ai_match_recommendations m using(run_id) left join public.assets a using(asset_id) left join public.stock_portions s using(portion_id) where r.run_id=rid group by r.run_id;
 return coalesce(out,'{}');
end $$;

revoke all on function public.ai2_save_match_run(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ai2_save_match_run(uuid,jsonb) to service_role;
revoke all on function public.ai2_match_results(uuid) from public,anon;
grant execute on function public.ai2_match_results(uuid) to authenticated;

create function public.ai2_review_recommendation(p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor public.profiles:=public.require_active(); k uuid:=(p_input->>'operationKey')::uuid;
 m public.ai_match_recommendations; q public.resource_requests; s public.stock_portions; totals jsonb; decision text:=p_input->>'decision';
 result jsonb; qty integer; nested uuid;
begin
 result:=public.begin_operation(k,'ai2_review',p_input); if result is not null then return result; end if;
 if decision not in ('accepted','rejected') then raise exception 'Validation: accepted or rejected decision required'; end if;
 select * into m from public.ai_match_recommendations where recommendation_id=(p_input->>'recommendationId')::uuid;
 if m.recommendation_id is null then raise exception 'Forbidden: recommendation unavailable'; end if;
 if not public.workflow_request_access(m.request_id,true) then raise exception 'Forbidden: request write access required'; end if;
  select * into m from public.ai_match_recommendations where recommendation_id=m.recommendation_id for update;
  select * into q from public.resource_requests where request_id=m.request_id for update;
 if m.review_state<>'pending' then raise exception 'Conflict: recommendation already reviewed'; end if;
 if decision='rejected' then
  update public.ai_match_recommendations set review_state='rejected',reviewed_by=actor.user_id,reviewed_at=now(),review_note=left(p_input->>'note',1000) where recommendation_id=m.recommendation_id;
  result:=jsonb_build_object('recommendationId',m.recommendation_id,'decision','rejected');
  return public.finish_operation(k,result);
 end if;
  select * into s from public.stock_portions where portion_id=m.portion_id for update;
 totals:=public.workflow_totals(q.request_id);
  if p_input ? 'qty' and (jsonb_typeof(p_input->'qty')<>'number' or (p_input->>'qty')!~'^[1-9][0-9]*$') then raise exception 'Validation: qty must be a positive integer'; end if;
  qty:=least(coalesce((p_input->>'qty')::int,s.qty),s.qty,(totals->>'remainingQty')::int);
 if q.status<>'Open' or qty<=0 or not s.active or s.state<>'Available' or not public.can_read_portion(s.portion_id) or not public.workflow_suitable(q.request_id,s.portion_id)
  or not exists(select 1 from public.assets a join public.asset_embeddings e using(asset_id) join public.departments d on d.department_id=s.owner_department_id and d.active where a.asset_id=s.asset_id and a.ai_content_hash=e.content_hash and e.model='gte-small') then raise exception 'Conflict: recommendation no longer eligible'; end if;
 nested:= (substr(encode(sha256(convert_to(k::text||':recordInterest','UTF8')),'hex'),1,32))::uuid;
 result:=public.workflow_command(jsonb_build_object('action','recordInterest','requestId',q.request_id,'portionId',s.portion_id,'qty',qty,'expectedVersion',q.version,'reason',coalesce(nullif(p_input->>'note',''),'Accepted AI recommendation'),'operationKey',nested));
 update public.ai_match_recommendations set review_state='accepted',reviewed_by=actor.user_id,reviewed_at=now(),review_note=left(p_input->>'note',1000),interest_id=(result->>'interestId')::uuid where recommendation_id=m.recommendation_id;
 result:=jsonb_build_object('recommendationId',m.recommendation_id,'decision','accepted','interestId',result->>'interestId');
 return public.finish_operation(k,result);
end $$;
revoke all on function public.ai2_review_recommendation(jsonb) from public,anon,authenticated;
grant execute on function public.ai2_review_recommendation(jsonb) to authenticated;
commit;
