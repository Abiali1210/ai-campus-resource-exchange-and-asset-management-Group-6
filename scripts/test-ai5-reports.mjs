import assert from "node:assert/strict";
import { testDatabase } from "./workflow-test-support.mjs";

const empty = await testDatabase();
const emptyAdmin = empty.person("business_administrator");
const emptySnapshot = (
  await empty.as(
    emptyAdmin,
    "select public.ai5_capture_report('zero-activity') result",
  )
).rows[0].result;
assert.deepEqual(emptySnapshot.facts, {
  requests_submitted: 0,
  open_requests: 0,
  completed_transfers: 0,
  units_successfully_transferred: 0,
  non_open_requests: 0,
  open_request_rate_percent: 0,
  units_per_completed_transfer: 0,
});
assert.equal(emptySnapshot.schema_version, 2);
assert.equal(emptySnapshot.calculation_version, "ai5-operational-v2");
await empty.db.close();

const h = await testDatabase();
const { db, as, person, requester, rep, receiver, facilities, dispatched } = h;
const admin = person("business_administrator");
const denied = (fn) =>
  assert.rejects(fn, /AI5_FORBIDDEN|Forbidden|Unauthorized|permission denied/);
const capture = (user, key) =>
  as(user, "select public.ai5_capture_report($1) result", [key]).then(
    (r) => r.rows[0].result,
  );
const v2Text = (facts, headline = "Recorded activity") =>
  `Headline: ${headline}\nDemand: ${facts.open_requests} of ${facts.requests_submitted} submitted requests remain open; ${facts.non_open_requests} is non-open, for a ${facts.open_request_rate_percent}% open-request rate\nTransfer activity: ${facts.units_successfully_transferred} units were transferred across ${facts.completed_transfers} completed transfers, averaging ${facts.units_per_completed_transfer} units per completed transfer\nInterpretation: Demand remains visible across the reporting snapshot\nLimitation: These figures describe recorded activity only`;
const workspace = (user, limit = 20) =>
  as(
    user,
    "select coalesce(jsonb_agg(x), '[]'::jsonb) result from public.ai5_report_workspace($1) x",
    [limit],
  ).then((r) => r.rows[0].result);
const assertNoEmailKeys = (value) => {
  if (Array.isArray(value)) return value.forEach(assertNoEmailKeys);
  if (value && typeof value === "object") {
    assert.equal(
      Object.keys(value).some((key) => /email/i.test(key)),
      false,
    );
    Object.values(value).forEach(assertNoEmailKeys);
  }
};
const assertActorNames = (obj, expected) => {
  for (const key of Object.keys(expected)) {
    assert.ok(
      obj[key] === null || typeof obj[key] === "string",
      `${key} must be scalar or null`,
    );
    assert.equal(obj[key], expected[key], key);
  }
};
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
      const ratioText = await db.query(
        "select facts->>'units_per_completed_transfer' ratio_text from public.ai5_report_snapshots where snapshot_id=$1",
        [snapshot.snapshot_id],
      );
      assert.equal(ratioText.rows[0].ratio_text, "2.0");
      assert.deepEqual(snapshot.facts, {
        requests_submitted: 9,
        open_requests: 5,
        completed_transfers: 2,
        units_successfully_transferred: 4,
        non_open_requests: 4,
        open_request_rate_percent: 56,
        units_per_completed_transfer: 2,
      });
      const integerRatioText = v2Text(snapshot.facts);
      const saveIntegerRatio = (key, text) =>
        as(admin, "select public.ai5_save_generation($1,$2,$3,$4,$5::jsonb)", [
          snapshot.snapshot_id,
          key,
          "gemini-3.5-flash-lite",
          text,
          JSON.stringify({ request: "test" }),
        ]);
      const integerRatioNarrative = await saveIntegerRatio(
        "integer-ratio-regression",
        integerRatioText,
      );
      const integerRatioEdited = await as(
        admin,
        "select public.ai5_edit_narrative($1,$2) result",
        [
          integerRatioNarrative.rows[0].ai5_save_generation.narrative_id,
          integerRatioText.replace("averaging 2 units", "averaging 2.0 units"),
        ],
      );
      assert.match(
        integerRatioEdited.rows[0].result.current_text,
        /averaging 2\.0 units/,
      );
      for (const spelling of ["2", "2.0"]) {
        const equivalentRatioText = integerRatioText.replace(
          "averaging 2 units",
          `averaging ${spelling} units`,
        );
        assert.equal(
          (
            await db.query("select public.ai5_text_valid($1,$2::jsonb) valid", [
              equivalentRatioText,
              JSON.stringify(snapshot.facts),
            ])
          ).rows[0].valid,
          true,
        );
      }
      const normalizedText =
        "Headline: Recorded activity\nDemand: 5 of 9 submitted requests remain open; 4 is non-open, for a 56% open-request rate\nTransfer activity: 4 units were transferred across 2 completed transfers, averaging 2 units per completed transfer\nInterpretation: Demand remains visible across the reporting snapshot\nLimitation: These figures describe recorded activity only";
      assert.equal(
        (
          await db.query("select public.ai5_text_valid($1,$2::jsonb) valid", [
            normalizedText,
            JSON.stringify(snapshot.facts),
          ])
        ).rows[0].valid,
        true,
      );
      assert.equal(
        (
          await db.query(
            "select public.ai5_generated_text_valid($1,$2::jsonb) valid",
            [normalizedText, JSON.stringify(snapshot.facts)],
          )
        ).rows[0].valid,
        true,
      );
      for (const invalidGenerated of [
        normalizedText.replace("Headline:", "Title:"),
        normalizedText.replace("4 units", "999 units"),
        normalizedText.replace("4 units", "$4 units"),
        normalizedText.replace("4 units", "+4 units"),
        normalizedText.replace("4 units", "4e2 units"),
        normalizedText.replace("56%", "57%"),
        normalizedText.replace("56%", "56%%"),
      ]) {
        assert.equal(
          (
            await db.query(
              "select public.ai5_generated_text_valid($1,$2::jsonb) valid",
              [invalidGenerated, JSON.stringify(snapshot.facts)],
            )
          ).rows[0].valid,
          false,
          `generated form must stay rejected: ${invalidGenerated}`,
        );
      }
      for (const invalid of [
        integerRatioText.replace("averaging 2 units", "averaging 2.0% units"),
        integerRatioText.replace("averaging 2 units", "averaging 3 units"),
      ]) {
        assert.equal(
          (
            await db.query("select public.ai5_text_valid($1,$2::jsonb) valid", [
              invalid,
              JSON.stringify(snapshot.facts),
            ])
          ).rows[0].valid,
          false,
        );
      }
      const wrongRatioText = integerRatioText.replace(
        "averaging 2 units",
        "averaging 3 units",
      );
      await assert.rejects(
        () => saveIntegerRatio("integer-ratio-invalid", wrongRatioText),
        /unsupported narrative/,
      );
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
      text = v2Text(snap.facts);
      const row = await save(admin, snap.snapshot_id, "narrative-key", text);
      const initialWorkspace = await as(
        admin,
        "select * from public.ai5_narrative_workspace()",
      );
      const initialItem = initialWorkspace.rows
        .map((r) => r.ai5_narrative_workspace)
        .find((x) => x.snapshot.snapshot_id === snap.snapshot_id);
      assert.ok(initialItem);
      assertActorNames(initialItem.snapshot, { creator_name: admin.name });
      assertActorNames(initialItem.narrative, {
        creator_name: admin.name,
        editor_name: null,
        reviewer_name: null,
        publisher_name: null,
      });
      assertNoEmailKeys(initialItem);
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
      const oldSnapshotId = crypto.randomUUID();
      const oldFacts = {
        requests_submitted: 1,
        open_requests: 1,
        completed_transfers: 0,
        units_successfully_transferred: 0,
      };
      await db.query(
        "insert into public.ai5_report_snapshots(snapshot_id,schema_version,calculation_version,period_start,period_end,captured_at,facts,idempotency_key,created_by) values($1,1,'ai5-all-time-v1',now(),now(),now(),$2,'legacy-readable',$3)",
        [oldSnapshotId, oldFacts, admin.userId],
      );
      const legacyText = "Report covers January activity.";
      assert.equal(
        (await save(admin, oldSnapshotId, "legacy-valid", legacyText))
          .generated_text,
        legacyText,
      );
      await assert.rejects(
        () =>
          save(
            admin,
            oldSnapshotId,
            "legacy-decimal-rejected",
            "Report covers 1.5 requests.",
          ),
        /unsupported narrative/,
      );
      await assert.rejects(
        () => save(admin, oldSnapshotId, "legacy-invalid", "999 requests."),
        /unsupported narrative/,
      );
      await assert.rejects(
        () =>
          save(
            admin,
            snap.snapshot_id,
            "malformed-v2-no-v1",
            "Report records 9 requests.",
          ),
        /unsupported narrative/,
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
        v2Text(snap.facts, "Edited operational activity"),
      ]);
      assert.equal(
        edited.current_text,
        v2Text(snap.facts, "Edited operational activity"),
      );
      const freeform = `  A completely different heading and order.\r\nOnly ${snap.facts.open_requests} matters here, repeated ${snap.facts.open_requests}.\r\nThe rate is ${snap.facts.open_request_rate_percent}%; ratio ${snap.facts.units_per_completed_transfer}.  `;
      const freeformSaved = await call(admin, "ai5_edit_narrative", [
        row.narrative_id,
        freeform,
      ]);
      assert.equal(
        freeformSaved.current_text,
        freeform.trim().replace(/\r\n/g, "\n"),
      );
      const lfEdited = await call(admin, "ai5_edit_narrative", [
        row.narrative_id,
        " \tAn arbitrary headline.\n\nRepeated   spaces remain. \t",
      ]);
      assert.equal(
        lfEdited.current_text,
        "An arbitrary headline.\n\nRepeated   spaces remain.",
      );
      const editRpcSamples = [
        text,
        `Activity remains mixed. Only ${snap.facts.open_requests}; again ${snap.facts.open_requests}.`,
        `Reordered facts: ${snap.facts.completed_transfers}, ${snap.facts.requests_submitted}; rate ${snap.facts.open_request_rate_percent}%.`,
        `Equivalent ratio ${Number(snap.facts.units_per_completed_transfer).toFixed(1)}.`,
        `Seven units is wording; ${snap.facts.units_successfully_transferred} is the numeric fact.`,
        "A fully arbitrary headline and nonnumeric prose are accepted.",
        "A label can say item999 and run-999 without making either a numeric claim.",
      ];
      for (const sample of editRpcSamples) {
        const saved = await call(admin, "ai5_edit_narrative", [
          row.narrative_id,
          sample,
        ]);
        assert.equal(saved.current_text, sample, `saved copy: ${sample}`);
      }
      for (const accepted of [
        `Only ${snap.facts.units_per_completed_transfer}.`,
        `Ratio ${Number(snap.facts.units_per_completed_transfer).toFixed(1)}; ${snap.facts.open_request_rate_percent}%`,
        `Any labels or ordering: ${snap.facts.completed_transfers}, ${snap.facts.requests_submitted}, ${snap.facts.completed_transfers}.`,
        "Natural number words such as seven are not parsed as numeric tokens.",
        "An arbitrary headline with item999 and run-999 labels remains prose.",
      ]) {
        assert.equal(
          (
            await db.query("select public.ai5_text_valid($1,$2::jsonb) valid", [
              accepted,
              JSON.stringify(snap.facts),
            ])
          ).rows[0].valid,
          true,
          `accepted text: ${accepted}`,
        );
      }
      for (const rejected of [
        "",
        "999",
        `Wrong rate ${snap.facts.open_request_rate_percent + 1}%`,
        `Wrong fraction ${snap.facts.units_per_completed_transfer + 1}.0`,
        `${snap.facts.open_requests}/999`,
        `Signed +${snap.facts.open_requests}`,
        `Exponent ${snap.facts.open_requests}e2`,
        `Date 2026-11-27`,
        `Malformed percent ${snap.facts.open_request_rate_percent}%rate`,
      ]) {
        assert.equal(
          (
            await db.query("select public.ai5_text_valid($1,$2::jsonb) valid", [
              rejected,
              JSON.stringify(snap.facts),
            ])
          ).rows[0].valid,
          false,
        );
      }
      const afterEdit = await as(
        admin,
        "select * from public.ai5_narrative_workspace()",
      );
      const editItem = afterEdit.rows
        .map((r) => r.ai5_narrative_workspace)
        .find((x) => x.snapshot.snapshot_id === snap.snapshot_id);
      assertActorNames(editItem.narrative, {
        creator_name: admin.name,
        editor_name: admin.name,
      });
      await assert.rejects(
        () =>
          call(admin, "ai5_edit_narrative", [row.narrative_id, "999 requests"]),
        /AI5_UNSUPPORTED_NUMBER: 999/,
      );
      await assert.rejects(
        () => call(admin, "ai5_edit_narrative", [row.narrative_id, " \n "]),
        /AI5_TEXT_EMPTY/,
      );
      await assert.rejects(
        () =>
          call(admin, "ai5_edit_narrative", [
            row.narrative_id,
            "x".repeat(601),
          ]),
        /AI5_TEXT_TOO_LONG/,
      );
      await assert.rejects(
        () =>
          call(admin, "ai5_edit_narrative", [
            crypto.randomUUID(),
            "Missing narrative",
          ]),
        /AI5_NOT_FOUND/,
      );
      await assert.rejects(
        () =>
          call(admin, "ai5_edit_narrative", [
            row.narrative_id,
            "Report claims 999 impact.",
          ]),
        /AI5_UNSUPPORTED_NUMBER/,
      );
      for (const unauthorized of [rep, person("system_administrator")]) {
        if (unauthorized !== rep) {
          await db.query(
            "update public.profiles set active=false where user_id=$1",
            [unauthorized.userId],
          );
        }
        await denied(() =>
          call(unauthorized, "ai5_edit_narrative", [row.narrative_id, "Text"]),
        );
        await denied(() =>
          call(unauthorized, "ai5_mark_ready", [row.narrative_id]),
        );
        await denied(() =>
          call(unauthorized, "ai5_publish_narrative", [row.narrative_id]),
        );
        if (unauthorized !== rep) {
          await db.query(
            "update public.profiles set active=true where user_id=$1",
            [unauthorized.userId],
          );
        }
      }

      const editableText = v2Text(snap.facts, "Reviewable free prose");
      const invalidDrafts = [
        ["", /AI5_TEXT_EMPTY/],
        ["x".repeat(601), /AI5_TEXT_TOO_LONG/],
        ["unsupported 999", /AI5_UNSUPPORTED_NUMBER: 999/],
      ];
      // Temporarily bypass the production CHECK only in this disposable test
      // database so transitions are tested against corrupted stored values.
      await db.query(
        "alter table public.ai5_report_narratives drop constraint ai5_report_narratives_current_text_check",
      );
      for (const [invalidText, expectedError] of invalidDrafts) {
        await db.query(
          "update public.ai5_report_narratives set current_text=$2 where narrative_id=$1",
          [row.narrative_id, invalidText],
        );
        await assert.rejects(
          () => call(admin, "ai5_mark_ready", [row.narrative_id]),
          expectedError,
        );
      }
      await db.query(
        "update public.ai5_report_narratives set current_text=$2 where narrative_id=$1",
        [row.narrative_id, editableText],
      );
      const ready = await call(admin, "ai5_mark_ready", [row.narrative_id]);
      assert.equal(ready.status, "Ready");
      const afterReview = await as(
        admin,
        "select * from public.ai5_narrative_workspace()",
      );
      const reviewItem = afterReview.rows
        .map((r) => r.ai5_narrative_workspace)
        .find((x) => x.snapshot.snapshot_id === snap.snapshot_id);
      assertActorNames(reviewItem.narrative, {
        creator_name: admin.name,
        editor_name: admin.name,
        reviewer_name: admin.name,
      });
      await assert.rejects(
        () =>
          call(admin, "ai5_edit_narrative", [row.narrative_id, "Late edit"]),
        /AI5_INVALID_STATE/,
      );
      const invalidReadyTexts = [
        ["", /AI5_TEXT_EMPTY/],
        ["x".repeat(601), /AI5_TEXT_TOO_LONG/],
        ["unsupported 999", /AI5_UNSUPPORTED_NUMBER: 999/],
      ];
      for (const [invalidText, expectedError] of invalidReadyTexts) {
        await db.query(
          "update public.ai5_report_narratives set current_text=$2 where narrative_id=$1",
          [row.narrative_id, invalidText],
        );
        await assert.rejects(
          () => call(admin, "ai5_publish_narrative", [row.narrative_id]),
          expectedError,
        );
      }
      await db.query(
        "update public.ai5_report_narratives set current_text=$2 where narrative_id=$1",
        [row.narrative_id, editableText],
      );
      await db.query(
        "alter table public.ai5_report_narratives add constraint ai5_report_narratives_current_text_check check(length(trim(current_text)) between 1 and 600)",
      );
      const published = await call(admin, "ai5_publish_narrative", [
        row.narrative_id,
      ]);
      assert.equal(published.status, "Published");
      assert.deepEqual(await countSources(), beforeEdit);
      await assert.rejects(
        () => call(admin, "ai5_publish_narrative", [row.narrative_id]),
        /AI5_INVALID_STATE/,
      );
      await assert.rejects(
        () =>
          call(admin, "ai5_edit_narrative", [row.narrative_id, editableText]),
        /AI5_INVALID_STATE/,
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
      const publishedItem = visible.rows[0].ai5_published_narratives;
      assert.equal(
        publishedItem.snapshot.facts.requests_submitted,
        snap.facts.requests_submitted,
      );
      assert.equal(publishedItem.snapshot.creator_name, admin.name);
      assert.equal(publishedItem.narrative.creator_name, admin.name);
      assert.equal(publishedItem.narrative.editor_name, admin.name);
      assert.equal(publishedItem.narrative.reviewer_name, admin.name);
      assert.equal(publishedItem.narrative.publisher_name, admin.name);
      assertActorNames(publishedItem.snapshot, { creator_name: admin.name });
      assertActorNames(publishedItem.narrative, {
        creator_name: admin.name,
        editor_name: admin.name,
        reviewer_name: admin.name,
        publisher_name: admin.name,
      });
      assertNoEmailKeys(publishedItem);
      const activeNonAdmin = person("representative");
      const visibleToActiveNonAdmin = await as(
        activeNonAdmin,
        "select * from public.ai5_published_narratives()",
      );
      assert.equal(visibleToActiveNonAdmin.rows.length, 1);
      await denied(() =>
        as(activeNonAdmin, "select * from public.ai5_narrative_workspace()"),
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
      assert.equal(currentItem.snapshot.creator_name, admin.name);
      assert.equal(currentItem.narrative.creator_name, admin.name);
      assert.equal(currentItem.narrative.editor_name, admin.name);
      assert.equal(currentItem.narrative.reviewer_name, admin.name);
      assert.equal(currentItem.narrative.publisher_name, admin.name);
      const noNarrativeItem = workspaceItems.find((x) => x.narrative === null);
      if (noNarrativeItem) {
        assert.equal(noNarrativeItem.snapshot.creator_name, admin.name);
      }
      assertActorNames(currentItem.snapshot, { creator_name: admin.name });
      assertActorNames(currentItem.narrative, {
        creator_name: admin.name,
        editor_name: admin.name,
        reviewer_name: admin.name,
        publisher_name: admin.name,
      });
      assertNoEmailKeys(currentItem);
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
