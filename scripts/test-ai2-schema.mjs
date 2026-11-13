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
  "create function public.ai2_save_match_run(p_input jsonb)",
  "create function public.ai2_match_results(p_id uuid)",
  "create function public.ai2_review_recommendation(p_input jsonb)",
  "workflow_request_access(m.request_id,true)",
  "public.workflow_command(jsonb_build_object('action','recordInterest'",
  "ai_content_hash=e.content_hash",
  "embedding <=> p_query",
  "public.can_read_portion(s.portion_id)",
  "public.workflow_suitable(p_request,s.portion_id)",
  "grant execute on function public.ai2_candidates",
])
  assert.ok(sql.includes(contract), `Missing AI2 SQL contract: ${contract}`);
assert.ok(!/returns table[^;]*embedding\s+extensions\.vector/is.test(sql));
assert.match(
  sql,
  /not exists\(select 1 from public\.stock_portions child where child\.parent_portion_id=s\.portion_id and child\.active\)/,
);
console.log("PASS AI2 pure SQL contract assertions (not native behavior)");
