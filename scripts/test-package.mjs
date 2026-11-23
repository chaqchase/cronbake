import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Exercise the actual publishable tarball from an isolated consumer directory.
const root = resolve(import.meta.dirname, "..");
const fixture = mkdtempSync(join(tmpdir(), "cronbake-package-"));
const run = (command, args, cwd = fixture) => execFileSync(command, args, {
  cwd, encoding: "utf8", timeout: 30_000, env: { ...process.env, npm_config_cache: join(fixture, "npm-cache") },
});
try {
  const [packed] = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", fixture], root));
  for (const file of ["dist/index.js", "dist/index.cjs", "dist/index.d.ts", "dist/index.d.cts"]) {
    assert(packed.files.some(entry => entry.path === file), `Missing ${file} in package`);
  }
  assert(packed.files.every(entry => !entry.path.startsWith("lib/")), "Source tests leaked into package");
  const packageDir = join(fixture, "node_modules", "cronbake");
  mkdirSync(packageDir, { recursive: true });
  run("tar", ["-xzf", join(fixture, packed.filename), "-C", packageDir, "--strip-components=1"]);

  const checks = `
    const assert = require("node:assert/strict");
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const logger = { info() {}, warn() {}, error() {}, debug() {} };
    async function check(api) {
      assert.equal(api.default, api.Baker);
      assert.equal(api.Cron.getPrevious("@every_second", new Date("2026-01-01T00:00:00.500Z"), "UTC").toISOString(), "2026-01-01T00:00:00.000Z");
      assert.equal(api.Cron.getNext("0 30 2 * * *", new Date("2026-03-08T05:00:00Z"), "America/New_York").toISOString(), "2026-03-09T06:30:00.000Z");
      for (const useCalculatedTimeouts of [true, false]) {
        const baker = new api.Baker({ autoStart: true, logger, schedulerConfig: { useCalculatedTimeouts, pollingInterval: 10 },
          onError: async () => { await wait(1); throw new Error("handler failed"); } });
        try {
          const manual = baker.add({ name: "manual", cron: "@daily", start: false, callback() {} });
          const failing = baker.add({ name: "failure", cron: "@daily", immediate: true, callback() { throw new Error("expected"); } });
          await baker.ready();
          assert.equal(manual.isRunning(), false);
          let runs = 0;
          const job = baker.add({ name: "scheduled", cron: "@every_second", callback() { runs++; baker.stop("scheduled"); } });
          const deadline = Date.now() + 3000;
          while ((runs === 0 || failing.getMetrics().failedExecutions === 0) && Date.now() < deadline) await wait(10);
          assert.equal(runs, 1);
          assert.equal(job.getStatus(), "stopped");
          assert.equal(job.getMetrics().successfulExecutions, 1);
          assert.equal(failing.getMetrics().failedExecutions, 1);
        } finally { baker.destroyAll(); }
      }
      const provider = new api.FilePersistenceProvider("./state.json");
      await provider.save({ version: 1, timestamp: new Date().toISOString(), config: {}, jobs: [] });
      assert.deepEqual((await provider.load()).jobs, []);
    }
    module.exports = check;
  `;
  writeFileSync(join(fixture, "checks.cjs"), checks);
  writeFileSync(join(fixture, "consumer.mjs"), 'import * as api from "cronbake"; import check from "./checks.cjs"; await check(api);\n');
  writeFileSync(join(fixture, "consumer.cjs"), 'require("./checks.cjs")(require("cronbake")).catch(error => { console.error(error); process.exitCode = 1; });\n');
  for (const file of ["consumer.mjs", "consumer.cjs"]) {
    run(process.execPath, ["--unhandled-rejections=strict", file]);
    console.log(`Package runtime passed: ${file}`);
  }
  const consumerTypes = 'import { Baker, Cron, type CronOptions } from "cronbake";\nconst options: CronOptions = { name: "typed", cron: "@daily", callback: async () => {} };\nBaker.create().add(options);\nCron.getNext("@daily", new Date(), "UTC");\n';
  for (const extension of ["mts", "cts"]) writeFileSync(join(fixture, `types.${extension}`), consumerTypes);
  run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "es2022", "types.mts", "types.cts"]);
  console.log("Package TypeScript consumers passed: ESM and CommonJS");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
