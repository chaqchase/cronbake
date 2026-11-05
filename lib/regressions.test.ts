import { expect, test } from "bun:test";
import { Baker, Cron } from "./index";
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("calendar search supports reference dates and leap years", () => {
  const from = new Date(2025, 0, 1);
  expect(Cron.getNext("0 0 0 29 2 *", from).getFullYear()).toBe(2028);
  expect(Cron.getPrevious("0 0 0 29 2 *", from).getFullYear()).toBe(2024);
  expect(() => Cron.getNext("0 0 0 31 2 *", from)).toThrow();
  expect(() => Cron.getNext("* * * * * *", new Date(NaN))).toThrow();
});

for (const useCalculatedTimeouts of [true, false]) {
  test(`stopping inside an async callback stays stopped (${useCalculatedTimeouts})`, async () => {
    let calls = 0;
    const job = Cron.create({ name: "stop", cron: "* * * * * *", immediate: true,
      callback: async () => { calls++; job.stop(); await wait(20); }
    }, { useCalculatedTimeouts, pollingInterval: 5 });
    try { job.start(); await wait(1100); expect(calls).toBe(1); expect(job.remaining()).toBe(0); }
    finally { job.destroy(); }
  });
}

test("autoStart applies to newly added jobs and explicit false overrides it", async () => {
  const baker = new Baker({ autoStart: true });
  await baker.ready();
  try {
    expect(baker.add({ name: "auto", cron: "@daily", callback() {} }).isRunning()).toBe(true);
    expect(baker.add({ name: "manual", cron: "@daily", start: false, callback() {} }).isRunning()).toBe(false);
  } finally { baker.destroyAll(); }
});

function warningLogger() {
  const warnings: string[] = [];
  const logger = {
    debug() {},
    info() {},
    warn: (message: unknown) => void warnings.push(String(message)),
    error() {},
  };
  return { warnings, logger };
}

// 0.4.0 accepted all of these, so a job that uses one has to keep starting after an upgrade.
for (const [label, options, config] of [
  ["delay -1", { delay: -1 }],
  ["delay NaN", { delay: NaN }],
  ["delay Infinity", { delay: Infinity }],
  ["delay nonsense", { delay: "nonsense" }],
  ["delay 1.5s", { delay: "1.5s" }],
  ["maxHistory -1", { maxHistory: -1 }],
  ["maxHistory 1.5", { maxHistory: 1.5 }],
  ['maxHistory "10"', { maxHistory: "10" }],
  ['priority "1"', { priority: "1" }],
  ["priority NaN", { priority: NaN }],
  ['callback "x"', { callback: "x" }],
  ["pollingInterval 0", {}, { pollingInterval: 0 }],
  ["pollingInterval -1", {}, { pollingInterval: -1 }],
] as [string, Record<string, unknown>, Record<string, number>?][]) {
  test(`warns about ${label} and still creates the job`, () => {
    const { warnings, logger } = warningLogger();
    const job = Cron.create({ name: "odd", cron: "@daily", logger, callback() {}, ...options } as any, config);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("odd");
    job.destroy();
  });
}

test("a job with an invalid delay runs straight away, as it did in 0.4.0", async () => {
  const { logger } = warningLogger();
  let runs = 0;
  const job = Cron.create({ name: "soon", cron: "@yearly", immediate: true, delay: "soon", start: true, logger, callback: () => void runs++ });
  await new Promise((resolve) => setTimeout(resolve, 30));
  job.destroy();
  expect(runs).toBe(1);
});

test("a job can run on its onTick hook alone, as it did in 0.4.0", async () => {
  const { warnings, logger } = warningLogger();
  let ticks = 0;
  const job = Cron.create({ name: "hook-only", cron: "@yearly", immediate: true, start: true, logger, onTick: () => void ticks++, callback: undefined as any });
  await new Promise((resolve) => setTimeout(resolve, 30));
  job.destroy();
  expect(ticks).toBe(1);
  expect(warnings).toHaveLength(0);
  expect(job.getMetrics().successfulExecutions).toBe(1);
});

test("a callback that isn't a function is reported as a failed run", async () => {
  const { logger } = warningLogger();
  const errors: Error[] = [];
  const job = Cron.create({ name: "not-a-function", cron: "@yearly", immediate: true, start: true, logger, onError: (error) => errors.push(error), callback: "x" as any });
  await new Promise((resolve) => setTimeout(resolve, 30));
  job.destroy();
  expect(errors).toHaveLength(1);
  expect(job.getMetrics().failedExecutions).toBe(1);
});

test("strategy custom without a provider starts with nothing saved, as it did in 0.4.0", async () => {
  const baker = new Baker({ persistence: { enabled: true, strategy: "custom" } });
  await baker.ready();
  await baker.saveState();
  baker.destroyAll();
});

test("autoStart still starts jobs after a failed restore, without an unhandled rejection", async () => {
  const { logger } = warningLogger();
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => void unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  const baker = new Baker({
    autoStart: true,
    logger,
    persistence: {
      enabled: true,
      provider: {
        save: async () => {},
        load: async () => {
          throw new Error("storage is down");
        },
      },
    },
  });
  try {
    const job = baker.add({ name: "after-failure", cron: "@daily", callback() {} });
    await baker.ready().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(job.isRunning()).toBe(true);
    expect(unhandled).toHaveLength(0);
  } finally {
    (process as any).off("unhandledRejection", onUnhandled);
    baker.destroyAll();
  }
});
