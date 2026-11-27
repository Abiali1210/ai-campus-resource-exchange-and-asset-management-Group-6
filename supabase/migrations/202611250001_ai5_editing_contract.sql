-- Human editing is free-form prose; only literal numeric claims are constrained.
create or replace function public.ai5_text_valid(p_text text,p_facts jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare
 normalized text;
 token text;
 value numeric;
begin
 if p_text is null or length(btrim(replace(replace(p_text,E'\r\n',E'\n'),E'\r',E'\n'),E' \t\n\r\f\v')) not between 1 and 600
    or jsonb_typeof(p_facts)<>'object' then return false; end if;
 normalized:=btrim(replace(replace(p_text,E'\r\n',E'\n'),E'\r',E'\n'),E' \t\n\r\f\v');
 for token in select m[2] from regexp_matches(normalized,'(^|[^[:alnum:]_-])([+-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)%?)(?![[:alnum:]_-])','g') as m loop
   if token !~ '^[0-9]+(?:\.[0-9]+)?%?$' then return false; end if;
   if token like '%\%%' escape '\' then
     if token !~ '^[0-9]+(?:\.[0-9]+)?%$' or substring(token from 1 for length(token)-1)::numeric is distinct from (p_facts->>'open_request_rate_percent')::numeric then return false; end if;
   else
     value:=token::numeric;
     if value is distinct from (p_facts->>'requests_submitted')::numeric
       and value is distinct from (p_facts->>'open_requests')::numeric
       and value is distinct from (p_facts->>'non_open_requests')::numeric
       and value is distinct from (p_facts->>'open_request_rate_percent')::numeric
       and value is distinct from (p_facts->>'completed_transfers')::numeric
       and value is distinct from (p_facts->>'units_successfully_transferred')::numeric
       and value is distinct from (p_facts->>'units_per_completed_transfer')::numeric then return false; end if;
   end if;
 end loop;
 -- Reject malformed or otherwise unsupported numeric-looking tokens (ranges,
 -- exponents, dates and repeated percent markers) without exposing their text.
 if normalized ~ '[0-9][[:space:]]*[-/][[:space:]]*[0-9]|(^|[^[:alnum:]_])[0-9]+(?:\.[0-9]+)?[eE][+-]?[0-9]+(?![[:alnum:]_])|[0-9]+%[0-9%]|[0-9]+(?:\.[0-9]+)?%[[:alnum:]_]' then return false; end if;
 return true;
exception when others then return false;
end $$;

create or replace function public.ai5_unsupported_token(p_text text,p_facts jsonb)
returns text language plpgsql immutable set search_path=public,pg_temp as $$
declare token text; value numeric;
begin
 for token in select m[2] from regexp_matches(btrim(replace(replace(p_text,E'\r\n',E'\n'),E'\r',E'\n'),E' \t\n\r\f\v'),'(^|[^[:alnum:]_-])([+-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)%?)(?![[:alnum:]_-])','g') as m loop
   if token !~ '^[0-9]+(?:\.[0-9]+)?%?$' then return left(token,32); end if;
   if token like '%\%%' escape '\' then
     if token !~ '^[0-9]+(?:\.[0-9]+)?%$' then return left(token,32); end if;
     if substring(token from 1 for length(token)-1)::numeric is distinct from (p_facts->>'open_request_rate_percent')::numeric then return left(token,32); end if;
   else
     value:=token::numeric;
     if value is distinct from (p_facts->>'requests_submitted')::numeric
       and value is distinct from (p_facts->>'open_requests')::numeric
       and value is distinct from (p_facts->>'non_open_requests')::numeric
       and value is distinct from (p_facts->>'open_request_rate_percent')::numeric
       and value is distinct from (p_facts->>'completed_transfers')::numeric
       and value is distinct from (p_facts->>'units_successfully_transferred')::numeric
       and value is distinct from (p_facts->>'units_per_completed_transfer')::numeric then return left(token,32); end if;
   end if;
 end loop;
 return coalesce(substring(p_text from '([0-9][^[:space:]]{0,31})'),'format');
exception when others then return 'format';
end $$;

create or replace function public.ai5_generated_text_valid(p_text text,p_facts jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare token text; value numeric; n text; permitted boolean; is_v2 boolean:=p_facts ?& array['non_open_requests','open_request_rate_percent','units_per_completed_transfer'];
begin
 if p_text is null or length(trim(p_text)) not between 1 and 600 or jsonb_typeof(p_facts)<>'object' then return false; end if;
 if not is_v2 then
   -- Preserve schema-v1 generated-output rules from 202611240001. Human
   -- narrative edits use ai5_text_valid directly and intentionally remain free-form.
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
 end if;
 if not public.ai5_text_valid(p_text,p_facts) then return false; end if;
 if p_text ~ E'\\r' or p_text !~ E'^Headline: [^\\n]+\\nDemand: [^\\n]+\\nTransfer activity: [^\\n]+\\nInterpretation: [^\\n]+\\nLimitation: [^\\n]+$' then return false; end if;
 if p_text ~ '[$€£]|[-+][[:space:]]*[0-9]|[0-9][[:space:]]*[eE][+-]?[0-9]|[0-9][[:space:]]*[-/][[:space:]]*[0-9]' then return false; end if;
 for token in select m[1] from regexp_matches(p_text,'[0-9]+(?:\.[0-9]+)?%?','g') as m loop
   if token like '%\%%' escape '\' then
     if substring(token from 1 for length(token)-1)::numeric is distinct from (p_facts->>'open_request_rate_percent')::numeric then return false; end if;
   else
     value:=token::numeric;
     if value is distinct from (p_facts->>'requests_submitted')::numeric
       and value is distinct from (p_facts->>'open_requests')::numeric
       and value is distinct from (p_facts->>'non_open_requests')::numeric
       and value is distinct from (p_facts->>'open_request_rate_percent')::numeric
       and value is distinct from (p_facts->>'completed_transfers')::numeric
       and value is distinct from (p_facts->>'units_successfully_transferred')::numeric
       and value is distinct from (p_facts->>'units_per_completed_transfer')::numeric then return false; end if;
   end if;
 end loop;
 if length(p_text)-length(replace(p_text,'%','')) <> (select count(*) from regexp_matches(p_text,'[0-9]+%','g')) then return false; end if;
 return true;
exception when others then return false;
end
$$;

create or replace function public.ai5_normalize_text(p_text text)
returns text language sql immutable set search_path=public,pg_temp as $$
 select btrim(replace(replace(p_text,E'\r\n',E'\n'),E'\r',E'\n'),E' \t\n\r\f\v')
$$;

create or replace function public.ai5_text_error(p_text text,p_facts jsonb)
returns text language plpgsql immutable set search_path=public,pg_temp as $$
declare normalized text;
begin
 if p_text is null then return 'AI5_TEXT_EMPTY'; end if;
 normalized:=public.ai5_normalize_text(p_text);
 if length(normalized)=0 then return 'AI5_TEXT_EMPTY'; end if;
 if length(normalized)>600 then return 'AI5_TEXT_TOO_LONG'; end if;
 if not public.ai5_text_valid(normalized,p_facts) then return 'AI5_UNSUPPORTED_NUMBER'; end if;
 return null;
end $$;

create or replace function public.ai5_save_generation(p_snapshot_id uuid,p_key text,p_model text,p_text text,p_metadata jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.ai5_report_narratives;
begin
 perform public.require_active();
 if not public.has_role('business_administrator') then raise exception 'Forbidden: business administrator required'; end if;
 if p_key is null or length(trim(p_key)) not between 1 and 200 or p_model<>'gemini-3.5-flash-lite' or p_text is null or p_metadata is null or jsonb_typeof(p_metadata)<>'object' or length(p_metadata::text)>2000 then raise exception 'Validation: invalid generation result'; end if;
 if not exists(select 1 from public.ai5_report_snapshots s where s.snapshot_id=p_snapshot_id and public.ai5_generated_text_valid(p_text,s.facts)) then raise exception 'Validation: unsupported narrative'; end if;
 select * into r from public.ai5_report_narratives where created_by=auth.uid() and idempotency_key=p_key;
 if found then if r.snapshot_id<>p_snapshot_id or r.model_id<>p_model or r.generated_text<>p_text or r.request_metadata<>p_metadata then raise exception 'Idempotency key conflict'; end if; return to_jsonb(r); end if;
 insert into public.ai5_report_narratives(snapshot_id,model_id,generated_text,current_text,request_metadata,idempotency_key,created_by) values(p_snapshot_id,p_model,p_text,p_text,p_metadata,p_key,auth.uid()) on conflict(created_by,idempotency_key) do nothing returning * into r;
 if found then return to_jsonb(r); end if;
 select * into r from public.ai5_report_narratives where created_by=auth.uid() and idempotency_key=p_key;
 if r.snapshot_id<>p_snapshot_id then raise exception 'Idempotency key conflict'; end if;
 return to_jsonb(r);
end $$;

create or replace function public.ai5_edit_narrative(p_id uuid,p_text text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.ai5_report_narratives; normalized text; bad_token text; validation_error text; facts jsonb;
begin
 begin perform public.require_active(); exception when others then raise exception 'AI5_FORBIDDEN'; end;
 if not public.has_role('business_administrator') then raise exception 'AI5_FORBIDDEN'; end if;
 normalized:=public.ai5_normalize_text(p_text);
 select * into r from public.ai5_report_narratives where narrative_id=p_id;
 if not found then raise exception 'AI5_NOT_FOUND'; end if;
 if r.status<>'Draft' then raise exception 'AI5_INVALID_STATE'; end if;
 select s.facts into facts from public.ai5_report_snapshots s where s.snapshot_id=r.snapshot_id;
 validation_error:=public.ai5_text_error(normalized,facts);
 if validation_error='AI5_TEXT_EMPTY' then raise exception 'AI5_TEXT_EMPTY'; end if;
 if validation_error='AI5_TEXT_TOO_LONG' then raise exception 'AI5_TEXT_TOO_LONG'; end if;
 if validation_error='AI5_UNSUPPORTED_NUMBER' then bad_token:=public.ai5_unsupported_token(normalized,facts); raise exception 'AI5_UNSUPPORTED_NUMBER: %',bad_token; end if;
 update public.ai5_report_narratives set current_text=normalized,edited_by=auth.uid(),edited_at=now() where narrative_id=p_id returning * into r;
 return to_jsonb(r);
end $$;

create or replace function public.ai5_mark_ready(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.ai5_report_narratives; bad_token text; facts jsonb; validation_error text;
begin
 begin perform public.require_active(); exception when others then raise exception 'AI5_FORBIDDEN'; end;
 if not public.has_role('business_administrator') then raise exception 'AI5_FORBIDDEN'; end if;
 select n.* into r from public.ai5_report_narratives n where n.narrative_id=p_id;
 if not found then raise exception 'AI5_NOT_FOUND'; end if;
 if r.status<>'Draft' then raise exception 'AI5_INVALID_STATE'; end if;
 select s.facts into facts from public.ai5_report_snapshots s where s.snapshot_id=r.snapshot_id;
 validation_error:=public.ai5_text_error(r.current_text,facts);
 if validation_error='AI5_TEXT_EMPTY' then raise exception 'AI5_TEXT_EMPTY'; end if;
 if validation_error='AI5_TEXT_TOO_LONG' then raise exception 'AI5_TEXT_TOO_LONG'; end if;
 if validation_error='AI5_UNSUPPORTED_NUMBER' then bad_token:=public.ai5_unsupported_token(r.current_text,facts); raise exception 'AI5_UNSUPPORTED_NUMBER: %',bad_token; end if;
 update public.ai5_report_narratives set status='Ready',reviewed_by=auth.uid(),reviewed_at=now() where narrative_id=p_id returning * into r;
 return to_jsonb(r);
end $$;

create or replace function public.ai5_publish_narrative(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.ai5_report_narratives; bad_token text; facts jsonb; validation_error text;
begin
 begin perform public.require_active(); exception when others then raise exception 'AI5_FORBIDDEN'; end;
 if not public.has_role('business_administrator') then raise exception 'AI5_FORBIDDEN'; end if;
 select n.* into r from public.ai5_report_narratives n where n.narrative_id=p_id;
 if not found then raise exception 'AI5_NOT_FOUND'; end if;
 if r.status<>'Ready' then raise exception 'AI5_INVALID_STATE'; end if;
 select s.facts into facts from public.ai5_report_snapshots s where s.snapshot_id=r.snapshot_id;
 validation_error:=public.ai5_text_error(r.current_text,facts);
 if validation_error='AI5_TEXT_EMPTY' then raise exception 'AI5_TEXT_EMPTY'; end if;
 if validation_error='AI5_TEXT_TOO_LONG' then raise exception 'AI5_TEXT_TOO_LONG'; end if;
 if validation_error='AI5_UNSUPPORTED_NUMBER' then bad_token:=public.ai5_unsupported_token(r.current_text,facts); raise exception 'AI5_UNSUPPORTED_NUMBER: %',bad_token; end if;
 update public.ai5_report_narratives set status='Published',published_by=auth.uid(),published_at=now() where narrative_id=p_id returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.ai5_text_valid(text,jsonb),public.ai5_unsupported_token(text,jsonb),public.ai5_text_error(text,jsonb),public.ai5_normalize_text(text),public.ai5_generated_text_valid(text,jsonb),public.ai5_edit_narrative(uuid,text),public.ai5_mark_ready(uuid),public.ai5_publish_narrative(uuid) from public,anon,authenticated;
revoke all on function public.ai5_save_generation(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ai5_save_generation(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.ai5_edit_narrative(uuid,text),public.ai5_mark_ready(uuid),public.ai5_publish_narrative(uuid) to authenticated;
