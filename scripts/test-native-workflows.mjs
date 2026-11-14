import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
const url = process.env.POSTGRES_TEST_ADMIN_URL;
if (!url)
  throw new Error(
    "Set POSTGRES_TEST_ADMIN_URL to a disposable PostgreSQL cluster. This creates two fresh test databases and leaves them for inspection.",
  );
const admin = new Client({ connectionString: url });
await admin.connect();
try {
  for (const script of [
    "test-workflows.mjs",
    "test-workflow-concurrency.mjs",
    "test-ai2-native.mjs",
  ]) {
    const name = "workflow_" + randomUUID().replaceAll("-", "");
    await admin.query(`create database ${name}`);
    const databaseUrl = new URL(url);
    databaseUrl.pathname = "/" + name;
    console.log(`Running ${script} in fresh disposable database ${name}`);
    const result = spawnSync(process.execPath, ["scripts/" + script], {
      env: {
        ...process.env,
        WORKFLOW_TEST_DATABASE_URL: databaseUrl.toString(),
        INCLUDE_AI2: script === "test-ai2-native.mjs" ? "1" : "0",
      },
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `${script} failed (exit ${result.status}); database ${name} preserved for diagnosis.`,
      );
  }
} finally {
  await admin.end();
}
