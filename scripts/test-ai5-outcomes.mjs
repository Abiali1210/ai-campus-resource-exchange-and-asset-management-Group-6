import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./workflow-test-support.mjs";
const h = await testDatabase();
const { db, as, fixture, person, dispatched, requester } = h;
const biz = person("business_administrator"),
  sysadmin = person("system_administrator"),
  repScience = h.receiver,
  engineering = fixture.departments[0].departmentId,
  science = fixture.departments[1].departmentId;
let count = 0;
async function check(name, fn) {
  await fn();
  count++;
  console.log("PASS " + name);
}
const denied = (fn) =>
  assert.rejects(fn, /Forbidden|Unauthorized|permission denied/);
const breakdown = (user, dep = null, start = h.today, end = h.today) =>
  as(user, "select public.ai5_outcome_breakdown($1,$2,$3) r", [
    start,
    end,
    dep,
  ]).then((r) => r.rows[0].r);
const call = (user, sql, args) => as(user, sql, args).then((r) => r.rows[0].r);
const v2Text = (f) =>
  `Headline: Recorded activity\nDemand: ${f.open_requests} of ${f.requests_submitted} submitted requests remain open; ${f.non_open_requests} is non-open, for a ${f.open_request_rate_percent}% open-request rate\nTransfer activity: ${f.units_successfully_transferred} units were transferred across ${f.completed_transfers} completed transfers, averaging ${f.units_per_completed_transfer} units per completed transfer\nInterpretation: Demand remains visible across the reporting snapshot\nLimitation: These figures describe recorded activity only`;
const recv = (t, extra = {}) =>
  h.transfer(h.receiver, t, "receive", {
    qty: t.qty ?? 2,
    condition: "Good",
    location: "Science / Lab",
    accept: true,
    ...extra,
  });
try {
  const base = await breakdown(biz);
  const done = await dispatched(2);
  await recv(done.t, { qty: 2 });
  const disputed = await dispatched(1);
  await recv(disputed.t, { qty: 0, accept: false });
  await dispatched(1);

  await check(
    "breakdown separates completed, pending, disputed, canceled, returned",
    async () => {
      const s = await breakdown(biz);
      const d = (g, k) => s[g][k] - base[g][k];
      assert.equal(d("requests", "submitted"), 3);
      assert.equal(d("requests", "requestedUnits"), 4);
      assert.equal(d("allocations", "approved"), 3);
      assert.equal(d("allocations", "acceptedUnits"), 2);
      assert.equal(d("transfers", "total"), 3);
      assert.equal(d("transfers", "completed"), 1);
      assert.equal(d("transfers", "completedUnits"), 2);
      assert.equal(d("transfers", "disputed"), 1);
      assert.equal(d("transfers", "pending"), 1);
      assert.equal(d("transfers", "canceled"), 0);
      assert.equal(d("transfers", "returned"), 0);
      assert.equal(JSON.stringify(s).includes("ost"), false, "no cost fields");
    },
  );
  await check("department and period filters", async () => {
    assert.equal(
      (await breakdown(biz, science)).scope.departmentName,
      "Science",
    );
    assert.ok((await breakdown(biz, science)).requests.submitted >= 3);
    assert.equal((await breakdown(biz, engineering)).requests.submitted, 0);
    assert.equal(
      (await breakdown(biz, null, "2020-01-01", "2020-01-31")).requests
        .submitted,
      0,
    );
  });
  await check(
    "only business administrators; validation of period and scope",
    async () => {
      for (const u of [repScience, sysadmin, requester])
        await denied(() => breakdown(u));
      await denied(() =>
        as(
          null,
          "select public.ai5_outcome_breakdown($1,$2,null)",
          [h.today, h.today],
          "anon",
        ),
      );
      await assert.rejects(
        () => breakdown(biz, null, h.today, "2020-01-01"),
        /Validation/,
      );
      await assert.rejects(
        () => breakdown(biz, null, "2020-01-01", h.today),
        /Validation/,
      );
      await assert.rejects(
        () => breakdown(biz, null, h.today, "2999-01-01"),
        /Validation/,
      );
      await assert.rejects(() => breakdown(biz, randomUUID()), /Validation/);
    },
  );
  await check(
    "report lifecycle is audited once per real change, without narrative text",
    async () => {
      const snap = await call(biz, "select public.ai5_capture_report($1) r", [
        "audit-1",
      ]);
      await call(biz, "select public.ai5_capture_report($1) r", ["audit-1"]); // replay
      const key = "gen-1",
        text = v2Text(snap.facts);
      const save = () =>
        call(
          biz,
          "select public.ai5_save_generation($1,$2,'gemini-3.5-flash-lite',$3,'{}'::jsonb) r",
          [snap.snapshot_id, key, text],
        );
      const n = await save();
      await save(); // replay
      const edited = text.replace("Recorded activity", "Edited headline");
      await call(biz, "select public.ai5_edit_narrative($1,$2) r", [
        n.narrative_id,
        edited,
      ]);
      await call(biz, "select public.ai5_mark_ready($1) r", [n.narrative_id]);
      await call(biz, "select public.ai5_publish_narrative($1) r", [
        n.narrative_id,
      ]);
      const rows = (
        await db.query(
          "select event,actor_id,before_data,after_data from public.audit_logs where target_type='report' and target_id in ($1,$2) order by occurred_at,audit_id",
          [snap.snapshot_id, n.narrative_id],
        )
      ).rows;
      const events = rows.map((r) => r.event).sort();
      assert.deepEqual(events, [
        "report.narrative_edited",
        "report.narrative_generated",
        "report.narrative_published",
        "report.narrative_ready",
        "report.snapshot_captured",
      ]);
      for (const r of rows) {
        assert.equal(r.actor_id, biz.userId);
        assert.equal(
          JSON.stringify(r).includes("Headline"),
          false,
          "narrative text not stored in audit",
        );
      }
    },
  );
  console.log(
    `\n${count} AI5 outcome/audit PostgreSQL checks passed (PGlite, synthetic Auth adapter).`,
  );
} finally {
  await db.close();
}
