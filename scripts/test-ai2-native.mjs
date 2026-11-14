import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./workflow-test-support.mjs";

const h = await testDatabase();
const { db, as, requester, rep, receiver, asset, request, interest, approve } =
  h;
let count = 0;
const uuid = () => randomUUID();
const vector = (n = 0) =>
  `[${Array.from({ length: 384 }, (_, i) => (i === n ? 1 : 0)).join(",")}]`;
const vectorArray = () =>
  Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0));
const score = (portionId, assetId, rank = 1, semanticCosineScore = 1) => ({
  portionId,
  assetId,
  rank,
  semanticCosineScore,
  s: 1,
  c: 1,
  q: 1,
  l: 0,
  f: 0.9,
  t: 0,
  k: 0,
  w: 0,
  e: 0,
  compatibilityScore: 90,
  finalRankScore: 54,
  reason: "Synthetic formula-valid recommendation",
  missingEvidence: [],
});
async function check(name, fn) {
  await fn();
  count++;
  console.log(`PASS AI2 native ${name}`);
}
async function indexed(
  req,
  stock,
  embedding = vector(),
  hash = "a".repeat(64),
) {
  await db.query(
    "update public.assets set ai_content_hash=$2 where asset_id=$1",
    [stock.assetId, hash],
  );
  await db.query(
    "insert into public.asset_embeddings(asset_id,embedding,model,content_hash) values($1,$2::extensions.vector,'gte-small',$3)",
    [stock.assetId, embedding, hash],
  );
  return stock;
}
async function run(
  req,
  recommendations,
  actor = requester,
  operationKey = uuid(),
  snapshot,
) {
  const rows =
    snapshot ??
    (
      await as(
        requester,
        "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
        [req.requestId, vector()],
      )
    ).rows;
  return as(
    null,
    "select public.ai2_save_match_run($1,$2::jsonb) result",
    [
      actor.userId,
      JSON.stringify({
        operationKey,
        requestId: req.requestId,
        requestVersion: req.version,
        queryVector: vectorArray(),
        candidateSnapshot: rows,
        configurationVersion: "native-test-v1",
        model: "gte-small",
        providerCallCount: 1,
        durationMs: 4,
        outcome: recommendations.length ? "completed" : "no_candidates",
        recommendations,
      }),
    ],
    "service_role",
  ).then((r) => r.rows[0].result);
}
async function review(id, decision, actor = requester, operationKey = uuid()) {
  return as(
    actor,
    "select public.ai2_review_recommendation($1::jsonb) result",
    [
      JSON.stringify({
        operationKey,
        recommendationId: id,
        decision,
        note: "Native test review",
      }),
    ],
  ).then((r) => r.rows[0].result);
}
async function prepared() {
  const stock = await asset(),
    req = await request();
  await indexed(req, stock);
  const rows = await as(
    requester,
    "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
    [req.requestId, vector()],
  );
  const candidate = rows.rows.find((row) => row.asset_id === stock.assetId);
  assert.ok(candidate);
  const saved = await run(req, [score(candidate.portion_id, stock.assetId)]);
  const result = await as(
    requester,
    "select public.ai2_match_results($1) result",
    [saved.runId],
  );
  assert.equal(result.rows[0].result.outcome, "completed");
  const metadata = await db.query(
    "select model,configuration_version,candidate_count,provider_call_count,duration_ms,candidate_fingerprint from public.ai_match_runs where run_id=$1",
    [saved.runId],
  );
  assert.deepEqual(metadata.rows[0], {
    model: "gte-small",
    configuration_version: "native-test-v1",
    candidate_count: rows.rowCount,
    provider_call_count: 1,
    duration_ms: 4,
    candidate_fingerprint: metadata.rows[0].candidate_fingerprint,
  });
  assert.match(metadata.rows[0].candidate_fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    Object.keys(result.rows[0].result.recommendations[0]).sort(),
    [
      "recommendationId",
      "portionId",
      "assetId",
      "rank",
      "assetName",
      "condition",
      "availableQty",
      "compatibilityScore",
      "finalRankScore",
      "reason",
      "missingEvidence",
      "reviewState",
      "interestId",
    ].sort(),
  );
  return {
    stock,
    req,
    saved,
    row: candidate,
    recommendationId: result.rows[0].result.recommendations[0].recommendationId,
  };
}
try {
  await check(
    "representative embedding source is narrow and upsert is atomic",
    async () => {
      const stock = await asset(),
        hash = "9".repeat(64);
      const source = await as(
        null,
        "select public.ai2_embedding_source($1,$2) result",
        [rep.userId, stock.assetId],
        "service_role",
      );
      const src = source.rows[0].result;
      assert.deepEqual(
        Object.keys(src).sort(),
        [
          "assetId",
          "category",
          "contentHash",
          "description",
          "name",
          "specifications",
          "storedContentHash",
          "storedModel",
          "sourceFingerprint",
          "tags",
          "version",
        ].sort(),
      );
      assert.equal(src.version, stock.version);
      await assert.rejects(
        as(
          null,
          "select public.ai2_embedding_source($1,$2)",
          [rep.userId, stock.assetId],
          "authenticated",
        ),
      );
      await assert.rejects(
        as(
          null,
          "select public.ai2_upsert_asset_embedding($1,$2,$3,$4,$5,$6::extensions.vector)",
          [
            rep.userId,
            stock.assetId,
            stock.version,
            src.sourceFingerprint,
            hash,
            vector(),
          ],
          "anon",
        ),
      );
      const inserted = await as(
        null,
        "select public.ai2_upsert_asset_embedding($1,$2,$3,$4,$5,$6::extensions.vector) result",
        [
          rep.userId,
          stock.assetId,
          stock.version,
          src.sourceFingerprint,
          hash,
          vector(),
        ],
        "service_role",
      );
      assert.equal(inserted.rows[0].result.status, "created");
      await assert.rejects(
        as(
          null,
          "select public.ai2_upsert_asset_embedding($1,$2,$3,$4,$5,$6::extensions.vector)",
          [
            rep.userId,
            stock.assetId,
            stock.version - 1,
            src.sourceFingerprint,
            "8".repeat(64),
            vector(2),
          ],
          "service_role",
        ),
      );
      const state = await db.query(
        "select a.ai_content_hash,e.content_hash,e.embedding::text from public.assets a join public.asset_embeddings e using(asset_id) where a.asset_id=$1",
        [stock.assetId],
      );
      assert.equal(state.rows[0].ai_content_hash, hash);
      assert.equal(state.rows[0].content_hash, hash);
      await assert.rejects(
        as(
          null,
          "select public.ai2_upsert_asset_embedding($1,$2,$3,$4,$5,$6::extensions.vector)",
          [
            rep.userId,
            stock.assetId,
            stock.version,
            "0".repeat(64),
            "6".repeat(64),
            vector(1),
          ],
          "service_role",
        ),
      );
      const updated = await as(
        null,
        "select public.ai2_upsert_asset_embedding($1,$2,$3,$4,$5,$6::extensions.vector) result",
        [
          rep.userId,
          stock.assetId,
          stock.version,
          src.sourceFingerprint,
          "7".repeat(64),
          vector(1),
        ],
        "service_role",
      );
      assert.equal(updated.rows[0].result.status, "updated");
    },
  );
  await check(
    "request source is caller-scoped and exposes category label only",
    async () => {
      const req = await request();
      const src = await as(
        requester,
        "select public.ai2_request_source($1) result",
        [req.requestId],
      );
      assert.equal(src.rows[0].result.category, h.fixture.categories[0].name);
      assert.equal(src.rows[0].result.version, req.version);
      assert.equal("destination" in src.rows[0].result, false);
      await assert.rejects(
        as(rep, "select public.ai2_request_source($1)", [req.requestId]),
      );
      await assert.rejects(
        as(
          null,
          "select public.ai2_request_source($1)",
          [req.requestId],
          "anon",
        ),
      );
    },
  );
  await check(
    "schema vectors reject 383/385 dimensions and enforce one embedding per asset",
    async () => {
      assert.equal(
        (
          await db.query(
            "select atttypmod from pg_attribute where attrelid='public.asset_embeddings'::regclass and attname='embedding'",
          )
        ).rows[0].atttypmod,
        384,
      );
      for (const n of [383, 385])
        await assert.rejects(
          db.query("select $1::extensions.vector(384)", [
            `[${Array(n).fill(0).join(",")}]`,
          ]),
        );
      const stock = await asset(),
        hash = "b".repeat(64);
      await db.query(
        "update public.assets set ai_content_hash=$2 where asset_id=$1",
        [stock.assetId, hash],
      );
      await db.query(
        "insert into public.asset_embeddings(asset_id,embedding,model,content_hash) values($1,$2::extensions.vector,'gte-small',$3)",
        [stock.assetId, vector(), hash],
      );
      await assert.rejects(
        db.query(
          "insert into public.asset_embeddings(asset_id,embedding,model,content_hash) values($1,$2::extensions.vector,'gte-small',$3)",
          [stock.assetId, vector(), hash],
        ),
      );
    },
  );
  await check(
    "whole-asset scope and inactive owning department reject source refresh",
    async () => {
      const stock = await asset();
      await db.query(
        "update public.stock_portions set owner_department_id=$2 where asset_id=$1 and active",
        [stock.assetId, receiver.departmentId],
      );
      await assert.rejects(
        as(
          null,
          "select public.ai2_embedding_source($1,$2)",
          [rep.userId, stock.assetId],
          "service_role",
        ),
      );
      await db.query(
        "update public.stock_portions set owner_department_id=$2 where asset_id=$1 and active",
        [stock.assetId, rep.departmentId],
      );
      await db.query(
        "update public.departments set active=false where department_id=$1",
        [rep.departmentId],
      );
      await assert.rejects(
        as(
          null,
          "select public.ai2_embedding_source($1,$2)",
          [rep.userId, stock.assetId],
          "service_role",
        ),
      );
      await db.query(
        "update public.departments set active=true where department_id=$1",
        [rep.departmentId],
      );
    },
  );
  await check(
    "direct authenticated embedding and run writes/updates denied",
    async () => {
      const stock = await asset();
      for (const sql of [
        "insert into public.asset_embeddings(asset_id,embedding,model,content_hash) values($1,$2::extensions.vector,'gte-small',$3)",
        "update public.assets set ai_content_hash=$2 where asset_id=$1",
        "insert into public.ai_match_runs(request_id,actor_id,operation_key,status,model,configuration_version,candidate_fingerprint,candidate_count,provider_call_count) values($1,$2,$3,'completed','gte-small','v1',repeat('a',64),0,0)",
        "update public.ai_match_runs set status='failed'",
      ])
        await assert.rejects(
          as(rep, sql, [stock.assetId, vector(), "a".repeat(64)]),
        );
    },
  );
  await check(
    "authenticated and anon cannot execute persistence; browser cannot fabricate runs",
    async () => {
      const req = await request(),
        input = JSON.stringify({
          operationKey: uuid(),
          requestId: req.requestId,
          recommendations: [],
        });
      await assert.rejects(
        as(requester, "select public.ai2_save_match_run($1,$2::jsonb)", [
          requester.userId,
          input,
        ]),
      );
      await assert.rejects(
        as(
          null,
          "select public.ai2_save_match_run($1,$2::jsonb)",
          [requester.userId, input],
          "anon",
        ),
      );
      await assert.rejects(
        as(requester, "select public.ai2_save_match_run($1,$2::jsonb)", [
          requester.userId,
          input,
        ]),
      );
    },
  );
  await check("candidate access rejects unauthorized caller", async () => {
    const { req } = await prepared();
    await assert.rejects(
      as(
        rep,
        "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
        [req.requestId, vector()],
      ),
    );
  });
  await check(
    "candidate projection excludes vector and caps results at twenty",
    async () => {
      const req = await request();
      for (let i = 0; i < 21; i++)
        await indexed(
          req,
          await asset(),
          vector(i % 384),
          i.toString(16).padStart(2, "0").repeat(32),
        );
      const result = await as(
        requester,
        "select * from public.ai2_candidates($1,$2::extensions.vector,50)",
        [req.requestId, vector()],
      );
      assert.equal(result.rowCount, 20);
      assert.equal("embedding" in result.rows[0], false);
    },
  );
  await check(
    "similarity ordering uses fixed 384-dimensional vectors",
    async () => {
      const token = uuid(),
        specifications = { ai2OrderingIsolation: token };
      const req = await request(1, { specifications }),
        near = await asset(1, { specifications }),
        far = await asset(1, { specifications });
      await indexed(req, far, vector(1), "c".repeat(64));
      await indexed(req, near, vector(0), "d".repeat(64));
      const r = await as(
        requester,
        "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
        [req.requestId, vector()],
      );
      const nearRow = r.rows.find((row) => row.asset_id === near.assetId),
        farRow = r.rows.find((row) => row.asset_id === far.assetId);
      assert.ok(nearRow && farRow);
      assert.ok(nearRow.similarity > farRow.similarity);
      assert.ok(r.rows.indexOf(nearRow) < r.rows.indexOf(farRow));
    },
  );
  await check(
    "closed request and no remaining demand excluded by candidate RPC",
    async () => {
      const closed = await prepared();
      await db.query(
        "update public.resource_requests set status='Closed' where request_id=$1",
        [closed.req.requestId],
      );
      await assert.rejects(
        as(
          requester,
          "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
          [closed.req.requestId, vector()],
        ),
      );
      const full = await prepared(),
        i = await interest(full.req, full.stock),
        reservation = await approve(i);
      assert.ok(reservation);
      await assert.rejects(
        as(
          requester,
          "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
          [full.req.requestId, vector()],
        ),
      );
    },
  );
  await check(
    "unavailable and unsafe stock excluded by candidate RPC",
    async () => {
      for (const [state, active] of [
        ["Reserved", true],
        ["Under Maintenance", true],
      ]) {
        const p = await prepared();
        await db.query(
          "update public.stock_portions set state=$2,active=$3 where portion_id=$1",
          [p.row.portion_id, state, active],
        );
        const rows = await as(
          requester,
          "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
          [p.req.requestId, vector()],
        );
        assert.ok(!rows.rows.some((row) => row.asset_id === p.stock.assetId));
      }
      const p = await prepared();
      await db.query(
        "update public.stock_portions set condition='Poor' where portion_id=$1",
        [p.row.portion_id],
      );
      const rows = await as(
        requester,
        "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
        [p.req.requestId, vector()],
      );
      assert.ok(!rows.rows.some((row) => row.asset_id === p.stock.assetId));
    },
  );
  await check(
    "wrong category, specification, and condition excluded by candidate RPC",
    async () => {
      for (const mutation of [
        "update public.assets set category_id=$2 where asset_id=$1",
        "update public.assets set specifications='{}' where asset_id=$1",
        "update public.stock_portions set condition='Fair' where portion_id=$1",
      ]) {
        const p = await prepared();
        if (mutation.includes("$2"))
          await db.query(mutation, [
            p.stock.assetId,
            h.fixture.categories[1].categoryId,
          ]);
        else
          await db.query(mutation, [
            mutation.includes("stock_portions")
              ? p.row.portion_id
              : p.stock.assetId,
          ]);
        const rows = await as(
          requester,
          "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
          [p.req.requestId, vector()],
        );
        assert.ok(!rows.rows.some((row) => row.asset_id === p.stock.assetId));
      }
    },
  );
  await check(
    "missing and stale embeddings excluded by candidate RPC",
    async () => {
      const p = await prepared();
      await db.query("delete from public.asset_embeddings where asset_id=$1", [
        p.stock.assetId,
      ]);
      let rows = await as(
        requester,
        "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
        [p.req.requestId, vector()],
      );
      assert.ok(!rows.rows.some((row) => row.asset_id === p.stock.assetId));
      const stale = await prepared();
      await db.query(
        "update public.asset_embeddings set content_hash=$2 where asset_id=$1",
        [stale.stock.assetId, "f".repeat(64)],
      );
      rows = await as(
        requester,
        "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
        [stale.req.requestId, vector()],
      );
      assert.ok(!rows.rows.some((row) => row.asset_id === stale.stock.assetId));
    },
  );
  await check("save run exact retry is idempotent", async () => {
    const p = await prepared(),
      key = uuid(),
      rec = [score(p.row.portion_id, p.stock.assetId)];
    const first = await run(p.req, rec, requester, key),
      second = await run(p.req, rec, requester, key);
    assert.deepEqual(second, first);
    const visibleRetry = await as(
      requester,
      "select public.ai2_match_operation($1,$2) result",
      [p.req.requestId, key],
    );
    assert.equal(visibleRetry.rows[0].result.outcome, "completed");
    await assert.rejects(run(p.req, [], requester, key));
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.ai_match_runs where operation_key=$1",
          [key],
        )
      ).rows[0].n,
      1,
    );
  });
  await check(
    "no-candidates is saved as failed/no_candidates with empty visible results",
    async () => {
      const req = await request(1, {
          specifications: { noCandidateFixture: uuid() },
        }),
        key = uuid();
      const saved = await run(req, [], requester, key);
      const result = await as(
        requester,
        "select public.ai2_match_results($1) result",
        [saved.runId],
      );
      assert.equal(result.rows[0].result.outcome, "no_candidates");
      assert.deepEqual(result.rows[0].result.recommendations, []);
      assert.equal(
        (
          await db.query(
            "select status,error_code,provider_call_count,candidate_count,duration_ms from public.ai_match_runs where run_id=$1",
            [saved.runId],
          )
        ).rows[0].status,
        "failed",
      );
    },
  );
  await check(
    "false no_candidates is rejected when the authoritative set is nonempty",
    async () => {
      const p = await prepared(),
        snapshot = (
          await as(
            requester,
            "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
            [p.req.requestId, vector()],
          )
        ).rows;
      assert.ok(snapshot.length > 0);
      await assert.rejects(run(p.req, [], requester, uuid(), snapshot));
    },
  );
  await check(
    "trusted save detects candidate mutation, addition, and removal after retrieval",
    async () => {
      const changed = await prepared(),
        changedSnapshot = (
          await as(
            requester,
            "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
            [changed.req.requestId, vector()],
          )
        ).rows;
      await db.query(
        "update public.stock_portions set condition='Excellent' where portion_id=$1",
        [changed.row.portion_id],
      );
      await assert.rejects(
        run(
          changed.req,
          [score(changed.row.portion_id, changed.stock.assetId)],
          requester,
          uuid(),
          changedSnapshot,
        ),
      );

      const addedReq = await request(),
        original = await indexed(addedReq, await asset());
      const beforeAdd = (
        await as(
          requester,
          "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
          [addedReq.requestId, vector()],
        )
      ).rows;
      await indexed(addedReq, await asset());
      await assert.rejects(
        run(
          addedReq,
          [score(beforeAdd[0].portion_id, original.assetId)],
          requester,
          uuid(),
          beforeAdd,
        ),
      );

      const removedReq = await request(),
        removable = await indexed(removedReq, await asset());
      const beforeRemove = (
        await as(
          requester,
          "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
          [removedReq.requestId, vector()],
        )
      ).rows;
      await db.query(
        "update public.stock_portions set state='In Use' where portion_id=$1",
        [removable.portionId],
      );
      await assert.rejects(
        run(
          removedReq,
          [score(beforeRemove[0].portion_id, removable.assetId)],
          requester,
          uuid(),
          beforeRemove,
        ),
      );
    },
  );
  await check(
    "stale request version and stale candidate are rejected by trusted save",
    async () => {
      const p = await prepared(),
        rec = [score(p.row.portion_id, p.stock.assetId)];
      await assert.rejects(
        as(
          null,
          "select public.ai2_save_match_run($1,$2::jsonb)",
          [
            requester.userId,
            JSON.stringify({
              operationKey: uuid(),
              requestId: p.req.requestId,
              requestVersion: p.req.version - 1,
              queryVector: vectorArray(),
              candidateSnapshot: (
                await as(
                  requester,
                  "select * from public.ai2_candidates($1,$2::extensions.vector,20)",
                  [p.req.requestId, vector()],
                )
              ).rows,
              configurationVersion: "native-test-v1",
              model: "gte-small",
              providerCallCount: 1,
              durationMs: 1,
              outcome: "completed",
              recommendations: rec,
            }),
          ],
          "service_role",
        ),
      );
      await db.query(
        "update public.asset_embeddings set content_hash=$2 where asset_id=$1",
        [p.stock.assetId, "f".repeat(64)],
      );
      await assert.rejects(run(p.req, rec));
    },
  );
  await check(
    "explicit unauthorized and inactive actors rejected",
    async () => {
      const p = await prepared();
      await assert.rejects(run(p.req, [], rep));
      await db.query(
        "update public.profiles set active=false where user_id=$1",
        [requester.userId],
      );
      await assert.rejects(run(p.req, [], requester));
      await db.query(
        "update public.profiles set active=true where user_id=$1",
        [requester.userId],
      );
    },
  );
  await check("more than five recommendations rejected", async () => {
    const req = await request();
    await assert.rejects(
      run(
        req,
        Array.from({ length: 6 }, (_, i) => score(uuid(), uuid(), i + 1)),
      ),
    );
  });
  await check("unknown and ineligible candidates rejected", async () => {
    const p = await prepared();
    await assert.rejects(run(p.req, [score(uuid(), uuid())]));
    await db.query(
      "update public.asset_embeddings set content_hash=$2 where asset_id=$1",
      [p.stock.assetId, "e".repeat(64)],
    );
    await assert.rejects(
      run(p.req, [score(p.row.portion_id, p.stock.assetId)]),
    );
  });
  await check("unauthorized run read and review rejected", async () => {
    const p = await prepared();
    await assert.rejects(
      as(rep, "select public.ai2_match_results($1)", [p.saved.runId]),
    );
    await assert.rejects(review(p.recommendationId, "rejected", rep));
  });
  await check("rejection changes no interests, request, or stock", async () => {
    const p = await prepared(),
      before = (
        await db.query(
          "select (select count(*) from public.interests) i,(select version from public.resource_requests where request_id=$1) v,(select qty from public.stock_portions where portion_id=$2) q",
          [p.req.requestId, p.row.portion_id],
        )
      ).rows[0];
    await review(p.recommendationId, "rejected");
    const after = (
      await db.query(
        "select (select count(*) from public.interests) i,(select version from public.resource_requests where request_id=$1) v,(select qty from public.stock_portions where portion_id=$2) q",
        [p.req.requestId, p.row.portion_id],
      )
    ).rows[0];
    assert.deepEqual(after, before);
  });
  await check(
    "acceptance creates exactly one Interest without reservation or stock change",
    async () => {
      const p = await prepared(),
        before = (
          await db.query(
            "select qty,state from public.stock_portions where portion_id=$1",
            [p.row.portion_id],
          )
        ).rows[0];
      const accepted = await review(p.recommendationId, "accepted");
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.interests where interest_id=$1",
            [accepted.interestId],
          )
        ).rows[0].n,
        1,
      );
      assert.deepEqual(
        (
          await db.query(
            "select qty,state from public.stock_portions where portion_id=$1",
            [p.row.portion_id],
          )
        ).rows[0],
        before,
      );
    },
  );
  await check(
    "acceptance exact retry does not duplicate Interest",
    async () => {
      const p = await prepared(),
        key = uuid(),
        input = {
          operationKey: key,
          recommendationId: p.recommendationId,
          decision: "accepted",
        };
      const call = () =>
        as(
          requester,
          "select public.ai2_review_recommendation($1::jsonb) result",
          [JSON.stringify(input)],
        ).then((r) => r.rows[0].result);
      const a = await call(),
        b = await call();
      assert.deepEqual(a, b);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.interests where interest_id=$1",
            [a.interestId],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check("stale stock prevents recommendation acceptance", async () => {
    const p = await prepared();
    await db.query(
      "update public.stock_portions set state='Reserved' where portion_id=$1",
      [p.row.portion_id],
    );
    await assert.rejects(review(p.recommendationId, "accepted"));
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.interests where request_id=$1",
          [p.req.requestId],
        )
      ).rows[0].n,
      0,
    );
  });
  await check("stale request prevents recommendation acceptance", async () => {
    const p = await prepared();
    await db.query(
      "update public.resource_requests set status='Closed' where request_id=$1",
      [p.req.requestId],
    );
    await assert.rejects(review(p.recommendationId, "accepted"));
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.interests where request_id=$1",
          [p.req.requestId],
        )
      ).rows[0].n,
      0,
    );
  });
  console.log(`AI2 native: ${count} tests passed`);
} finally {
  await h.db.close();
}
