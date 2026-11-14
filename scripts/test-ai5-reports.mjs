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
      const qualifyingActivity = await db.query(
        "select min(ts) ts from (select submitted_at ts from public.resource_requests where submitted_at<=$1 union all select h.recorded_at from public.handovers h join public.transfers t using(transfer_id) where t.state='Completed' and h.kind in ('Receipt','Reconciliation') and h.accepted and h.recorded_at<=$1) activity",
        [snapshot.captured_at],
      );
      assert.equal(
        Date.parse(snapshot.period_start),
        qualifyingActivity.rows[0].ts.getTime(),
      );
      assert.ok(open.requestId);
    },
  );
  await check(
    "completed transfer facts require accepted receipt or reconciliation evidence by capture time and count each transfer once",
    async () => {
      const before = await capture(admin, "evidence-before");
      const receipt = await dispatched(2);
      await h.transfer(receiver, receipt.t, "receive", {
        qty: 2,
        condition: "Good",
        accept: true,
        location: "Lab",
      });
      await db.query(
        "insert into public.handovers (transfer_id,recorded_by,kind,qty,condition,accepted,holder_id,location,reason,recorded_at) select transfer_id,recorded_by,'Reconciliation',qty,condition,accepted,holder_id,location,reason,recorded_at from public.handovers where transfer_id=$1 and kind='Receipt'",
        [receipt.t.transferId],
      );
      const reconciliation = await dispatched(3);
      let reconciliationTransfer = await h.transfer(
        receiver,
        reconciliation.t,
        "receive",
        {
          qty: 1,
          condition: "Poor",
          accept: false,
          location: "Bay",
        },
      );
      await h.transfer(receiver, reconciliationTransfer, "reconcile", {
        qty: 3,
        condition: "Good",
        accept: true,
        location: "Lab",
      });
      const future = await dispatched(4);
      await h.transfer(receiver, future.t, "receive", {
        qty: 4,
        condition: "Good",
        accept: true,
        location: "Lab",
      });
      await db.query(
        "update public.handovers set recorded_at=transaction_timestamp()+interval '1 day' where transfer_id=$1 and kind='Receipt'",
        [future.t.transferId],
      );
      const after = await capture(admin, "evidence-after");
      assert.equal(
        after.facts.completed_transfers - before.facts.completed_transfers,
        2,
      );
      assert.equal(
        after.facts.units_successfully_transferred -
          before.facts.units_successfully_transferred,
        5,
      );
      const qualifying = await db.query(
        "select min(ts) ts from (select submitted_at ts from public.resource_requests where submitted_at<=$1 union all select h.recorded_at from public.handovers h join public.transfers t using(transfer_id) where t.state='Completed' and h.kind in ('Receipt','Reconciliation') and h.accepted and h.recorded_at<=$1) activity",
        [after.captured_at],
      );
      assert.equal(
        Date.parse(after.period_start),
        qualifying.rows[0].ts.getTime(),
      );
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
      assert.equal(second.snapshot_id, first.snapshot_id);
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
  await check(
    "narrative authorization, exact snapshot binding, lifecycle and visibility",
    async () => {
      const snap = await capture(admin, "narrative-snapshot");
      let text;
      const call = (user, fn, args) =>
        as(
          user,
          `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) result`,
          args,
        ).then((r) => r.rows[0].result);
      const save = (user, snapshot, key, text) =>
        as(
          user,
          "select public.ai5_save_generation($1,$2,$3,$4,$5::jsonb) result",
          [
            snapshot,
            key,
            "gemini-3.5-flash-lite",
            text,
            JSON.stringify({ request: "test" }),
          ],
        ).then((r) => r.rows[0].result);
      const replay = (user, snapshot, key) =>
        as(user, "select public.ai5_generation_replay($1,$2) result", [
          snapshot,
          key,
        ]).then((r) => r.rows[0].result);
      await denied(() =>
        as(rep, "select public.ai5_generation_context($1)", [snap.snapshot_id]),
      );
      await denied(() =>
        as(null, "select public.ai5_generation_context($1)", [
          snap.snapshot_id,
        ]),
      );
      await denied(() =>
        as(rep, "select public.ai5_generation_replay($1,$2)", [
          snap.snapshot_id,
          "none",
        ]),
      );
      await denied(() =>
        as(null, "select public.ai5_generation_replay($1,$2)", [
          snap.snapshot_id,
          "none",
        ]),
      );
      const inactive = person("system_administrator");
      await db.query(
        "update public.profiles set active=false where user_id=$1",
        [inactive.userId],
      );
      await denied(() =>
        as(inactive, "select public.ai5_generation_context($1)", [
          snap.snapshot_id,
        ]),
      );
      await denied(() =>
        as(inactive, "select public.ai5_generation_replay($1,$2)", [
          snap.snapshot_id,
          "none",
        ]),
      );
      text = `Report records ${snap.facts.requests_submitted} requests, ${snap.facts.open_requests} open requests, ${snap.facts.completed_transfers} completed transfers and ${snap.facts.units_successfully_transferred} units transferred.`;
      const row = await save(admin, snap.snapshot_id, "narrative-key", text);
      await assert.rejects(
        () =>
          as(
            admin,
            "select public.ai5_save_generation($1,$2,$3,$4,$5::jsonb)",
            [
              snap.snapshot_id,
              "oversized-metadata",
              "gemini-3.5-flash-lite",
              text,
              JSON.stringify({ value: "x".repeat(2100) }),
            ],
          ),
        /Validation/,
      );
      const boundedSnapshot = await capture(admin, "bounded-metadata-snapshot");
      const bounded = await as(
        admin,
        "select public.ai5_save_generation($1,$2,$3,$4,$5::jsonb) result",
        [
          boundedSnapshot.snapshot_id,
          "bounded-metadata",
          "gemini-3.5-flash-lite",
          text,
          JSON.stringify({ request: "test" }),
        ],
      );
      assert.equal(bounded.rows[0].result.request_metadata.request, "test");
      await assert.rejects(
        () =>
          save(
            admin,
            snap.snapshot_id,
            "fabricated-key",
            "Report records 999 requests.",
          ),
        /unsupported narrative/,
      );
      const monthSnapshot = await capture(admin, "month-name-snapshot");
      assert.equal(
        (
          await save(
            admin,
            monthSnapshot.snapshot_id,
            "month-name",
            "Report covers January activity.",
          )
        ).generated_text,
        "Report covers January activity.",
      );
      const openSnapshot = await capture(admin, "open-prose-snapshot");
      assert.equal(
        (
          await save(
            admin,
            openSnapshot.snapshot_id,
            "open-prose",
            "Activity may remain open.",
          )
        ).generated_text,
        "Activity may remain open.",
      );
      const substringSnapshot = await capture(
        admin,
        "month-substring-snapshot",
      );
      assert.equal(
        (
          await save(
            admin,
            substringSnapshot.snapshot_id,
            "month-substring",
            "Report covers marjan activity.",
          )
        ).generated_text,
        "Report covers marjan activity.",
      );
      await assert.rejects(
        () =>
          save(
            admin,
            snap.snapshot_id,
            "unit-claim",
            `Report records ${snap.facts.requests_submitted} kg.`,
          ),
        /unsupported narrative/,
      );
      assert.deepEqual(
        await save(admin, snap.snapshot_id, "narrative-key", text),
        row,
      );
      const exactReplay = await replay(
        admin,
        snap.snapshot_id,
        "narrative-key",
      );
      assert.deepEqual(exactReplay.snapshot, snap);
      assert.deepEqual(exactReplay.report, row);
      const otherSnapshot = await capture(admin, "other-snapshot");
      await assert.rejects(
        () => replay(admin, otherSnapshot.snapshot_id, "narrative-key"),
        /conflict/,
      );
      await assert.rejects(
        () => save(admin, otherSnapshot.snapshot_id, "narrative-key", text),
        /conflict/,
      );
      await assert.rejects(
        () =>
          as(
            admin,
            "select public.ai5_save_generation($1,'bad','wrong-model','x','{}')",
            [snap.snapshot_id],
          ),
        /Validation/,
      );
      await denied(() =>
        as(rep, "select public.ai5_edit_narrative($1,'Edited')", [
          row.narrative_id,
        ]),
      );
      const countSources = async () =>
        (
          await db.query(
            `select (select count(*)::int from public.resource_requests) requests, (select count(*)::int from public.transfers) transfers, (select count(*)::int from public.stock_portions) stock_portions, (select count(*)::int from public.ai5_report_snapshots) snapshots`,
          )
        ).rows[0];
      const beforeEdit = await countSources();
      const edited = await call(admin, "ai5_edit_narrative", [
        row.narrative_id,
        `Edited report repeats ${snap.facts.requests_submitted} requests and ${snap.facts.requests_submitted} requests.`,
      ]);
      assert.equal(
        edited.current_text,
        `Edited report repeats ${snap.facts.requests_submitted} requests and ${snap.facts.requests_submitted} requests.`,
      );
      await assert.rejects(
        () =>
          call(admin, "ai5_edit_narrative", [row.narrative_id, "999 requests"]),
        /Validation/,
      );
      await assert.rejects(
        () =>
          call(admin, "ai5_edit_narrative", [
            row.narrative_id,
            "Report claims impact.",
          ]),
        /Validation/,
      );
      const ready = await call(admin, "ai5_mark_ready", [row.narrative_id]);
      assert.equal(ready.status, "Ready");
      await assert.rejects(
        () =>
          call(admin, "ai5_edit_narrative", [row.narrative_id, "Late edit"]),
        /Invalid transition|Validation or invalid transition/,
      );
      const published = await call(admin, "ai5_publish_narrative", [
        row.narrative_id,
      ]);
      assert.equal(published.status, "Published");
      assert.deepEqual(await countSources(), beforeEdit);
      await assert.rejects(
        () => call(admin, "ai5_publish_narrative", [row.narrative_id]),
        /Invalid transition/,
      );
      await assert.rejects(
        () =>
          db.query(
            "delete from public.ai5_report_narratives where narrative_id=$1",
            [row.narrative_id],
          ),
        /Immutable/,
      );
      const visible = await as(
        rep,
        "select * from public.ai5_published_narratives()",
      );
      assert.equal(visible.rows.length, 1);
      assert.equal(
        visible.rows[0].ai5_published_narratives.snapshot.facts
          .requests_submitted,
        snap.facts.requests_submitted,
      );
      await denied(() =>
        as(rep, "select * from public.ai5_narrative_workspace()"),
      );
      const workspaceRows = await as(
        admin,
        "select * from public.ai5_narrative_workspace()",
      );
      const workspaceItems = workspaceRows.rows.map(
        (r) => r.ai5_narrative_workspace,
      );
      const currentItem = workspaceItems.find(
        (x) => x.snapshot.snapshot_id === snap.snapshot_id,
      );
      assert.ok(currentItem);
      assert.equal(currentItem.narrative.narrative_id, row.narrative_id);
      assert.ok(workspaceItems.length >= 25);
      const factsAfter = await db.query(
        "select facts from public.ai5_report_snapshots where snapshot_id=$1",
        [snap.snapshot_id],
      );
      assert.deepEqual(factsAfter.rows[0].facts, snap.facts);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.ai5_report_narratives where snapshot_id=$1",
            [snap.snapshot_id],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  console.log(`\n${count} AI5 PGlite database checks passed.`);
} finally {
  await db.close();
}
