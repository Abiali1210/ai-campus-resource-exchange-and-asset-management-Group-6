begin;

alter function public.workflow_workspace() rename to workflow_workspace_records;
revoke all on function public.workflow_workspace_records() from public, anon, authenticated;

create function public.workflow_workspace() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  result := public.workflow_workspace_records();
  return jsonb_set(result, '{interests}', (
    select coalesce(jsonb_agg(entry.value || jsonb_build_object('selectionReason', (
      select l.after_data->>'reason' from public.audit_logs l
      where l.event='interest.recorded' and l.target_type='request'
        and l.target_id=(entry.value->>'requestId')::uuid
        and l.after_data->>'interest_id'=entry.value->>'interestId'
      order by l.occurred_at desc, l.audit_id desc limit 1
    )) order by entry.ordinality), '[]'::jsonb)
    from jsonb_array_elements(result->'interests') with ordinality as entry(value, ordinality)
  ));
end $$;
revoke all on function public.workflow_workspace() from public, anon;
grant execute on function public.workflow_workspace() to authenticated;
notify pgrst, 'reload schema';
commit;
