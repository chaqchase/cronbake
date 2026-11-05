import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Baker, Cron, CronParser } from "./index";
import type { PersistedState } from "./persistence/types";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const at = (iso: string) => new Date(iso);
const iso = (date: Date) => date.toISOString().replace(".000Z", "Z");

/** Follows a schedule from a starting point and returns each run in order. */
function runs(
  step: typeof Cron.getNext,
  cron: string,
  zone: string,
  from: string,
  count: number,
): string[] {
  const found: string[] = [];
  let cursor = at(from);
  for (let i = 0; i < count; i++) {
    cursor = step(cron, cursor, zone);
    found.push(iso(cursor));
  }
  return found;
}

test("schedules follow the clock of the given time zone", () => {
  const winter = at("2026-01-15T00:00:00Z");
  expect(iso(Cron.getNext("0 30 9 * * *", winter, "America/New_York"))).toBe("2026-01-15T14:30:00Z");
  expect(iso(Cron.getNext("0 30 9 * * *", winter, "Asia/Tokyo"))).toBe("2026-01-15T00:30:00Z");
  expect(iso(Cron.getNext("0 30 9 * * *", winter, "UTC"))).toBe("2026-01-15T09:30:00Z");

  const summer = at("2026-07-01T00:00:00Z");
  expect(iso(Cron.getNext("0 30 9 * * *", summer, "America/New_York"))).toBe("2026-07-01T13:30:00Z");
});

test("offsets that aren't whole hours are honored", () => {
  const from = at("2026-01-15T00:00:00Z");
  expect(iso(Cron.getNext("0 0 9 * * *", from, "Asia/Kathmandu"))).toBe("2026-01-15T03:15:00Z");
  expect(iso(Cron.getNext("0 0 9 * * *", from, "Asia/Kolkata"))).toBe("2026-01-15T03:30:00Z");
});

test("presets follow the time zone", () => {
  const from = at("2026-01-15T00:00:00Z");
  expect(iso(Cron.getNext("@at_18:30", from, "Asia/Tokyo"))).toBe("2026-01-15T09:30:00Z");
  expect(iso(Cron.getNext("@daily", from, "America/New_York"))).toBe("2026-01-15T05:00:00Z");
});

test("day fields are read in the time zone, not in UTC", () => {
  // Sunday evening in Los Angeles is already Monday in UTC.
  const sunday = Cron.getNext("0 0 20 * * 0", at("2026-01-11T00:00:00Z"), "America/Los_Angeles");
  expect(iso(sunday)).toBe("2026-01-12T04:00:00Z");

  // The 1st in Auckland is still the 31st in UTC.
  const first = Cron.getNext("0 0 0 1 * *", at("2026-01-15T00:00:00Z"), "Pacific/Auckland");
  expect(iso(first)).toBe("2026-01-31T11:00:00Z");
});

test("a clock time skipped by daylight saving doesn't run that day", () => {
  expect(runs(Cron.getNext, "0 30 2 * * *", "America/New_York", "2026-03-08T05:00:00Z", 2)).toEqual([
    "2026-03-09T06:30:00Z",
    "2026-03-10T06:30:00Z",
  ]);
  // The clock times either side of the skipped hour still run.
  const from = at("2026-03-08T05:00:00Z");
  expect(iso(Cron.getNext("0 59 1 * * *", from, "America/New_York"))).toBe("2026-03-08T06:59:00Z");
  expect(iso(Cron.getNext("0 0 3 * * *", from, "America/New_York"))).toBe("2026-03-08T07:00:00Z");
});

test("a schedule tied to certain hours runs once when a clock time repeats", () => {
  expect(runs(Cron.getNext, "0 30 1 * * *", "America/New_York", "2026-11-01T04:00:00Z", 3)).toEqual([
    "2026-11-01T05:30:00Z",
    "2026-11-02T06:30:00Z",
    "2026-11-03T06:30:00Z",
  ]);
  // Starting during the second pass doesn't run it either.
  expect(iso(Cron.getNext("0 45 1 * * *", at("2026-11-01T06:10:00Z"), "America/New_York"))).toBe("2026-11-02T06:45:00Z");
  // A clock time just past the repeat isn't affected.
  expect(iso(Cron.getNext("0 0 2 * * *", at("2026-11-01T04:00:00Z"), "America/New_York"))).toBe("2026-11-01T07:00:00Z");
});

test("getPrevious passes over the second run of a repeated clock time", () => {
  expect(runs(Cron.getPrevious, "0 30 1 * * *", "America/New_York", "2026-11-02T00:00:00Z", 3)).toEqual([
    "2026-11-01T05:30:00Z",
    "2026-10-31T05:30:00Z",
    "2026-10-30T05:30:00Z",
  ]);
});

test("a schedule that covers every hour keeps its pace through a repeated hour", () => {
  expect(runs(Cron.getNext, "0 0 * * * *", "America/New_York", "2026-11-01T04:30:00Z", 3)).toEqual([
    "2026-11-01T05:00:00Z",
    "2026-11-01T06:00:00Z",
    "2026-11-01T07:00:00Z",
  ]);
  expect(runs(Cron.getPrevious, "0 */30 * * * *", "America/New_York", "2026-11-01T06:10:00Z", 3)).toEqual([
    "2026-11-01T06:00:00Z",
    "2026-11-01T05:30:00Z",
    "2026-11-01T05:00:00Z",
  ]);
});

test("frequent schedules keep an even pace across a change", () => {
  // Every 30 minutes stays 30 real minutes apart while the New York clock jumps forward.
  expect(runs(Cron.getNext, "0 */30 * * * *", "America/New_York", "2026-03-08T06:15:00Z", 3)).toEqual([
    "2026-03-08T06:30:00Z",
    "2026-03-08T07:00:00Z",
    "2026-03-08T07:30:00Z",
  ]);
});

test("changes that happen at midnight are handled", () => {
  // In 2024, Havana skipped midnight in March and repeated it in November.
  expect(runs(Cron.getNext, "0 0 0 * * *", "America/Havana", "2024-03-09T12:00:00Z", 1)).toEqual([
    "2024-03-11T04:00:00Z",
  ]);
  expect(runs(Cron.getNext, "0 0 0 * * *", "America/Havana", "2024-11-02T12:00:00Z", 3)).toEqual([
    "2024-11-03T04:00:00Z",
    "2024-11-04T05:00:00Z",
    "2024-11-05T05:00:00Z",
  ]);
});

test("a whole day skipped by crossing the date line is handled", () => {
  // Samoa skipped December 30, 2011.
  expect(runs(Cron.getNext, "0 0 12 * * *", "Pacific/Apia", "2011-12-29T10:00:00Z", 2)).toEqual([
    "2011-12-29T22:00:00Z",
    "2011-12-30T22:00:00Z",
  ]);
});

test("changes a few days apart are all seen", () => {
  // Noronha moved its clock forward on October 8, 2000 and back again on October 15.
  const zone = "America/Noronha";
  expect(iso(Cron.getNext("0 0 12 11 10 *", at("2000-10-01T00:00:00Z"), zone))).toBe("2000-10-11T13:00:00Z");
  expect(iso(Cron.getNext("0 0 12 20 10 *", at("2000-10-01T00:00:00Z"), zone))).toBe("2000-10-20T14:00:00Z");
});

test("the reference time itself is excluded", () => {
  const run = at("2026-01-15T14:30:00Z");
  expect(iso(Cron.getNext("0 30 9 * * *", run, "America/New_York"))).toBe("2026-01-16T14:30:00Z");
  expect(iso(Cron.getPrevious("0 30 9 * * *", run, "America/New_York"))).toBe("2026-01-14T14:30:00Z");
});

test("impossible dates and bad references still throw", () => {
  const from = at("2026-01-15T00:00:00Z");
  expect(() => Cron.getNext("0 0 0 31 2 *", from, "Asia/Tokyo")).toThrow("no execution within 400 years");
  expect(() => Cron.getPrevious("0 0 0 31 2 *", from, "Asia/Tokyo")).toThrow("no execution within 400 years");
  expect(() => Cron.getNext("* * * * * *", new Date(NaN), "Asia/Tokyo")).toThrow("Invalid reference date");
});

for (const zone of ["Mars/Olympus", "", "not a zone"]) {
  test(`rejects the time zone "${zone}"`, () => {
    const message = `Invalid timezone: ${zone}`;
    expect(() => new CronParser("* * * * * *", zone)).toThrow(message);
    expect(() => Cron.getNext("* * * * * *", undefined, zone)).toThrow(message);
    expect(() => Cron.create({ name: "bad", cron: "* * * * * *", timezone: zone, callback: () => {} })).toThrow(message);
    expect(() => Baker.create().add({ name: "bad", cron: "* * * * * *", timezone: zone, callback: () => {} })).toThrow(message);
  });
}

test("a job without a time zone follows the process", () => {
  const job = Cron.create({ name: "local", cron: "0 30 9 * * *", callback: () => {} });
  expect(job.timezone).toBeUndefined();
  const from = at("2026-01-15T00:00:00Z");
  expect(iso(new CronParser("0 30 9 * * *").getNext(from))).toBe(iso(Cron.getNext("0 30 9 * * *", from)));
});

test("a running job schedules itself and fires in its time zone", async () => {
  let calls = 0;
  const job = Cron.create({
    name: "zoned",
    cron: "* * * * * *",
    timezone: "Pacific/Auckland",
    callback: () => {
      calls++;
    },
    start: true,
  });
  await wait(1200);
  job.destroy();
  expect(job.timezone).toBe("Pacific/Auckland");
  expect(calls).toBeGreaterThanOrEqual(1);

  const daily = Cron.create({ name: "daily", cron: "0 30 9 * * *", timezone: "Asia/Tokyo", callback: () => {}, start: true });
  const expected = Cron.getNext("0 30 9 * * *", new Date(), "Asia/Tokyo");
  expect(iso(daily.nextExecution())).toBe(iso(expected));
  daily.destroy();
});

for (const useCalculatedTimeouts of [true, false]) {
  test(`time zones work in both scheduler modes (${useCalculatedTimeouts})`, async () => {
    let calls = 0;
    const baker = Baker.create({ schedulerConfig: { useCalculatedTimeouts, pollingInterval: 100 } });
    baker.add({
      name: "zoned",
      cron: "* * * * * *",
      timezone: "Asia/Kathmandu",
      callback: () => {
        calls++;
      },
      start: true,
    });
    await wait(1300);
    baker.destroyAll();
    expect(calls).toBeGreaterThanOrEqual(1);
  });
}

test("saving and restoring keeps a job's time zone", async () => {
  let saved: PersistedState | null = null;
  const writer = Baker.create({
    persistence: {
      enabled: true,
      autoRestore: false,
      provider: {
        save: async (state) => {
          saved = JSON.parse(JSON.stringify(state));
        },
        load: async () => saved,
      },
    },
  });
  writer.add({ name: "zoned", cron: "0 30 9 * * *", timezone: "Asia/Tokyo", callback: () => {}, start: true });
  writer.add({ name: "local", cron: "0 30 9 * * *", callback: () => {} });
  await writer.saveState();
  const state = saved as unknown as PersistedState;
  expect(state.jobs.find((job) => job.name === "zoned")?.timezone).toBe("Asia/Tokyo");
  expect(state.jobs.find((job) => job.name === "local")?.timezone).toBeUndefined();

  const reader = Baker.create({
    persistence: {
      enabled: true,
      provider: { save: async () => {}, load: async () => state },
    },
  });
  await reader.ready();
  const jobs = reader.getAllJobs();
  expect(jobs.get("zoned")?.timezone).toBe("Asia/Tokyo");
  expect(jobs.get("local")?.timezone).toBeUndefined();
  expect(iso(reader.nextExecution("zoned"))).toBe(iso(Cron.getNext("0 30 9 * * *", new Date(), "Asia/Tokyo")));
  reader.destroyAll();
  writer.destroyAll();
});

test("a restored job with an unknown time zone is skipped with a warning", async () => {
  const warnings: unknown[][] = [];
  const reader = Baker.create({
    logger: { info: () => {}, warn: (...args: unknown[]) => warnings.push(args) } as any,
    persistence: {
      enabled: true,
      provider: {
        save: async () => {},
        load: async () => ({
          version: 1,
          timestamp: new Date().toISOString(),
          config: {},
          jobs: [{ name: "gone", cron: "* * * * * *", timezone: "Mars/Olympus", status: "stopped", priority: 0 }],
        }) as any,
      },
    },
  });
  await reader.ready();
  expect(reader.getAllJobs().has("gone")).toBe(false);
  expect(String(warnings[0]?.[0])).toContain("gone");
});

// The search without a time zone reads the process zone, so each case needs its own process.
// The time limit keeps a search that never returns from stalling the whole suite.
const processZoneCases: [zone: string, method: "getNext" | "getPrevious", cron: string, from: string][] = [
  ["America/St_Johns", "getNext", "0 0 12 * * 0", "2000-10-27T00:00:00Z"],
  ["America/Moncton", "getNext", "0 0 12 * * 0", "2000-10-27T00:00:00Z"],
  ["America/Godthab", "getPrevious", "0 0 0 1 * *", "2024-04-01T01:00:00Z"],
  ["Pacific/Apia", "getPrevious", "0 0 0 1 * *", "2011-12-31T10:00:00Z"],
  ["Pacific/Apia", "getPrevious", "0 0 12 * * 0", "2011-12-31T22:00:00Z"],
  ["America/New_York", "getNext", "0 30 1 * * *", "2026-11-01T04:00:00Z"],
  ["America/New_York", "getPrevious", "0 30 1 * * *", "2026-11-02T00:00:00Z"],
  ["America/New_York", "getNext", "0 0 * * * *", "2026-11-01T04:30:00Z"],
  ["America/New_York", "getPrevious", "0 0 12 * * *", "2026-03-08T16:00:00Z"],
  ["Europe/London", "getNext", "0 30 1 * * *", "2026-10-25T00:00:00Z"],
];

for (const [zone, method, cron, from] of processZoneCases) {
  test(`the process zone search matches the zone search: ${zone} ${method} ${cron}`, () => {
    const script = `
      import CronParser from ${JSON.stringify(join(import.meta.dir, "parser"))};
      const parser = new CronParser(${JSON.stringify(cron)});
      let cursor = new Date(${JSON.stringify(from)});
      const found = [];
      for (let i = 0; i < 4; i++) found.push((cursor = parser.${method}(cursor)).toISOString());
      console.log(JSON.stringify(found));
    `;
    const child = spawnSync(process.execPath, ["-e", script], {
      env: { ...process.env, TZ: zone },
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(child.signal).toBeNull();
    expect(child.stderr).toBe("");
    expect(child.status).toBe(0);

    const expected: string[] = [];
    let cursor = at(from);
    for (let i = 0; i < 4; i++) {
      cursor = Cron[method](cron, cursor, zone);
      expected.push(cursor.toISOString());
    }
    expect(JSON.parse(child.stdout)).toEqual(expected);
  }, 15_000);
}
