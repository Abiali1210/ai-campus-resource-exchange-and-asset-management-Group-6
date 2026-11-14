create table public.ai5_report_narratives (
 narrative_id uuid primary key default gen_random_uuid(),
 snapshot_id uuid not null unique references public.ai5_report_snapshots(snapshot_id),
 model_id text not null check(model_id='gemini-3.5-flash-lite'),
 generated_text text not null check(length(trim(generated_text)) between 1 and 600),
 current_text text not null check(length(trim(current_text)) between 1 and 600),
 request_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(request_metadata)='object' and length(request_metadata::text)<=2000),
 status text not null default 'Draft' check(status in ('Draft','Ready','Published')),
 idempotency_key text not null check(length(trim(idempotency_key)) between 1 and 200),
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default now(),
 edited_by uuid references public.profiles(user_id), edited_at timestamptz,
 reviewed_by uuid references public.profiles(user_id), reviewed_at timestamptz,
 published_by uuid references public.profiles(user_id), published_at timestamptz,
 unique(created_by,idempotency_key),
 check ((status='Published')=(published_at is not null))
);
create function public.ai5_text_valid(p_text text,p_facts jsonb) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare n text; permitted boolean;
begin
 if p_text is null or length(trim(p_text)) not between 1 and 600 or jsonb_typeof(p_facts)<>'object' then return false; end if;
  if p_text ~* '(%|[$€£]|\m(percent|percentage|date|rank|ranking|ordinal|savings?|saved|impact|emissions?|waste|utilization|maintenance|estimate|estimated|aed|usd|eur|gbp|dollars?|euros?|pounds?|reduced|avoided|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth)\M|[+*/=<>^]|\m(minus|plus|divided|times)\M)' then return false; end if;
  if p_text ~ '[0-9][[:space:]]*[.,-][[:space:]]*[0-9]|[0-9]+[[:space:]]+to[[:space:]]+[0-9]+|[0-9]{1,4}[/][0-9]{1,2}([/][0-9]{2,4})?|[0-9]+(st|nd|rd|th)\M|[0-9]+[[:space:]]*(kg|g|tonnes?|co2|aed|usd)\M' then return false; end if;
 for n in select m[1] from regexp_matches(p_text,'[0-9]+','g') as m loop
  if n !~ '^(0|[1-9][0-9]*)$' then return false; end if;
  permitted:=false;
  if p_facts ?& array['requests_submitted','open_requests','completed_transfers','units_successfully_transferred'] then
   permitted:=n=any(array[p_facts->>'requests_submitted',p_facts->>'open_requests',p_facts->>'completed_transfers',p_facts->>'units_successfully_transferred']);
  end if;
  if not permitted then return false; end if;
 end loop;
 return true;
end $$;
create function public.ai5_generation_replay(p_snapshot_id uuid,p_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare n public.ai5_report_narratives; s public.ai5_report_snapshots; begin
 perform public.require_active(); if not public.has_role('business_administrator') then raise exception 'Forbidden: business administrator required'; end if;
 if p_key is null or length(trim(p_key)) not between 1 and 200 then raise exception 'Validation: invalid idempotency key'; end if;
 select * into n from public.ai5_report_narratives where created_by=auth.uid() and idempotency_key=p_key;
 if not found then return null; end if;
 if n.snapshot_id<>p_snapshot_id then raise exception 'Idempotency key conflict'; end if;
 select * into s from public.ai5_report_snapshots where snapshot_id=p_snapshot_id;
 return jsonb_build_object('snapshot',to_jsonb(s),'report',to_jsonb(n));
end $$;
alter table public.ai5_report_narratives enable row level security;
revoke all on public.ai5_report_narratives from public,anon,authenticated;
grant all on public.ai5_report_narratives to service_role;
create function public.ai5_narrative_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' or old.status='Published' then raise exception 'Immutable: published narrative evidence cannot change'; end if;
 if new.snapshot_id<>old.snapshot_id or new.created_by<>old.created_by or new.idempotency_key<>old.idempotency_key or new.generated_text<>old.generated_text then raise exception 'Immutable: narrative binding cannot change'; end if;
 if old.status='Ready' and new.status='Draft' then raise exception 'Invalid transition'; end if;
 return new;
end $$;
create trigger ai5_narrative_guard before update or delete on public.ai5_report_narratives for each row execute function public.ai5_narrative_guard();

create function public.ai5_generation_context(p_snapshot_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$ declare r jsonb; begin
 perform public.require_active(); if not public.has_role('business_administrator') then raise exception 'Forbidden: business administrator required'; end if;
 select to_jsonb(s) into r from public.ai5_report_snapshots s where snapshot_id=p_snapshot_id; if r is null then raise exception 'Not found'; end if; return r;
end $$;
create function public.ai5_save_generation(p_snapshot_id uuid,p_key text,p_model text,p_text text,p_metadata jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare r public.ai5_report_narratives; begin
 perform public.require_active(); if not public.has_role('business_administrator') then raise exception 'Forbidden: business administrator required'; end if;
   if p_key is null or length(trim(p_key)) not between 1 and 200 or p_model<>'gemini-3.5-flash-lite' or p_text is null or p_metadata is null or jsonb_typeof(p_metadata)<>'object' or length(p_metadata::text)>2000 then raise exception 'Validation: invalid generation result'; end if;
  if not exists(select 1 from public.ai5_report_snapshots s where s.snapshot_id=p_snapshot_id and public.ai5_text_valid(p_text,s.facts)) then raise exception 'Validation: unsupported narrative'; end if;
 select * into r from public.ai5_report_narratives where created_by=auth.uid() and idempotency_key=p_key;
 if found then if r.snapshot_id<>p_snapshot_id or r.model_id<>p_model or r.generated_text<>p_text or r.request_metadata<>p_metadata then raise exception 'Idempotency key conflict'; end if; return to_jsonb(r); end if;
  insert into public.ai5_report_narratives(snapshot_id,model_id,generated_text,current_text,request_metadata,idempotency_key,created_by) values(p_snapshot_id,p_model,p_text,p_text,p_metadata,p_key,auth.uid()) on conflict(created_by,idempotency_key) do nothing returning * into r; if found then return to_jsonb(r); end if;
  select * into r from public.ai5_report_narratives where created_by=auth.uid() and idempotency_key=p_key; if r.snapshot_id<>p_snapshot_id then raise exception 'Idempotency key conflict'; end if; return to_jsonb(r);
end $$;
create function public.ai5_edit_narrative(p_id uuid,p_text text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare r public.ai5_report_narratives; begin
  perform public.require_active(); if not public.has_role('business_administrator') then raise exception 'Forbidden'; end if;
  update public.ai5_report_narratives n set current_text=p_text,edited_by=auth.uid(),edited_at=now() where narrative_id=p_id and status='Draft' and exists(select 1 from public.ai5_report_snapshots s where s.snapshot_id=n.snapshot_id and public.ai5_text_valid(p_text,s.facts)) returning * into r; if not found then raise exception 'Validation or invalid transition or not found'; end if; return to_jsonb(r); end $$;
create function public.ai5_mark_ready(p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare r public.ai5_report_narratives; begin
 perform public.require_active(); if not public.has_role('business_administrator') then raise exception 'Forbidden'; end if; update public.ai5_report_narratives set status='Ready',reviewed_by=auth.uid(),reviewed_at=now() where narrative_id=p_id and status='Draft' returning * into r; if not found then raise exception 'Invalid transition or not found'; end if; return to_jsonb(r); end $$;
create function public.ai5_publish_narrative(p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare r public.ai5_report_narratives; begin
 perform public.require_active(); if not public.has_role('business_administrator') then raise exception 'Forbidden'; end if; update public.ai5_report_narratives set status='Published',published_by=auth.uid(),published_at=now() where narrative_id=p_id and status='Ready' returning * into r; if not found then raise exception 'Invalid transition or not found'; end if; return to_jsonb(r); end $$;
create function public.ai5_narrative_workspace() returns setof jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$ begin
 perform public.require_active(); if not public.has_role('business_administrator') then raise exception 'Forbidden'; end if; return query select jsonb_build_object('narrative',to_jsonb(n),'snapshot',to_jsonb(s)) from public.ai5_report_snapshots s left join public.ai5_report_narratives n using(snapshot_id) order by s.captured_at desc,s.snapshot_id desc;
end $$;
create function public.ai5_published_narratives() returns setof jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$ begin
 perform public.require_active(); return query select jsonb_build_object('narrative',to_jsonb(n),'snapshot',to_jsonb(s)) from public.ai5_report_narratives n join public.ai5_report_snapshots s using(snapshot_id) where n.status='Published' order by n.published_at desc;
end $$;
revoke all on function public.ai5_narrative_guard(),public.ai5_text_valid(text,jsonb),public.ai5_generation_context(uuid),public.ai5_generation_replay(uuid,text),public.ai5_save_generation(uuid,text,text,text,jsonb),public.ai5_edit_narrative(uuid,text),public.ai5_mark_ready(uuid),public.ai5_publish_narrative(uuid),public.ai5_narrative_workspace(),public.ai5_published_narratives() from public,anon,authenticated;
grant execute on function public.ai5_generation_context(uuid),public.ai5_generation_replay(uuid,text),public.ai5_save_generation(uuid,text,text,text,jsonb),public.ai5_edit_narrative(uuid,text),public.ai5_mark_ready(uuid),public.ai5_publish_narrative(uuid),public.ai5_narrative_workspace(),public.ai5_published_narratives() to authenticated;
