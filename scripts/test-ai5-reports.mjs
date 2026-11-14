import assert from "node:assert/strict";
import { testDatabase } from "./workflow-test-support.mjs";

const h = await testDatabase();
const { db, as, person, requester, rep, receiver, facilities, dispatched } = h;
const admin = person("business_administrator");
const denied = (fn) =>
  assert.rejects(fn, /Forbidden|Unauthorized|permission denied/);
const capture = (user, key) =>
  as(user, "select public.ai5_capture_report($1) result", [key]).then(
    (r) => r.rows[0].result,
  );
const workspace = (user, limit = 20) =>
  as(
    user,
    "select coalesce(jsonb_agg(x), '[]'::jsonb) result from public.ai5_report_workspace($1) x",
    [limit],
  ).then((r) => r.rows[0].result);
let count = 0;
async function check(name, fn) {
  await fn();
  count++;
  console.log(`PASS ${name}`);
}

try {
  await check(
    "facts count only completed transfers, excluding returned, disputed, canceled, and in-transit transfers",
    async () => {
      const { t: completed } = await dispatched(2);
      await h.transfer(receiver, completed, "receive", {
        qty: 2,
        condition: "Good",
        accept: true,
        location: "Lab",
      });
      const { t: reconciled } = await dispatched(2);
      let reconciliation = await h.transfer(receiver, reconciled, "receive", {
        qty: 1,
        condition: "Poor",
        accept: false,
        location: "Bay",
      });
      reconciliation = await h.transfer(receiver, reconciliation, "reconcile", {
        qty: 2,
        condition: "Good",
        accept: true,
        location: "Lab",
      });
      const { t: returned } = await dispatched();
      let returnedNow = await h.transfer(receiver, returned, "receive", {
        qty: 1,
        condition: "Poor",
        accept: false,
        location: "Bay",
      });
      await h.transfer(rep, returnedNow, "confirmReturn", {
        qty: 1,
        condition: "Good",
        location: "Store",
      });
      const { t: rejected } = await dispatched();
      await h.transfer(receiver, rejected, "receive", {
        qty: 1,
        condition: "Poor",
        accept: false,
        location: "Bay",
      });
      const canceledStock = await h.asset();
      const canceledRequest = await h.request();
      const canceledInterest = await h.interest(canceledRequest, canceledStock);
      const canceledTransfer = await h.approve(canceledInterest);
      await h.transfer(requester, canceledTransfer, "cancelTransfer");
      await h.dispatched(); // Explicit In Transit transfer, intentionally unfinished.
      const canceled = await h.request();
      await h.command(requester, {
        action: "cancelRequest",
        requestId: canceled.requestId,
        expectedVersion: 1,
        reason: "Withdrawn",
      });
      const closed = await h.request();
      await h.command(requester, {
        action: "closeRequest",
        requestId: closed.requestId,
        expectedVersion: 1,
        reason: "No longer needed",
      });
      const open = await h.request(3);
      const snapshot = await capture(admin, "facts-1");
      assert.deepEqual(snapshot.facts, {
        requests_submitted: 9,
        open_requests: 5,
        completed_transfers: 2,
        units_successfully_transferred: 4,
      });
      const activity = await db.query(
        "select min(ts) ts from (select submitted_at ts from public.resource_requests union all select h.recorded_at from public.handovers h join public.transfers t using(transfer_id) where t.state='Completed') a",
      );
      assert.equal(
        Date.parse(snapshot.period_start),
        activity.rows[0].ts.getTime(),
      );
      assert.ok(open.requestId);
    },
  );
  await check(
    "role denial, retry idempotency, immutable rows and workspace permissions/limit",
    async () => {
      await denied(() => capture(rep, "denied"));
      const inactive = person("system_administrator");
      await db.query(
        "insert into public.user_roles values($1,'business_administrator')",
        [inactive.userId],
      );
      await db.query(
        "update public.profiles set active=false where user_id=$1",
        [inactive.userId],
      );
      await denied(() => capture(inactive, "inactive"));
      await db.query(
        "update public.profiles set active=true where user_id=$1",
        [inactive.userId],
      );
      const first = await capture(admin, "retry-key");
      const second = await capture(admin, "retry-key");
      assert.deepEqual(second, first);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.ai5_report_snapshots where created_by=$1 and idempotency_key='retry-key'",
            [admin.userId],
          )
        ).rows[0].n,
        1,
      );
      await assert.rejects(
        db.query(
          "update public.ai5_report_snapshots set facts='{}' where snapshot_id=$1",
          [first.snapshot_id],
        ),
        /Immutable/,
      );
      await assert.rejects(
        db.query(
          "delete from public.ai5_report_snapshots where snapshot_id=$1",
          [first.snapshot_id],
        ),
        /Immutable/,
      );
      await denied(() => workspace(rep));
      await denied(() => workspace(null));
      const snapshots = await Promise.all(
        Array.from({ length: 21 }, (_, i) => capture(admin, `limit-${i}`)),
      );
      assert.equal((await workspace(admin, 100)).length, 20);
      assert.equal((await workspace(admin, 0)).length, 1);
      assert.ok(snapshots.length);
    },
  );
  console.log(`\n${count} AI5 PGlite database checks passed.`);
} finally {
  await db.close();
}
