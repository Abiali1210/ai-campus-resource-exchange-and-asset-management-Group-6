// C9 activity report: PostgreSQL checks on PGlite with the synthetic Auth adapter.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./workflow-test-support.mjs";

const h = await testDatabase();
const { as, fixture, person, dispatched, request, requester, rep, receiver } =
  h;
const engineering = fixture.departments[0].departmentId,
  science = fixture.departments[1].departmentId;
const biz = person("business_administrator"),
  engRequester = person("requester", engineering),
  facilities = h.facilities,
  finance = person("finance");
let count = 0;
async function check(name, fn) {
  await fn();
  count++;
  console.log("PASS " + name);
}
const report = (user, dep = null, start = h.today, end = h.today) =>
  as(user, "select public.c9_activity_report($1,$2,$3) r", [
    start,
    end,
    dep,
  ]).then((r) => r.rows[0].r);
const ids = (rows, key) => new Set(rows.map((r) => r[key]));

try {
  // Science requester: one completed transfer, one still in transit.
  const done = await dispatched(2);
  const received = await h.transfer(receiver, done.t, "receive", {
    qty: 2,
    condition: "Good",
    location: "Science / Lab",
    accept: true,
  });
  const moving = await dispatched(1);
  // Engineering requester: a request with no transfer, invisible to Science.
  const engOnly = await request(
    1,
    { purpose: "Engineering only" },
    engRequester,
  );

  await check(
    "admin sees every request and transfer with derived fields",
    async () => {
      const r = await report(biz);
      assert.equal(r.scope.visibility, "institution");
      const reqIds = ids(r.requests, "requestId");
      for (const q of [done.req, moving.req, engOnly])
        assert.ok(reqIds.has(q.requestId));
      const doneRow = r.requests.find(
        (q) => q.requestId === done.req.requestId,
      );
      assert.equal(doneRow.requestedQty, 2);
      assert.equal(doneRow.acceptedQty, 2);
      assert.equal(doneRow.remainingQty, 0);
      assert.equal(doneRow.departmentName, "Science");
      assert.ok(doneRow.requesterName && doneRow.categoryName);
      const t = r.transfers.find((x) => x.transferId === received.transferId);
      assert.equal(t.state, "Completed");
      assert.equal(t.supplierDepartmentName, "Engineering");
      assert.equal(t.receiverDepartmentName, "Science");
      assert.ok(t.dispatchedAt && t.receivedAt && t.scheduledAt);
      const m = r.transfers.find((x) => x.transferId === moving.t.transferId);
      assert.equal(m.state, "In Transit");
      assert.equal(m.receivedAt, null);
      assert.equal(/cost/i.test(JSON.stringify(r)), false, "no cost fields");
    },
  );

  await check("non-admins only see rows they can already access", async () => {
    const own = await report(requester);
    assert.equal(own.scope.visibility, "permitted");
    const ownReq = ids(own.requests, "requestId");
    assert.ok(
      ownReq.has(done.req.requestId) && ownReq.has(moving.req.requestId),
    );
    assert.equal(ownReq.has(engOnly.requestId), false);
    assert.equal(own.transfers.length >= 2, true);

    const eng = await report(engRequester);
    assert.deepEqual([...ids(eng.requests, "requestId")], [engOnly.requestId]);
    assert.equal(eng.transfers.length, 0);

    // Supplier representative and assigned Facilities see the transfers.
    for (const u of [rep, facilities]) {
      const tIds = ids((await report(u)).transfers, "transferId");
      assert.ok(tIds.has(received.transferId) && tIds.has(moving.t.transferId));
    }
    // A role with no workflow participation sees nothing.
    const fin = await report(finance);
    assert.equal(fin.requests.length + fin.transfers.length, 0);
  });

  await check("department and period filters", async () => {
    const sci = await report(biz, science);
    assert.equal(sci.scope.departmentName, "Science");
    assert.equal(ids(sci.requests, "requestId").has(engOnly.requestId), false);
    assert.ok(ids(sci.transfers, "transferId").has(received.transferId));
    // Engineering is the supplier, so its filter keeps the transfers but not Science requests.
    const eng = await report(biz, engineering);
    assert.ok(ids(eng.requests, "requestId").has(engOnly.requestId));
    assert.equal(ids(eng.requests, "requestId").has(done.req.requestId), false);
    assert.ok(ids(eng.transfers, "transferId").has(received.transferId));
    const old = await report(biz, null, "2020-01-01", "2020-01-31");
    assert.equal(old.requests.length + old.transfers.length, 0);
  });

  await check("validation and anonymous denial", async () => {
    await assert.rejects(
      () => report(biz, null, h.today, "2020-01-01"),
      /Validation/,
    );
    await assert.rejects(
      () => report(biz, null, "2020-01-01", h.today),
      /Validation/,
    );
    await assert.rejects(
      () => report(biz, null, h.today, "2999-01-01"),
      /Validation/,
    );
    await assert.rejects(() => report(biz, randomUUID()), /Validation/);
    await assert.rejects(
      () =>
        as(
          null,
          "select public.c9_activity_report($1,$2,null)",
          [h.today, h.today],
          "anon",
        ),
      /permission denied|Unauthorized/,
    );
    await assert.rejects(
      () =>
        as(biz, "select public.c9_can_read_transfer($1)", [
          received.transferId,
        ]),
      /permission denied/,
    );
  });

  console.log(
    `\n${count} C9 activity report PostgreSQL checks passed (PGlite, synthetic Auth adapter).`,
  );
} finally {
  await h.db.close();
}
