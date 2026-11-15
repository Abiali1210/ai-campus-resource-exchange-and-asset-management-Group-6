alter table public.ai5_report_snapshots drop constraint ai5_report_snapshots_schema_version_check;
alter table public.ai5_report_snapshots add constraint ai5_report_snapshots_schema_version_check check (schema_version in (1,2));

create or replace function public.ai5_capture_report(p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare captured timestamptz:=transaction_timestamp(); result public.ai5_report_snapshots; facts_value jsonb; start_at timestamptz; submitted bigint; opened bigint; completed bigint; units bigint;
begin
 perform public.require_active();
 if not public.has_role('business_administrator') then raise exception 'Forbidden: business administrator required'; end if;
 if nullif(trim(p_idempotency_key),'') is null or length(p_idempotency_key)>200 then raise exception 'Validation: nonblank idempotency key required'; end if;
 select coalesce(min(ts),captured) into start_at from (
  select submitted_at ts from public.resource_requests where submitted_at<=captured
  union all select h.recorded_at from public.handovers h join public.transfers t using(transfer_id) where t.state='Completed' and h.kind in ('Receipt','Reconciliation') and h.accepted and h.recorded_at<=captured
 ) activity;
 select count(*) into submitted from public.resource_requests where submitted_at<=captured;
 select count(*) into opened from public.resource_requests where submitted_at<=captured and status in ('Open','Reserved','Partially Fulfilled');
 select count(*),coalesce(sum(t.approved_qty),0) into completed,units from public.transfers t where t.state='Completed' and exists(select 1 from public.handovers h where h.transfer_id=t.transfer_id and h.kind in ('Receipt','Reconciliation') and h.accepted and h.recorded_at<=captured);
 facts_value:=jsonb_build_object('requests_submitted',submitted,'open_requests',opened,'completed_transfers',completed,'units_successfully_transferred',units,
  'non_open_requests',submitted-opened,
  'open_request_rate_percent',case when submitted=0 then 0 else round(100.0*opened/submitted)::bigint end,
  'units_per_completed_transfer',case when completed=0 then 0 else round(units::numeric/completed,1) end);
 insert into public.ai5_report_snapshots(schema_version,calculation_version,period_start,period_end,captured_at,facts,idempotency_key,created_by)
 values(2,'ai5-operational-v2',start_at,captured,captured,facts_value,p_idempotency_key,auth.uid()) on conflict(created_by,idempotency_key) do nothing returning * into result;
 if not found then select * into result from public.ai5_report_snapshots where created_by=auth.uid() and idempotency_key=p_idempotency_key; end if;
 return to_jsonb(result);
end $$;

create or replace function public.ai5_text_valid(p_text text,p_facts jsonb) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare n text; permitted boolean; v2 boolean:=p_facts ?& array['non_open_requests','open_request_rate_percent','units_per_completed_transfer']; demand text; transfers text; remainder text; expected text[]; actual text[];
begin
 if p_text is null or length(trim(p_text)) not between 1 and 600 or jsonb_typeof(p_facts)<>'object' then return false; end if;
 if v2 then
  if p_text !~ E'^Headline: [^\\n]+\\nDemand: [^\\n]+\\nTransfer activity: [^\\n]+\\nInterpretation: [^\\n]+\\nLimitation: [^\\n]+$' then return false; end if;
  demand:=split_part(split_part(p_text,E'\nTransfer activity:',1),'Demand: ',2);
  transfers:=split_part(split_part(p_text,E'\nInterpretation:',1),'Transfer activity: ',2);
  remainder:=split_part(p_text,'Demand: ',1)||split_part(p_text,E'\nInterpretation: ',2);
  if remainder ~ '[0-9%$€£]' or remainder ~* '\m(zero|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\M' then return false; end if;
  expected:=array[p_facts->>'requests_submitted',p_facts->>'open_requests',p_facts->>'non_open_requests',(p_facts->>'open_request_rate_percent')||'%'];
  select array_agg((m.arr)[1]) into actual from regexp_matches(demand,'[0-9]+%?','g') as m(arr);
  if actual is distinct from expected then return false; end if;
  expected:=array[p_facts->>'completed_transfers',p_facts->>'units_successfully_transferred',p_facts->>'units_per_completed_transfer'];
   select array_agg((m.arr)[1]) into actual from regexp_matches(transfers,'[0-9]+[.][0-9]+%?|[0-9]+%?','g') as m(arr);
  if actual is distinct from expected then return false; end if;
  if p_text ~* '[$€£]|\m(percent|percentage|date|rank|ranking|ordinal|savings?|saved|impact|emissions?|waste|utilization|maintenance|estimate|estimated|aed|usd|eur|gbp|dollars?|euros?|pounds?|reduced|avoided|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth)\M|[+*/=<>^]|\m(minus|plus|divided|times)\M' then
   -- The required rate is the sole legal percentage token; other forbidden language remains blocked.
   if p_text ~* '[$€£]|\m(percent|percentage|date|rank|ranking|ordinal|savings?|saved|impact|emissions?|waste|utilization|maintenance|estimate|estimated|aed|usd|eur|gbp|dollars?|euros?|pounds?|reduced|avoided|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth)\M|[+*/=<>^]|\m(minus|plus|divided|times)\M' then return false; end if;
  end if;
  return true;
 end if;
 if p_text ~* '(%|[$€£]|\m(percent|percentage|date|rank|ranking|ordinal|savings?|saved|impact|emissions?|waste|utilization|maintenance|estimate|estimated|aed|usd|eur|gbp|dollars?|euros?|pounds?|reduced|avoided|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth)\M|[+*/=<>^]|\m(minus|plus|divided|times)\M)' then
  if not v2 or p_text ~* '[$€£]|\\m(percent|percentage|date|rank|ranking|ordinal|savings?|saved|impact|emissions?|waste|utilization|maintenance|estimate|estimated|aed|usd|eur|gbp|dollars?|euros?|pounds?|reduced|avoided|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth)\\M|[+*/=<>^]|\\m(minus|plus|divided|times)\\M' then return false; end if;
 end if;
 if p_text ~ '[0-9][[:space:]]*[.,-][[:space:]]*[0-9]|[0-9]+[[:space:]]+to[[:space:]]+[0-9]+|[0-9]{1,4}[/][0-9]{1,2}([/][0-9]{2,4})?|[0-9]+(st|nd|rd|th)\M|[0-9]+[[:space:]]*(kg|g|tonnes?|co2|aed|usd)\M' then return false; end if;
 for n in select m[1] from regexp_matches(p_text,'[0-9]+','g') as m loop
  if n !~ '^(0|[1-9][0-9]*)$' then return false; end if;
  permitted:=false;
  if p_facts ?& array['requests_submitted','open_requests','completed_transfers','units_successfully_transferred'] then permitted:=n=any(array[p_facts->>'requests_submitted',p_facts->>'open_requests',p_facts->>'completed_transfers',p_facts->>'units_successfully_transferred']); end if;
  if v2 then permitted:=permitted or n=any(array[p_facts->>'non_open_requests',p_facts->>'open_request_rate_percent',split_part(p_facts->>'units_per_completed_transfer','.',1)]); end if;
  if not permitted then return false; end if;
 end loop;
 return true;
end $$;
