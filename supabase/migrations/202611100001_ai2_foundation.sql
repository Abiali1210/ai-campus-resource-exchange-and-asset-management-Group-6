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

create table public.ai_match_runs (
 run_id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.resource_requests(request_id),
 actor_id uuid not null references public.profiles(user_id),
 operation_key uuid not null,
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
-- Save is authenticated because the future Edge Function forwards the caller JWT
-- and derives auth.uid(). Eligibility is authoritative here; score/reason provenance
-- remains a future gateway responsibility (the DB cannot distinguish that gateway
-- from a browser presenting the same caller JWT).
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

create function public.ai2_save_match_run(p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
  declare actor public.profiles:=public.require_active(); k uuid:=(p_input->>'operationKey')::uuid;
 q public.resource_requests; item jsonb; r_id uuid; rec jsonb; n integer:=0; seen uuid[]:='{}'; totals jsonb;
  fp text; result jsonb; started timestamptz:=clock_timestamp(); eligible_count integer;
begin
 result:=public.begin_operation(k,'ai2_match_run',p_input); if result is not null then return result; end if;
 if not public.workflow_request_access((p_input->>'requestId')::uuid,false) then raise exception 'Forbidden: request unavailable'; end if;
 select * into q from public.resource_requests where request_id=(p_input->>'requestId')::uuid for update;
 totals:=public.workflow_totals(q.request_id);
 if q.status<>'Open' or (totals->>'remainingQty')::int<=0 then raise exception 'Conflict: request not open or no demand'; end if;
  if jsonb_typeof(p_input->'recommendations') is distinct from 'array' or jsonb_array_length(p_input->'recommendations')>5 then raise exception 'Validation: at most five recommendations required'; end if;
  if length(coalesce(p_input->>'configurationVersion','v1')) not between 1 and 80 then raise exception 'Validation: invalid configuration version'; end if;
  select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(s.portion_id,s.asset_id,s.qty,s.condition,a.ai_content_hash,e.content_hash,e.embedded_at) order by s.asset_id,s.portion_id)::text,'[]'),'UTF8')),'hex'),count(*) into fp,eligible_count
  from public.stock_portions s join public.assets a using(asset_id) join public.asset_embeddings e using(asset_id)
  join public.departments d on d.department_id=s.owner_department_id and d.active
 where s.active and s.state='Available' and s.qty>0 and not exists(select 1 from public.stock_portions ch where ch.parent_portion_id=s.portion_id and ch.active)
  and public.can_read_portion(s.portion_id) and coalesce(public.workflow_suitable(q.request_id,s.portion_id),false)
 and e.model='gte-small' and a.ai_content_hash=e.content_hash;
 insert into public.ai_match_runs(request_id,actor_id,operation_key,status,model,configuration_version,candidate_fingerprint,candidate_count,provider_call_count,completed_at,duration_ms)
  values(q.request_id,actor.user_id,k,'completed','gte-small',coalesce(p_input->>'configurationVersion','v1'),fp,least(eligible_count,20),1,clock_timestamp(),greatest(0,(extract(epoch from clock_timestamp()-started)*1000)::int)) returning run_id into r_id;
 for rec in select value from jsonb_array_elements(p_input->'recommendations') loop
  n:=n+1; if n>5 then raise exception 'Validation: at most five recommendations required'; end if;
  if (rec->>'rank')::int not between 1 and 5 or (rec->>'rank')::int<>n then raise exception 'Validation: contiguous ranks required'; end if;
  if (rec->>'portionId')::uuid=any(seen) then raise exception 'Validation: duplicate portion'; end if;
  seen:=array_append(seen,(rec->>'portionId')::uuid);
   if not exists(select 1 from public.stock_portions s join public.assets a using(asset_id) join public.asset_embeddings e using(asset_id) join public.departments d on d.department_id=s.owner_department_id and d.active where s.portion_id=(rec->>'portionId')::uuid and s.asset_id=(rec->>'assetId')::uuid and s.active and s.state='Available' and s.qty>0 and not exists(select 1 from public.stock_portions ch where ch.parent_portion_id=s.portion_id and ch.active) and public.can_read_portion(s.portion_id) and public.workflow_suitable(q.request_id,s.portion_id) and e.model='gte-small' and a.ai_content_hash=e.content_hash) then raise exception 'Conflict: candidate no longer eligible'; end if;
  insert into public.ai_match_recommendations(run_id,request_id,asset_id,portion_id,rank,semantic_cosine_score,s,c,q,l,f,t,k,w,e,compatibility_score,final_rank_score,reason,missing_evidence)
  values(r_id,q.request_id,(rec->>'assetId')::uuid,(rec->>'portionId')::uuid,n,(rec->>'semanticCosineScore')::real,(rec->>'s')::real,(rec->>'c')::real,(rec->>'q')::real,(rec->>'l')::real,(rec->>'f')::real,(rec->>'t')::real,(rec->>'k')::real,(rec->>'w')::real,(rec->>'e')::real,(rec->>'compatibilityScore')::real,(rec->>'finalRankScore')::real,rec->>'reason',coalesce(rec->'missingEvidence','[]'));
 end loop;
 result:=jsonb_build_object('runId',r_id,'requestId',q.request_id,'recommendationCount',n);
 return public.finish_operation(k,result);
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
  select jsonb_build_object('run',jsonb_build_object('runId',r.run_id,'requestId',r.request_id,'status',r.status,'model',r.model,'candidateCount',r.candidate_count,'startedAt',r.started_at,'completedAt',r.completed_at), 'recommendations',coalesce(jsonb_agg(jsonb_build_object('recommendationId',m.recommendation_id,'assetId',m.asset_id,'portionId',m.portion_id,'rank',m.rank,'scores',jsonb_build_object('S',m.s,'C',m.c,'Q',m.q,'L',m.l,'F',m.f,'T',m.t,'K',m.k,'W',m.w,'E',m.e,'compatibility',m.compatibility_score,'final',m.final_rank_score),'reason',m.reason,'missingEvidence',m.missing_evidence,'reviewState',m.review_state) order by m.rank) filter(where m.recommendation_id is not null),'[]')) into out from public.ai_match_runs r left join public.ai_match_recommendations m using(run_id) where r.run_id=rid group by r.run_id;
 return coalesce(out,'{}');
end $$;

revoke all on function public.ai2_save_match_run(jsonb),public.ai2_match_results(uuid) from public,anon,authenticated;
grant execute on function public.ai2_save_match_run(jsonb),public.ai2_match_results(uuid) to authenticated;

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
