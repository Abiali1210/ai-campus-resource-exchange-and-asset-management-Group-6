create or replace function public.ai5_report_workspace(p_limit integer default 20) returns setof jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$ begin
 perform public.require_active();
 if not public.has_role('business_administrator') then raise exception 'Forbidden: business administrator required'; end if;
 return query select to_jsonb(s) || jsonb_build_object('creator_name',p.name)
 from public.ai5_report_snapshots s left join public.profiles p on p.user_id=s.created_by
 order by s.captured_at desc,s.snapshot_id limit least(greatest(coalesce(p_limit,20),1),20);
end $$;

create or replace function public.ai5_narrative_workspace() returns setof jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$ begin
 perform public.require_active(); if not public.has_role('business_administrator') then raise exception 'Forbidden'; end if;
 return query select jsonb_build_object(
  'narrative',case when n.narrative_id is null then null else to_jsonb(n) || jsonb_build_object(
   'creator_name',creator.name,'editor_name',editor.name,'reviewer_name',reviewer.name,'publisher_name',publisher.name) end,
  'snapshot',to_jsonb(s) || jsonb_build_object('creator_name',snapshot_creator.name))
 from public.ai5_report_snapshots s
 left join public.profiles snapshot_creator on snapshot_creator.user_id=s.created_by
 left join public.ai5_report_narratives n using(snapshot_id)
 left join public.profiles creator on creator.user_id=n.created_by
 left join public.profiles editor on editor.user_id=n.edited_by
 left join public.profiles reviewer on reviewer.user_id=n.reviewed_by
 left join public.profiles publisher on publisher.user_id=n.published_by
 order by s.captured_at desc,s.snapshot_id desc;
end $$;

create or replace function public.ai5_published_narratives() returns setof jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$ begin
 perform public.require_active(); return query select jsonb_build_object(
  'narrative',to_jsonb(n) || jsonb_build_object(
   'creator_name',creator.name,'editor_name',editor.name,'reviewer_name',reviewer.name,'publisher_name',publisher.name),
  'snapshot',to_jsonb(s) || jsonb_build_object('creator_name',snapshot_creator.name))
 from public.ai5_report_narratives n join public.ai5_report_snapshots s using(snapshot_id)
 left join public.profiles snapshot_creator on snapshot_creator.user_id=s.created_by
 left join public.profiles creator on creator.user_id=n.created_by
 left join public.profiles editor on editor.user_id=n.edited_by
 left join public.profiles reviewer on reviewer.user_id=n.reviewed_by
 left join public.profiles publisher on publisher.user_id=n.published_by
 where n.status='Published' order by n.published_at desc;
 end $$;

revoke all on function public.ai5_report_workspace(integer) from public, anon, authenticated;
revoke all on function public.ai5_narrative_workspace() from public, anon, authenticated;
revoke all on function public.ai5_published_narratives() from public, anon, authenticated;
grant execute on function public.ai5_report_workspace(integer) to authenticated;
grant execute on function public.ai5_narrative_workspace() to authenticated;
grant execute on function public.ai5_published_narratives() to authenticated;
