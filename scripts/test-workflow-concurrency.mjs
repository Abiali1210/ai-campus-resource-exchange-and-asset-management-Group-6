import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./workflow-test-support.mjs";
if (!process.env.WORKFLOW_TEST_DATABASE_URL) {
  console.error(
    "BLOCKED: set WORKFLOW_TEST_DATABASE_URL to a fresh, empty, disposable native PostgreSQL database. PGlite cannot test overlapping transactions.",
  );
  process.exit(1);
}
const h = await testDatabase();
const {
  pool,
  db,
  rep,
  requester,
  asset,
  request,
  interest,
  approve,
  workspace,
} = h;
// Hold the exact row both transactions need, then verify BOTH real backends
// are waiting on database locks before letting either transaction continue.
// A timeout fails the test; no Promise.all-on-one-connection simulation.
async function overlap(lockSql, lockArgs, inputs) {
  const blocker = await pool.connect();
  let attempts = [];
  try {
    await blocker.query("begin");
    await blocker.query(lockSql, lockArgs);
    attempts = inputs.map(async (input) => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("set local role authenticated");
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          rep.userId,
        ]);
        const out = await c.query(
          "select public.workflow_command($1::jsonb) result",
          [JSON.stringify(input)],
        );
        await c.query("commit");
        return out.rows[0].result;
      } catch (e) {
        await c.query("rollback");
        throw e;
      } finally {
        c.release();
      }
    });
    // Attach rejection handlers immediately while polling the server.
    const settled = Promise.allSettled(attempts);
    const deadline = Date.now() + 8000;
    let observed = false;
    while (Date.now() < deadline) {
      const { rows } = await pool.query(
        "select count(*)::integer n from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query like 'select public.workflow_command%'",
      );
      if (rows[0].n === 2) {
        observed = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(
      observed,
      true,
      "both independent SQL sessions must actually overlap and wait on row locks",
    );
    await blocker.query("commit");
    return await settled;
  } finally {
    await blocker.query("rollback");
    blocker.release();
  }
}
const approval = (i, qty = 1, key = randomUUID()) => ({
  action: "approveReservation",
  interestId: i.interestId,
  expectedVersion: i.version,
  qty,
  reason: "Concurrent synthetic approval",
  operationKey: key,
});
function exactlyOne(results) {
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(
    results.find((r) => r.status === "rejected").reason.message,
    /Conflict/,
  );
}
try {
  // Different requests contend for a single physical unit.
  const s = await asset(),
    q1 = await request(),
    q2 = await request();
  const i1 = await interest(q1, s),
    i2 = await interest(q2, s);
  exactlyOne(
    await overlap(
      "select asset_id from public.assets where asset_id=$1 for update",
      [s.assetId],
      [approval(i1), approval(i2)],
    ),
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::integer n from public.reservations where source_portion_id=$1 and status='Active'",
        [s.portionId],
      )
    ).rows[0].n,
    1,
  );
  console.log(
    "PASS overlapping approvals for the last unit: exactly one commits (two independent blocked sessions observed)",
  );
  // Different stock rows contend for the same one-unit remaining demand.
  const a = await asset(),
    b = await asset(),
    q = await request(),
    ia = await interest(q, a),
    ib = await interest(q, b);
  exactlyOne(
    await overlap(
      "select request_id from public.resource_requests where request_id=$1 for update",
      [q.requestId],
      [approval(ia), approval(ib)],
    ),
  );
  const tracked = (await workspace(requester)).requests.find(
    (r) => r.requestId === q.requestId,
  );
  assert.deepEqual([tracked.allocatedQty, tracked.remainingQty], [1, 0]);
  console.log(
    "PASS overlapping allocations on different stock against remaining demand: exactly one commits",
  );
  // A network retry can overlap the original command without duplicating records.
  const retryStock = await asset(),
    retryRequest = await request(),
    ii = await interest(retryRequest, retryStock),
    input = approval(ii);
  const replay = await overlap(
    "select request_id from public.resource_requests where request_id=$1 for update",
    [retryRequest.requestId],
    [input, input],
  );
  assert.equal(replay.filter((r) => r.status === "fulfilled").length, 2);
  assert.deepEqual(replay[0].value, replay[1].value);
  assert.equal(
    (
      await db.query(
        "select count(*)::integer n from public.audit_logs where operation_key=$1",
        [input.operationKey],
      )
    ).rows[0].n,
    1,
  );
  console.log(
    "PASS overlapping identical operation retries return one reservation and one audit outcome",
  );
  // Parent splitting also serializes competing partial allocations safely.
  const batch = await asset(4),
    rq1 = await request(3),
    rq2 = await request(3),
    bi1 = await interest(rq1, batch, 3),
    bi2 = await interest(rq2, batch, 3);
  exactlyOne(
    await overlap(
      "select asset_id from public.assets where asset_id=$1 for update",
      [batch.assetId],
      [approval(bi1, 3), approval(bi2, 3)],
    ),
  );
  const sum = (
    await db.query(
      "select sum(qty)::integer qty from public.stock_portions where asset_id=$1 and active",
      [batch.assetId],
    )
  ).rows[0].qty;
  assert.equal(sum, 4);
  console.log(
    "PASS overlapping partial batch approvals preserve active-leaf conservation and reject stale parent",
  );
  console.log(
    "\n4 native PostgreSQL concurrency checks passed. Synthetic Auth adapter; no hosted Supabase evidence.",
  );
} finally {
  await db.close();
}
