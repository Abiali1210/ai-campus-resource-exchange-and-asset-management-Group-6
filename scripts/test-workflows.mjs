import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./workflow-test-support.mjs";
const h = await testDatabase();
const {
  db,
  as,
  command,
  workspace,
  rep,
  receiver,
  requester,
  facilities,
  asset,
  request,
  interest,
  approve,
  transfer,
  dispatched,
  person,
  fixture,
} = h;
let count = 0;
async function check(name, fn) {
  await fn();
  count++;
  console.log("PASS " + name);
}
const denied = (fn, pattern = /Forbidden|Unauthorized|permission denied/) =>
  assert.rejects(fn, pattern);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
try {
  await check(
    "direct table and helper access denied to all ordinary roles",
    async () => {
      for (const table of [
        "resource_requests",
        "interests",
        "reservations",
        "transfers",
        "approvals",
        "handovers",
      ]) {
        await denied(() => as(requester, `select * from public.${table}`));
        await denied(() => as(rep, `delete from public.${table}`));
      }
      await denied(() =>
        as(rep, "select public.workflow_totals($1)", [randomUUID()]),
      );
      await denied(() => as(null, "select public.workflow_workspace()"));
      await denied(() => workspace(fixture.users.find((p) => !p.active)));
      await denied(() =>
        as(null, "select public.workflow_workspace()", [], "anon"),
      );
    },
  );
  await check(
    "request validation and role boundaries; forged department ignored",
    async () => {
      for (const qty of [0, -1, 1.5])
        await denied(() => request(qty), /Validation/);
      await denied(() => request(1, { purpose: "" }), /Validation/);
      await denied(
        () => request(1, { requiredDate: "2020-01-01" }),
        /Validation/,
      );
      await denied(
        () => request(1, { requiredDate: "2026-02-30" }),
        /Validation/,
      );
      await denied(() => request(1, { condition: null }), /Validation/);
      for (const role of [
        "system_administrator",
        "business_administrator",
        "facilities",
        "finance",
        "maintenance",
        "sustainability",
        "procurement",
      ])
        await denied(() => request(1, {}, person(role)));
      const r = await request(3, { departmentId: rep.departmentId });
      assert.equal(
        (await workspace(requester)).requests.find(
          (q) => q.requestId === r.requestId,
        ).departmentId,
        requester.departmentId,
      );
      assert.equal(
        (await workspace(person("requester"))).requests.some(
          (q) => q.requestId === r.requestId,
        ),
        false,
      );
    },
  );
  await check(
    "Interest links selection without allocation; supplier scope limited to linked needs",
    async () => {
      const s = await asset(5),
        r = await request(3);
      const before = await one(
        "select * from public.stock_portions where portion_id=$1",
        [s.portionId],
      );
      assert.equal(
        (await workspace(rep)).requests.some(
          (q) => q.requestId === r.requestId,
        ),
        false,
      );
      await interest(r, s, 2);
      assert.deepEqual(
        await one("select * from public.stock_portions where portion_id=$1", [
          s.portionId,
        ]),
        before,
      );
      const q = (await workspace(requester)).requests.find(
        (q) => q.requestId === r.requestId,
      );
      assert.deepEqual(
        [q.acceptedQty, q.allocatedQty, q.remainingQty],
        [0, 0, 3],
      );
      assert.equal(
        (await workspace(rep)).requests.some(
          (q) => q.requestId === r.requestId,
        ),
        true,
      );
      await denied(() => interest(r, s, 1, person("requester")));
    },
  );
  await check(
    "reservation rejects wrong role/department and identity self-approval across roles",
    async () => {
      const s = await asset(),
        r = await request(),
        i = await interest(r, s);
      for (const user of [
        requester,
        receiver,
        person("system_administrator"),
        person("business_administrator"),
      ])
        await denied(() => approve(i, 1, user));
      // Give a requesting supplier rep multiple roles. Neither role grants self approval.
      await db.query(
        "insert into public.user_roles values($1,'requester'),($1,'business_administrator')",
        [rep.userId],
      );
      const own = await request(1, {}, rep),
        self = await interest(own, s, 1, rep);
      await denied(() => approve(self, 1, rep), /self-approval/);
      // Interest creator differs from requester and is also barred from approving it.
      await db.query(
        "update public.profiles set department_id=$1 where user_id=$2",
        [rep.departmentId, requester.userId],
      );
      const proxyReq = await request(),
        proxy = await interest(proxyReq, s, 1, rep);
      await denied(() => approve(proxy, 1, rep), /self-approval/);
      await db.query(
        "update public.profiles set department_id=$1 where user_id=$2",
        [receiver.departmentId, requester.userId],
      );
    },
  );
  await check(
    "mandatory category/specifications/condition and positive quantity gates roll back",
    async () => {
      for (const extras of [
        { condition: "Unknown" },
        { condition: "Poor" },
        { specifications: {} },
        { specifications: { connector: "VGA" } },
        { categoryId: fixture.categories[1].categoryId },
      ]) {
        const s = await asset(1, extras),
          r = await request(),
          i = await interest(r, s);
        await denied(() => approve(i), /Conflict/);
        assert.equal(
          (
            await one(
              "select count(*)::integer n from public.reservations where interest_id=$1",
              [i.interestId],
            )
          ).n,
          0,
        );
      }
      const s = await asset(),
        r = await request(),
        i = await interest(r, s);
      for (const qty of [0, -1, 1.5, 2])
        await denied(() => approve(i, qty), /Validation|Conflict/);
    },
  );
  await check(
    "partial allocation conserves leaves; remaining demand blocks competing stock",
    async () => {
      const s = await asset(10),
        r = await request(5),
        i = await interest(r, s, 5),
        t = await approve(i, 3);
      const leaves = (
        await db.query(
          "select * from public.stock_portions where asset_id=$1 and active",
          [s.assetId],
        )
      ).rows;
      assert.equal(
        leaves.reduce((n, p) => n + p.qty, 0),
        10,
      );
      assert.equal(leaves.find((p) => p.state === "Available").qty, 7);
      assert.equal(
        (
          await one(
            "select active from public.stock_portions where portion_id=$1",
            [s.portionId],
          )
        ).active,
        false,
      );
      const q = (await workspace(requester)).requests.find(
        (q) => q.requestId === r.requestId,
      );
      assert.deepEqual(
        [q.requestedQty, q.acceptedQty, q.allocatedQty, q.remainingQty],
        [5, 0, 3, 2],
      );
      const other = await asset(3),
        i2 = await interest(r, other, 2);
      await denied(() => approve(i2, 3), /Conflict/);
      await approve(i2, 2);
      await denied(() => interest(r, other, 1), /Conflict|Forbidden/);
      await denied(
        () =>
          as(rep, "select public.set_publication($1,$2,false,$3)", [
            s.assetId,
            3,
            randomUUID(),
          ]),
        /Conflict/,
      );
      assert.ok(t.transferId);
    },
  );
  await check(
    "rejection is retained separately and leaves stock/demand open",
    async () => {
      const s = await asset(),
        r = await request(),
        i = await interest(r, s);
      await command(rep, {
        action: "rejectReservation",
        interestId: i.interestId,
        expectedVersion: i.version,
        reason: "Not suitable for this timing",
      });
      assert.equal(
        (await workspace(rep)).decisions.find(
          (a) => a.interest_id === i.interestId,
        ).decision,
        "Rejected",
      );
      assert.equal(
        (
          await one(
            "select state from public.stock_portions where portion_id=$1",
            [s.portionId],
          )
        ).state,
        "Available",
      );
      assert.equal(
        (await workspace(requester)).requests.find(
          (q) => q.requestId === r.requestId,
        ).remainingQty,
        1,
      );
    },
  );
  await check(
    "separate release approval; strict self/department and assigned Facilities authority",
    async () => {
      const s = await asset(),
        r = await request(),
        i = await interest(r, s);
      let t = await approve(i);
      await denied(
        () =>
          transfer(facilities, t, "dispatch", { qty: 1, location: "Trolley" }),
        /Forbidden/,
      );
      await denied(() =>
        transfer(receiver, t, "approveRelease", {
          facilitiesId: facilities.userId,
        }),
      );
      await denied(
        () =>
          transfer(rep, t, "approveRelease", {
            facilitiesId: requester.userId,
          }),
        /Validation/,
      );
      await db.query(
        "insert into public.user_roles values($1,'representative')",
        [requester.userId],
      );
      await db.query(
        "update public.profiles set department_id=$1 where user_id=$2",
        [rep.departmentId, requester.userId],
      );
      await denied(
        () =>
          transfer(requester, t, "approveRelease", {
            facilitiesId: facilities.userId,
          }),
        /self-approval/,
      );
      await db.query(
        "update public.profiles set department_id=$1 where user_id=$2",
        [receiver.departmentId, requester.userId],
      );
      await db.query(
        "delete from public.user_roles where user_id=$1 and role='representative'",
        [requester.userId],
      );
      t = await transfer(rep, t, "approveRelease", {
        facilitiesId: facilities.userId,
      });
      const outsider = { userId: randomUUID() };
      await db.query("insert into auth.users values($1)", [outsider.userId]);
      await db.query("insert into public.profiles values($1,$2,$3,true)", [
        outsider.userId,
        rep.departmentId,
        "Other Facilities",
      ]);
      await db.query("insert into public.user_roles values($1,'facilities')", [
        outsider.userId,
      ]);
      await denied(() =>
        transfer(outsider, t, "schedule", {
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
          arrangements: "Move",
        }),
      );
      await denied(
        () =>
          transfer(facilities, t, "schedule", {
            scheduledAt: "2099-01-01T12:00:00Z",
            arrangements: "Too late",
          }),
        /Validation/,
      );
      await transfer(facilities, t, "schedule", {
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        arrangements: "Trolley",
        handlingCost: 0,
        transportCost: 10,
      });
      const row = (await workspace(rep)).transfers.find(
        (x) => x.transferId === t.transferId,
      );
      assert.equal(row.approvals.length, 2);
      assert.equal(row.state, "Scheduled");
      assert.equal(Number(row.transportCost), 10);
    },
  );
  await check(
    "complete journey: dispatch changes physical tracking; receipt changes formal custody once",
    async () => {
      const { stock, req, t } = await dispatched(2);
      let s = await one(
        "select * from public.stock_portions where portion_id=$1",
        [stock.portionId],
      );
      assert.equal(s.owner_department_id, rep.departmentId);
      assert.equal(s.custodian_id, rep.userId);
      assert.equal(s.holder_id, facilities.userId);
      assert.equal(s.assigned_location, "Engineering / Store");
      assert.equal(s.state, "In Transfer");
      await denied(() =>
        transfer(requester, t, "receive", {
          qty: 2,
          condition: "Good",
          accept: true,
          location: "Lab",
        }),
      );
      await denied(() =>
        transfer(rep, t, "receive", {
          qty: 2,
          condition: "Good",
          accept: true,
          location: "Lab",
        }),
      );
      const input = {
        action: "receive",
        transferId: t.transferId,
        expectedVersion: t.version,
        qty: 2,
        condition: "Good",
        accept: true,
        location: "Science / Lab",
        reason: "Full quantity inspected",
        operationKey: randomUUID(),
      };
      const first = await command(receiver, input);
      assert.deepEqual(await command(receiver, input), first);
      s = await one("select * from public.stock_portions where portion_id=$1", [
        stock.portionId,
      ]);
      assert.equal(s.owner_department_id, receiver.departmentId);
      assert.equal(s.custodian_id, receiver.userId);
      assert.equal(s.holder_id, receiver.userId);
      assert.equal(s.state, "In Use");
      assert.equal(s.assigned_location, "Science / Lab");
      const q = (await workspace(requester)).requests.find(
        (q) => q.requestId === req.requestId,
      );
      assert.deepEqual(
        [q.status, q.acceptedQty, q.allocatedQty, q.remainingQty],
        ["Fulfilled", 2, 0, 0],
      );
      const supplierView = (await workspace(rep)).transfers.find(
        (x) => x.transferId === t.transferId,
      );
      assert.equal(supplierView.state, "Completed");
      assert.equal(supplierView.handovers.length, 2);
      await denied(
        () =>
          transfer(receiver, t, "receive", {
            qty: 2,
            condition: "Good",
            accept: true,
            location: "Lab",
          }),
        /stale/,
      );
    },
  );
  await check(
    "pre-dispatch cancellation and release rejection restore demand without clearing unsafe condition",
    async () => {
      for (const state of ["Pending Approval", "Approved", "Scheduled"]) {
        const s = await asset(3),
          r = await request(3),
          i = await interest(r, s, 3);
        let t = await approve(i, 2);
        if (state !== "Pending Approval")
          t = await transfer(rep, t, "approveRelease", {
            facilitiesId: facilities.userId,
          });
        if (state === "Scheduled")
          t = await transfer(facilities, t, "schedule", {
            scheduledAt: new Date(Date.now() + 3600000).toISOString(),
            arrangements: "Trolley",
          });
        await transfer(requester, t, "cancelTransfer");
        const q = (await workspace(requester)).requests.find(
          (q) => q.requestId === r.requestId,
        );
        assert.deepEqual([q.allocatedQty, q.remainingQty], [0, 3]);
      }
      const s = await asset(),
        r = await request(),
        i = await interest(r, s);
      let t = await approve(i);
      await db.query(
        "update public.stock_portions set condition='Poor' where portion_id=$1",
        [s.portionId],
      );
      await transfer(rep, t, "rejectRelease");
      assert.equal(
        (
          await one(
            "select state from public.stock_portions where portion_id=$1",
            [s.portionId],
          )
        ).state,
        "Unfit",
      );
    },
  );
  await check(
    "short/unsafe receipt stays disputed, allocated and in supplier formal custody",
    async () => {
      const { stock, req, t } = await dispatched(3);
      const updated = await transfer(receiver, t, "receive", {
        qty: 2,
        condition: "Poor",
        accept: true,
        location: "Science / Quarantine",
      });
      const row = (await workspace(receiver)).transfers.find(
        (x) => x.transferId === t.transferId,
      );
      assert.equal(row.state, "Disputed");
      assert.equal(row.ownerDepartmentId, rep.departmentId);
      assert.equal(row.custodianId, rep.userId);
      assert.equal(row.holderId, receiver.userId);
      const q = (await workspace(requester)).requests.find(
        (q) => q.requestId === req.requestId,
      );
      assert.deepEqual(
        [q.acceptedQty, q.allocatedQty, q.remainingQty],
        [0, 3, 0],
      );
      await denied(
        () => transfer(requester, updated, "cancelTransfer"),
        /moved stock/,
      );
      await denied(
        () =>
          transfer(rep, updated, "confirmReturn", {
            qty: 2,
            condition: "Good",
            location: "Store",
          }),
        /full physically/,
      );
      await denied(
        () =>
          transfer(receiver, updated, "reconcile", {
            qty: 3,
            condition: "Unknown",
            accept: true,
            location: "Lab",
          }),
        /full suitable/,
      );
      assert.equal(
        (
          await one(
            "select state from public.stock_portions where portion_id=$1",
            [stock.portionId],
          )
        ).state,
        "In Transfer",
      );
    },
  );
  await check(
    "reconciled full acceptance retains original discrepancy and completes exactly once",
    async () => {
      const { req, t } = await dispatched(2);
      let current = await transfer(receiver, t, "receive", {
        qty: 1,
        condition: "Good",
        accept: false,
        location: "Receiving bay",
      });
      current = await transfer(receiver, current, "reconcile", {
        qty: 2,
        condition: "Good",
        accept: true,
        location: "Science / Lab",
      });
      const row = (await workspace(receiver)).transfers.find(
        (x) => x.transferId === t.transferId,
      );
      assert.equal(row.state, "Completed");
      assert.deepEqual(
        row.handovers.map((h) => h.kind),
        ["Dispatch", "Receipt", "Reconciliation"],
      );
      assert.equal(
        (await workspace(requester)).requests.find(
          (q) => q.requestId === req.requestId,
        ).acceptedQty,
        2,
      );
      await denied(
        () =>
          transfer(receiver, current, "reconcile", {
            qty: 2,
            condition: "Good",
            accept: true,
            location: "Lab",
          }),
        /state/,
      );
    },
  );
  await check(
    "supplier-confirmed full returns restore demand; unsafe/unknown never become available",
    async () => {
      for (const condition of ["Good", "Poor", "Unknown"]) {
        const { stock, req, t } = await dispatched();
        let current = await transfer(receiver, t, "receive", {
          qty: 1,
          condition: "Poor",
          accept: false,
          location: "Bay",
        });
        await denied(() =>
          transfer(receiver, current, "confirmReturn", {
            qty: 1,
            condition,
            location: "Store",
          }),
        );
        await transfer(rep, current, "confirmReturn", {
          qty: 1,
          condition,
          location: "Engineering / Returned",
        });
        const row = (await workspace(rep)).transfers.find(
          (x) => x.transferId === t.transferId,
        );
        assert.equal(row.state, "Returned");
        assert.equal(row.ownerDepartmentId, rep.departmentId);
        assert.equal(row.custodianId, rep.userId);
        assert.equal(row.holderId, rep.userId);
        const q = (await workspace(requester)).requests.find(
          (q) => q.requestId === req.requestId,
        );
        assert.deepEqual(
          [q.acceptedQty, q.allocatedQty, q.remainingQty],
          [0, 0, 1],
        );
        assert.equal(
          (
            await one(
              "select state from public.stock_portions where portion_id=$1",
              [stock.portionId],
            )
          ).state,
          condition === "Good"
            ? "Available"
            : condition === "Poor"
              ? "Unfit"
              : "Registered",
        );
      }
    },
  );
  await check(
    "request cancellation/partial closure require reconciled allocations",
    async () => {
      const s = await asset(),
        req = await request(2),
        i = await interest(req, s);
      let t = await approve(i);
      let q = (await workspace(requester)).requests.find(
        (q) => q.requestId === req.requestId,
      );
      await denied(
        () =>
          command(requester, {
            action: "closeRequest",
            requestId: req.requestId,
            expectedVersion: q.version,
            reason: "Close",
          }),
        /active transfers/,
      );
      t = await transfer(rep, t, "approveRelease", {
        facilitiesId: facilities.userId,
      });
      t = await transfer(facilities, t, "schedule", {
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        arrangements: "Trolley",
      });
      t = await transfer(facilities, t, "dispatch", {
        qty: 1,
        location: "Transit",
      });
      await transfer(receiver, t, "receive", {
        qty: 1,
        condition: "Good",
        accept: true,
        location: "Lab",
      });
      q = (await workspace(requester)).requests.find(
        (q) => q.requestId === req.requestId,
      );
      assert.equal(q.status, "Partially Fulfilled");
      assert.equal(q.remainingQty, 1);
      await denied(
        () =>
          command(requester, {
            action: "cancelRequest",
            requestId: q.requestId,
            expectedVersion: q.version,
            reason: "Cancel",
          }),
        /close partially/,
      );
      await command(requester, {
        action: "closeRequest",
        requestId: q.requestId,
        expectedVersion: q.version,
        reason: "One unit is enough",
      });
      const laterStock = await asset();
      await denied(() => interest(req, laterStock), /no longer open/);
      const r2 = await request();
      await command(requester, {
        action: "cancelRequest",
        requestId: r2.requestId,
        expectedVersion: 1,
        reason: "Need withdrawn",
      });
    },
  );
  await check(
    "stale versions and stable operation keys reject changed inputs and duplicate outcomes",
    async () => {
      const s = await asset(),
        r = await request(),
        i = await interest(r, s),
        key = randomUUID();
      const input = {
        action: "approveReservation",
        interestId: i.interestId,
        expectedVersion: i.version,
        qty: 1,
        reason: "Reviewed",
        operationKey: key,
      };
      const first = await command(rep, input);
      assert.deepEqual(await command(rep, input), first);
      await denied(
        () => command(rep, { ...input, reason: "Different" }),
        /key reused/,
      );
      await denied(() => approve(i), /stale/);
      assert.equal(
        (
          await one(
            "select count(*)::integer n from public.reservations where interest_id=$1",
            [i.interestId],
          )
        ).n,
        1,
      );
    },
  );
  await check(
    "audit actor/time/reason and integration events commit with mutation or roll back together",
    async () => {
      const s = await asset(),
        r = await request(),
        i = await interest(r, s),
        key = randomUUID();
      const input = {
        action: "approveReservation",
        interestId: i.interestId,
        expectedVersion: i.version,
        qty: 1,
        reason: "Mandatory evidence checked",
        operationKey: key,
      };
      // Force audit persistence to fail; reservation/split/approval and key must roll back.
      await db.exec(
        "create function public.test_fail_audit() returns trigger language plpgsql as $$begin if new.operation_key=current_setting('test.fail_key',true)::uuid then raise exception 'forced audit failure'; end if;return new;end$$; create trigger test_fail before insert on public.audit_logs for each row execute function public.test_fail_audit();",
      );
      // Connection-level setting works in PGlite. A trigger keyed to an SQL literal also works across PG pool sessions.
      await db.exec(
        `create or replace function public.test_fail_audit() returns trigger language plpgsql as $$begin if new.operation_key='${key}'::uuid then raise exception 'forced audit failure'; end if;return new;end$$;`,
      );
      await denied(() => command(rep, input), /forced audit failure/);
      assert.equal(
        (
          await one(
            "select count(*)::integer n from public.reservations where interest_id=$1",
            [i.interestId],
          )
        ).n,
        0,
      );
      assert.equal(
        (
          await one(
            "select state from public.stock_portions where portion_id=$1",
            [s.portionId],
          )
        ).state,
        "Available",
      );
      assert.equal(
        (
          await one(
            "select count(*)::integer n from public.operation_results where operation_key=$1",
            [key],
          )
        ).n,
        0,
      );
      await db.exec(
        "drop trigger test_fail on public.audit_logs;drop function public.test_fail_audit()",
      );
      await command(rep, input);
      await command(rep, input);
      const audit = await one(
        "select * from public.audit_logs where operation_key=$1",
        [key],
      );
      assert.equal(audit.actor_id, rep.userId);
      assert.ok(audit.occurred_at);
      assert.equal(audit.after_data.reason, input.reason);
      assert.ok(audit.before_data);
      assert.equal(
        (
          await one(
            "select count(*)::integer n from public.committed_events where operation_key=$1",
            [key],
          )
        ).n,
        1,
      );
      assert.ok(
        (await workspace(requester)).history.some(
          (e) => e.event === "reservation.approved",
        ),
      );
      const hist = (
        await as(rep, "select public.list_asset_audit($1) result", [s.assetId])
      ).rows[0].result;
      assert.ok(hist.some((e) => e.event === "reservation.approved"));
    },
  );
  await check(
    "review regression: cancellation preserves an unsafe state even with a usable condition",
    async () => {
      for (const state of ["Unfit", "Under Maintenance"]) {
        const s = await asset(),
          r = await request(),
          i = await interest(r, s),
          t = await approve(i);
        await db.query(
          "update public.stock_portions set state=$1 where portion_id=$2",
          [state, s.portionId],
        );
        await transfer(requester, t, "cancelTransfer");
        const row = await one(
          "select state,condition from public.stock_portions where portion_id=$1",
          [s.portionId],
        );
        assert.equal(row.state, state);
        assert.equal(row.condition, "Good");
      }
    },
  );
  await check(
    "review regression: physical holder is independent from observer and must be an active participant",
    async () => {
      const { t } = await dispatched();
      await denied(
        () =>
          transfer(receiver, t, "receive", {
            qty: 0,
            condition: "Unknown",
            accept: false,
            location: "Trolley",
            holderId: person("system_administrator").userId,
          }),
        /physical holder/,
      );
      const result = await transfer(receiver, t, "receive", {
        qty: 0,
        condition: "Unknown",
        accept: false,
        location: "Facilities / Trolley",
        holderId: facilities.userId,
      });
      const row = (await workspace(receiver)).transfers.find(
        (x) => x.transferId === t.transferId,
      );
      assert.equal(row.holderId, facilities.userId);
      assert.equal(row.handovers.at(-1).recorded_by, receiver.userId);
      assert.equal(row.handovers.at(-1).holder_id, facilities.userId);
      assert.equal(row.state, "Disputed");
      await denied(
        () =>
          transfer(rep, result, "confirmReturn", {
            qty: 0,
            condition: "Good",
            location: "Store",
          }),
        /full physically/,
      );
    },
  );
  await check(
    "review regression: terminal transfer tracking cannot expose later unrelated movement",
    async () => {
      const { stock, t } = await dispatched();
      await transfer(receiver, t, "receive", {
        qty: 1,
        condition: "Good",
        accept: true,
        location: "Science / First destination",
      });
      const before = (await workspace(requester)).transfers.find(
        (x) => x.transferId === t.transferId,
      );
      await db.query(
        "update public.stock_portions set physical_location='Later confidential movement',holder_id=$1,owner_department_id=$2 where portion_id=$3",
        [facilities.userId, rep.departmentId, stock.portionId],
      );
      const after = (await workspace(requester)).transfers.find(
        (x) => x.transferId === t.transferId,
      );
      for (const key of [
        "ownerDepartmentId",
        "custodianId",
        "holderId",
        "assignedLocation",
        "physicalLocation",
        "condition",
      ])
        assert.deepEqual(after[key], before[key]);
      assert.equal(
        (await workspace(rep)).transfers.find(
          (x) => x.transferId === t.transferId,
        ).physicalLocation,
        "Science / First destination",
      );
    },
  );
  await check(
    "synthetic recipe fixtures reproduce matching/report input quantities",
    async () => {
      const recipes = JSON.parse(
        await (
          await import("node:fs/promises")
        ).readFile("tests/fixtures/workflows.json", "utf8"),
      );
      for (const recipe of recipes.cases) {
        const s = await asset(recipe.stockQty),
          r = await request(recipe.requestQty, {
            purpose: "Recipe " + recipe.key,
          });
        if (recipe.outcome !== "Open") {
          const i = await interest(
            r,
            s,
            recipe.approveQty || recipe.requestQty,
          );
          if (recipe.approveQty) {
            let t = await approve(i, recipe.approveQty);
            if (recipe.outcome !== "Pending Approval") {
              t = await transfer(rep, t, "approveRelease", {
                facilitiesId: facilities.userId,
              });
              t = await transfer(facilities, t, "schedule", {
                scheduledAt: new Date(Date.now() + 3600000).toISOString(),
                arrangements: "Synthetic trolley",
              });
              if (recipe.outcome !== "Scheduled") {
                t = await transfer(facilities, t, "dispatch", {
                  qty: recipe.approveQty,
                  location: "Trolley",
                });
                t = await transfer(receiver, t, "receive", {
                  qty:
                    recipe.outcome === "Completed"
                      ? recipe.approveQty
                      : recipe.approveQty - 1,
                  condition: recipe.outcome === "Completed" ? "Good" : "Poor",
                  accept: recipe.outcome === "Completed",
                  location: "Lab",
                });
                if (recipe.outcome === "Returned")
                  await transfer(rep, t, "confirmReturn", {
                    qty: recipe.approveQty,
                    condition: "Poor",
                    location: "Store",
                  });
              }
            }
            if (recipe.extraAllocation) {
              const leaf = await one(
                "select portion_id from public.stock_portions where asset_id=$1 and active and state='Available'",
                [s.assetId],
              );
              const extra = await interest(
                r,
                { portionId: leaf.portion_id },
                recipe.extraAllocation,
              );
              await approve(extra, recipe.extraAllocation);
            }
          }
        }
        const q = (await workspace(requester)).requests.find(
          (q) => q.requestId === r.requestId,
        );
        for (const key of ["acceptedQty", "allocatedQty", "remainingQty"])
          assert.equal(q[key], recipe[key], recipe.key + " " + key);
      }
    },
  );
  await check(
    "review regression: original Interest supplier remains private and authoritative after ownership changes",
    async () => {
      const s = await asset(),
        privateRequester = person("requester");
      const privateReq = await request(
          1,
          { purpose: "Private original supplier need" },
          privateRequester,
        ),
        pending = await interest(privateReq, s, 1, privateRequester);
      const req = await request(),
        i = await interest(req, s);
      let t = await approve(i);
      t = await transfer(rep, t, "approveRelease", {
        facilitiesId: facilities.userId,
      });
      t = await transfer(facilities, t, "schedule", {
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        arrangements: "Trolley",
      });
      t = await transfer(facilities, t, "dispatch", {
        qty: 1,
        location: "Transit",
      });
      await transfer(receiver, t, "receive", {
        qty: 1,
        condition: "Good",
        accept: true,
        location: "Science / Lab",
      });
      const view = await workspace(receiver);
      assert.equal(
        view.requests.some((q) => q.requestId === privateReq.requestId),
        false,
      );
      assert.equal(
        view.interests.some((x) => x.interestId === pending.interestId),
        false,
      );
      await denied(() =>
        command(receiver, {
          action: "rejectReservation",
          interestId: pending.interestId,
          expectedVersion: pending.version,
          reason: "New owner should not decide old interest",
        }),
      );
      const current = (
        await as(receiver, "select public.search_assets($1::jsonb) result", [
          JSON.stringify({ assetId: s.assetId }),
        ])
      ).rows[0].result[0];
      await as(receiver, "select public.set_publication($1,$2,true,$3)", [
        s.assetId,
        current.version,
        randomUUID(),
      ]);
      await denied(() => approve(pending), /Conflict/);
      assert.equal(
        (await workspace(rep)).interests.find(
          (x) => x.interestId === pending.interestId,
        ).supplierDepartmentId,
        rep.departmentId,
      );
      await command(rep, {
        action: "rejectReservation",
        interestId: pending.interestId,
        expectedVersion: pending.version,
        reason: "Original listing has since transferred",
      });
    },
  );
  await check(
    "selected leaf detail is correct after splitting and rejects mismatched/inaccessible portions",
    async () => {
      const s = await asset(5),
        req = await request(2),
        i = await interest(req, s, 2);
      await approve(i, 2);
      const rows = (
        await db.query(
          "select * from public.stock_portions where asset_id=$1 and active",
          [s.assetId],
        )
      ).rows;
      for (const portion of rows) {
        const detail = (
          await as(rep, "select public.asset_detail($1,$2) result", [
            s.assetId,
            portion.portion_id,
          ])
        ).rows[0].result;
        assert.equal(detail.asset.portionId, portion.portion_id);
        assert.equal(detail.asset.qty, portion.qty);
      }
      const reserved = rows.find((p) => p.state === "Reserved");
      await denied(() =>
        as(requester, "select public.asset_detail($1,$2)", [
          s.assetId,
          reserved.portion_id,
        ]),
      );
      const other = await asset();
      await denied(() =>
        as(rep, "select public.asset_detail($1,$2)", [
          other.assetId,
          rows[0].portion_id,
        ]),
      );
    },
  );
  await check(
    "removing requester role revokes own request access and mutation",
    async () => {
      const req = await request();
      await db.query(
        "delete from public.user_roles where user_id=$1 and role='requester'",
        [requester.userId],
      );
      assert.equal(
        (await workspace(requester)).requests.some(
          (q) => q.requestId === req.requestId,
        ),
        false,
      );
      await denied(() =>
        command(requester, {
          action: "cancelRequest",
          requestId: req.requestId,
          expectedVersion: 1,
          reason: "Revoked role",
        }),
      );
      await db.query("insert into public.user_roles values($1,'requester')", [
        requester.userId,
      ]);
    },
  );
  console.log(
    `\n${count} workflow PostgreSQL integration checks passed (${h.pool ? "native PostgreSQL, synthetic Auth adapter" : "PGlite, synthetic Auth adapter"}).`,
  );
  console.log(
    "No live Supabase Auth/JWT/hosted service claims. Concurrency is tested only by test:concurrency on native PostgreSQL.",
  );
} finally {
  await db.close();
}
