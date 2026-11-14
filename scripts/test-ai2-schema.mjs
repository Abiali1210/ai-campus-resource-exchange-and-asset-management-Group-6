import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// PGlite cannot load pgvector; these are text-level contracts only. Native
// PostgreSQL coverage must execute this migration and its RPC behavior.
const sql = await readFile(
  "supabase/migrations/202611100001_ai2_foundation.sql",
  "utf8",
);
for (const contract of [
  "extensions.vector(384)",
  "model='gte-small'",
  "enable row level security",
  "workflow_request_access(p_request,false)",
  "workflow_totals(p_request)",
  "candidate limit must be positive",
  "limit least(p_limit,20)",
  "create function public.ai2_save_match_run(p_actor uuid,p_input jsonb)",
  "grant execute on function public.ai2_save_match_run(uuid,jsonb) to service_role",
  "public.ai2_actor_request_access(p_actor",
  "public.ai2_actor_portion_access(p_actor",
  "pg_advisory_xact_lock",
  "create function public.ai2_match_results(p_id uuid)",
  "create function public.ai2_review_recommendation(p_input jsonb)",
  "create function public.ai2_request_source(p_request uuid)",
  "'category',(select c.name from public.categories c where c.category_id=q.category_id)",
  "'requirements',q.specifications,'minimumCondition',q.condition,'remainingQty'",
  "create function public.ai2_match_operation(p_request uuid,p_operation_key uuid)",
  "grant execute on function public.ai2_request_source(uuid) to authenticated",
  "requestVersion",
  "outcome='no_candidates'",
  "candidate_set_changed",
  "'assetName',a.name",
  "'availableQty',s.qty",
  "jsonb_array_length(p_input->'queryVector')<>384",
  "jsonb_array_length(p_input->'candidateSnapshot')>20",
  "authoritative_snapshot",
  "authoritative_fingerprint",
  "p_input->'candidateSnapshot' is distinct from authoritative_snapshot",
  "public.ai2_actor_portion_access(p_actor,s.portion_id)",
  "e.embedding <=> p_query",
  "(p_input-ARRAY['durationMs','providerCallCount','candidateCount','candidateFingerprint','queryVector','candidateSnapshot'])",
  "workflow_request_access(m.request_id,true)",
  "public.workflow_command(jsonb_build_object('action','recordInterest'",
  "ai_content_hash=e.content_hash",
  "embedding <=> p_query",
  "public.can_read_portion(s.portion_id)",
  "public.workflow_suitable(p_request,s.portion_id)",
  "grant execute on function public.ai2_candidates",
  "create function public.ai2_embedding_source(p_actor uuid,p_asset uuid)",
  "create function public.ai2_upsert_asset_embedding(p_actor uuid,p_asset uuid,p_expected_version integer,p_source_fingerprint text,p_content_hash text,p_embedding extensions.vector(384))",
  "grant execute on function public.ai2_embedding_source(uuid,uuid) to service_role",
  "grant execute on function public.ai2_upsert_asset_embedding(uuid,uuid,integer,text,text,extensions.vector) to service_role",
  "sourceFingerprint",
  "Conflict: source snapshot changed",
  "Whole-asset scope deliberately matches asset_access(asset,true)",
  "Conflict: asset version changed",
  "normalized finite vector required",
])
  assert.ok(sql.includes(contract), `Missing AI2 SQL contract: ${contract}`);
assert.ok(!/returns table[^;]*embedding\s+extensions\.vector/is.test(sql));
assert.match(
  sql,
  /not exists\(select 1 from public\.stock_portions child where child\.parent_portion_id=s\.portion_id and child\.active\)/,
);
console.log("PASS AI2 pure SQL contract assertions (not native behavior)");
