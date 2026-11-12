import { expect, test, spyOn } from "bun:test";
import { Baker, Cron } from "./index";
import type { PersistedState } from "./persistence/types";

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const logger = { info() {}, warn() {}, error() {}, debug() {} };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function state(jobs: unknown[] = []): PersistedState {
  return { version: 1, timestamp: new Date().toISOString(), config: {}, jobs } as PersistedState;
}
const savedJob = { name: "restored", cron: "@daily", status: "stopped", priority: 0 };

test("startup respects start:false for jobs registered before ready", async () => {
  const baker = new Baker({ autoStart: true });
  try {
    const job = baker.add({ name: "manual", cron: "@daily", start: false, callback() {} });
    await baker.ready();
    await wait(5);
    expect(job.isRunning()).toBe(false);
  } finally { baker.destroyAll(); }
});

test("startup cannot restart a job explicitly stopped before ready", async () => {
  const baker = new Baker({ autoStart: true });
  try {
    const job = baker.add({ name: "stopped", cron: "@daily", callback() {} });
    baker.stop("stopped");
    await baker.ready();
    await wait(5);
    expect(job.isRunning()).toBe(false);
  } finally { baker.destroyAll(); }
});

test("autoStart waits for restore, respects opt-outs, and saves registrations made during restore", async () => {
  const loaded = deferred<PersistedState>();
  const writes: PersistedState[] = [];
  const baker = new Baker({ autoStart: true, logger, persistence: { enabled: true,
    provider: { load: () => loaded.promise, save: async value => { writes.push(value); } } } });
  try {
    const automatic = baker.add({ name: "auto", cron: "@daily", callback() {} });
    const manual = baker.add({ name: "manual", cron: "@daily", start: false, callback() {} });
    expect(automatic.isRunning()).toBe(false);
    loaded.resolve(state([savedJob]));
    await baker.ready();
    await wait(10);
    expect(automatic.isRunning()).toBe(true);
    expect(manual.isRunning()).toBe(false);
    expect(writes.at(-1)?.jobs.map(job => job.name).sort()).toEqual(["auto", "manual", "restored"]);
  } finally { baker.destroyAll(); }
});

test("global async error handlers finish before the run is recorded", async () => {
  const handler = deferred<void>();
  let called = false;
  const baker = new Baker({ logger, onError: async () => { called = true; await handler.promise; } });
  const job = baker.add({ name: "error", cron: "@daily", start: true, immediate: true,
    callback() { throw new Error("failure"); } });
  try {
    await wait(20);
    expect(called).toBe(true);
    expect(job.getMetrics().totalExecutions).toBe(0);
    handler.resolve();
    await wait(10);
    expect(job.getMetrics().failedExecutions).toBe(1);
  } finally { handler.resolve(); baker.destroyAll(); }
});

test("onTick failures reach onError and failed execution metrics", async () => {
  const errors: Error[] = [];
  const job = Cron.create({ name: "tick", cron: "@daily", start: true, immediate: true, logger,
    callback() {}, onTick: async () => { throw new Error("tick failed"); },
    onError: error => { errors.push(error); } });
  try {
    await wait(20);
    expect(errors.map(error => error.message)).toEqual(["tick failed"]);
    expect(job.getMetrics().failedExecutions).toBe(1);
    expect(job.getHistory()[0].success).toBe(false);
  } finally { job.destroy(); }
});

test("timeouts recheck the due time when the wall clock moves backwards", async () => {
  const timers: { callback: () => void; delay: number }[] = [];
  const timer = spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, delay: number) => {
    timers.push({ callback, delay });
    return 123;
  }) as any);
  const originalNow = Date.now;
  let calls = 0;
  const job = Cron.create({ name: "clock", cron: "@every_second", callback() { calls++; } });
  try {
    job.start();
    const target = job.nextExecution().getTime();
    Date.now = () => target - 10_000;
    timers[0].callback();
    await Promise.resolve();
    expect(calls).toBe(0);
    expect(job.nextExecution().getTime()).toBe(target);
    expect(timers[1].delay).toBe(10_000);
  } finally { job.destroy(); Date.now = originalNow; timer.mockRestore(); }
});

for (const timezone of [undefined, "UTC", "America/New_York"]) {
  test(`previous execution includes the current second when before a fractional reference (${timezone})`, () => {
    const from = new Date("2026-01-01T12:00:00.500Z");
    expect(Cron.getPrevious("@every_second", from, timezone).toISOString()).toBe("2026-01-01T12:00:00.000Z");
    expect(Cron.getPrevious("@every_second", new Date("2026-01-01T12:00:00.000Z"), timezone).toISOString()).toBe("2026-01-01T11:59:59.000Z");
  });
}

test("invalid history limits are bounded and huge delays fall back safely", async () => {
  let calls = 0;
  const job = Cron.create({ name: "invalid-options", cron: "@daily", immediate: true,
    delay: "9".repeat(400) + "d", maxHistory: NaN, logger, callback() { calls++; } });
  try {
    job.start();
    expect(Number.isFinite(job.nextExecution().getTime())).toBe(true);
    await wait(20);
    expect(calls).toBe(1);
  } finally { job.destroy(); }
});

test("restoration skips corrupt records and does not leave partially restored jobs", async () => {
  const baker = new Baker({ logger, persistence: { enabled: true, provider: {
    save: async () => {}, load: async () => state([
      null,
      { ...savedJob, name: "bad-history", history: {} },
      { ...savedJob, name: "bad-date", history: [{ timestamp: "invalid", duration: 0, success: true }] },
      { ...savedJob, name: "bad-metrics", metrics: { totalExecutions: "bad" } },
      savedJob,
    ]) } } });
  try {
    await baker.ready();
    expect(baker.getJobNames()).toEqual(["restored"]);
    await baker.saveState();
  } finally { baker.destroyAll(); }
});

test("restoration preserves paused status and the most recent actual execution", async () => {
  const timestamp = "2020-01-01T00:00:00.000Z";
  const baker = new Baker({ logger, persistence: { enabled: true, provider: {
    save: async () => {}, load: async () => state([{ ...savedJob, status: "paused",
      history: [{ timestamp, duration: 10, success: true }] }]) } } });
  try {
    await baker.ready();
    expect(baker.getStatus("restored")).toBe("paused");
    expect(baker.lastExecution("restored").toISOString()).toBe(timestamp);
    baker.resume("restored");
    expect(baker.isRunning("restored")).toBe(true);
  } finally { baker.destroyAll(); }
});

test("concurrent restore callers both wait for loaded jobs", async () => {
  const loaded = deferred<PersistedState>();
  const baker = new Baker({ logger, persistence: { enabled: true,
    provider: { load: () => loaded.promise, save: async () => {} } } });
  let finished = false;
  const restoring = baker.restoreState().then(() => { finished = true; });
  try {
    await wait(5);
    expect(finished).toBe(false);
    loaded.resolve(state([savedJob]));
    await restoring;
    expect(baker.getJobNames()).toEqual(["restored"]);
  } finally { loaded.resolve(state()); await baker.ready(); baker.destroyAll(); }
});

test("hydration copies snapshots and rejects invalid metrics without partial mutation", () => {
  const job = Cron.create({ name: "hydrate", cron: "@daily", callback() {} });
  const timestamp = new Date("2020-01-01T00:00:00Z");
  const history = [{ timestamp, duration: 10, success: true }];
  job.hydratePersistence!({ history });
  timestamp.setFullYear(2025);
  history[0].duration = 999;
  expect(job.getHistory()[0].timestamp.toISOString()).toBe("2020-01-01T00:00:00.000Z");
  expect(job.getHistory()[0].duration).toBe(10);
  expect(() => job.hydratePersistence!({ history: [], metrics: { totalExecutions: -1 } as any })).toThrow();
  expect(job.getHistory()).toHaveLength(1);
});

test("failed restoration never automatically overwrites saved definitions", async () => {
  let writes = 0;
  const baker = new Baker({ logger, autoStart: true, persistence: { enabled: true, provider: {
    load: async () => { throw new Error("read failed"); }, save: async () => { writes++; },
  } } });
  const job = baker.add({ name: "new", cron: "@daily", callback() {} });
  try {
    await expect(baker.ready()).rejects.toThrow("read failed");
    await wait(5);
    expect(job.isRunning()).toBe(true);
    expect(writes).toBe(0);
  } finally { baker.stopAll(); }
});

for (const operation of ["remove", "destroyAll"] as const) {
  test(`${operation} during restore cannot resurrect removed jobs`, async () => {
    const loaded = deferred<PersistedState>();
    const baker = new Baker({ logger, persistence: { enabled: true,
      provider: { load: () => loaded.promise, save: async () => {} } } });
    if (operation === "remove") baker.remove("restored");
    else baker.destroyAll();
    loaded.resolve(state([savedJob]));
    await baker.ready();
    expect(baker.getJobNames()).toEqual([]);
  });
}

test("invalid replacement leaves the existing restored job intact", async () => {
  const baker = new Baker({ logger, persistence: { enabled: true,
    provider: { load: async () => state([savedJob]), save: async () => {} } } });
  try {
    await baker.ready();
    const previous = baker.getAllJobs().get("restored");
    expect(() => baker.add({ name: "restored", cron: "invalid", callback() {} })).toThrow();
    expect(baker.getAllJobs().get("restored")).toBe(previous);
  } finally { baker.destroyAll(); }
});

test("explicit saves wait for restoration instead of writing a partial snapshot", async () => {
  const loaded = deferred<PersistedState>();
  const writes: PersistedState[] = [];
  const baker = new Baker({ logger, persistence: { enabled: true,
    provider: { load: () => loaded.promise, save: async value => { writes.push(value); } } } });
  const saving = baker.saveState();
  try {
    await wait(5);
    expect(writes).toHaveLength(0);
    loaded.resolve(state([savedJob]));
    await saving;
    expect(writes[0].jobs[0].name).toBe("restored");
  } finally { loaded.resolve(state()); await baker.ready(); baker.destroyAll(); }
});

test("out-of-order completion keeps execution history and lastExecution chronological", async () => {
  const first = deferred<void>();
  let calls = 0;
  const job = Cron.create({ name: "overlap", cron: "@daily", immediate: true, overrunProtection: false,
    callback: async () => { if (++calls === 1) await first.promise; } });
  try {
    job.start();
    await wait(15);
    job.stop();
    job.start();
    await wait(15);
    const latest = job.lastExecution().getTime();
    first.resolve();
    await wait(5);
    expect(calls).toBe(2);
    expect(job.lastExecution().getTime()).toBe(latest);
    const history = job.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].timestamp.getTime()).toBeGreaterThan(history[1].timestamp.getTime());
  } finally { first.resolve(); job.destroy(); }
});

test("invalid polling intervals use the safe default", () => {
  const delays: number[] = [];
  const interval = spyOn(globalThis, "setInterval").mockImplementation(((_callback: () => void, delay: number) => {
    delays.push(delay); return 123;
  }) as any);
  try {
    for (const pollingInterval of [0, -1, 0.5, Infinity, NaN, 2147483648]) {
      const job = Cron.create({ name: "poll", cron: "@daily", logger, callback() {} }, { useCalculatedTimeouts: false, pollingInterval });
      try { job.start(); } finally { job.destroy(); }
    }
    expect(delays).toEqual(Array(6).fill(1000));
  } finally { interval.mockRestore(); }
});

test("preset validation agrees between parsing, isValid, and job creation", () => {
  expect(Cron.isValid("@between_9_9")).toBe(false);
  expect(() => Cron.parse("@between_9_9")).toThrow();
  expect(() => Cron.create({ name: "equal", cron: "@between_9_9", callback() {} })).toThrow();
});

test("immediate jobs reject impossible schedules before installing a timer", () => {
  const job = Cron.create({ name: "impossible", cron: "0 0 0 31 2 *", immediate: true, callback() {} });
  try {
    expect(() => job.start()).toThrow("400 years");
    expect(job.getStatus()).toBe("stopped");
    expect(job.remaining()).toBe(0);
  } finally { job.destroy(); }
});

test("execution durations stay nonnegative when the wall clock moves backwards", async () => {
  const originalNow = Date.now;
  const job = Cron.create({ name: "duration", cron: "@daily", immediate: true,
    callback() { const now = originalNow(); Date.now = () => now - 60_000; } });
  try {
    job.start();
    await wait(20);
    expect(job.getHistory()).toHaveLength(1);
    expect(job.getHistory()[0].duration).toBeGreaterThanOrEqual(0);
    expect(job.getMetrics().averageExecutionTime).toBeGreaterThanOrEqual(0);
  } finally { Date.now = originalNow; job.destroy(); }
});
