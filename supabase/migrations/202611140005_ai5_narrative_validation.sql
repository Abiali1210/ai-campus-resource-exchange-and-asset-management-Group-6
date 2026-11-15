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
  select array_agg(x order by x) into actual from (select (m.arr)[1] x from regexp_matches(demand,'[0-9]+%?','g') as m(arr)) q;
  select array_agg(x order by x) into expected from unnest(expected) x;
  if actual is distinct from expected then return false; end if;
  expected:=array[p_facts->>'completed_transfers',p_facts->>'units_successfully_transferred',p_facts->>'units_per_completed_transfer'];
  select array_agg(x order by x) into actual from (select (m.arr)[1] x from regexp_matches(transfers,'[0-9]+[.][0-9]+%?|[0-9]+%?','g') as m(arr)) q;
  select array_agg(x order by x) into expected from unnest(expected) x;
  if actual is distinct from expected then return false; end if;
  if p_text ~* '[$€£]|\\m(percent|percentage|date|rank|ranking|ordinal|savings?|saved|impact|emissions?|waste|utilization|maintenance|estimate|estimated|aed|usd|eur|gbp|dollars?|euros?|pounds?|reduced|avoided|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth)\\M|[+*/=<>^]|\\m(minus|plus|divided|times)\\M' then
   if p_text ~* '[$€£]|\\m(percent|percentage|date|rank|ranking|ordinal|savings?|saved|impact|emissions?|waste|utilization|maintenance|estimate|estimated|aed|usd|eur|gbp|dollars?|euros?|pounds?|reduced|avoided|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth)\\M|[+*/=<>^]|\\m(minus|plus|divided|times)\\M' then return false; end if;
  end if;
  return true;
 end if;
 if p_text ~* '(%|[$€£]|\\m(percent|percentage|date|rank|ranking|ordinal|savings?|saved|impact|emissions?|waste|utilization|maintenance|estimate|estimated|aed|usd|eur|gbp|dollars?|euros?|pounds?|reduced|avoided|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth)\\M|[+*/=<>^]|\\m(minus|plus|divided|times)\\M)' then
  if not v2 or p_text ~* '[$€£]|\\m(percent|percentage|date|rank|ranking|ordinal|savings?|saved|impact|emissions?|waste|utilization|maintenance|estimate|estimated|aed|usd|eur|gbp|dollars?|euros?|pounds?|reduced|avoided|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth)\\M|[+*/=<>^]|\\m(minus|plus|divided|times)\\M' then return false; end if;
 end if;
 if p_text ~ '[0-9][[:space:]]*[.,-][[:space:]]*[0-9]|[0-9]+[[:space:]]+to[[:space:]]+[0-9]+|[0-9]{1,4}[/][0-9]{1,2}([/][0-9]{2,4})?|[0-9]+(st|nd|rd|th)\\M|[0-9]+[[:space:]]*(kg|g|tonnes?|co2|aed|usd)\\M' then return false; end if;
 for n in select m[1] from regexp_matches(p_text,'[0-9]+','g') as m loop
  if n !~ '^(0|[1-9][0-9]*)$' then return false; end if;
  permitted:=false;
  if p_facts ?& array['requests_submitted','open_requests','completed_transfers','units_successfully_transferred'] then permitted:=n=any(array[p_facts->>'requests_submitted',p_facts->>'open_requests',p_facts->>'completed_transfers',p_facts->>'units_successfully_transferred']); end if;
  if v2 then permitted:=permitted or n=any(array[p_facts->>'non_open_requests',p_facts->>'open_request_rate_percent',split_part(p_facts->>'units_per_completed_transfer','.',1)]); end if;
  if not permitted then return false; end if;
 end loop;
 return true;
end $$;
