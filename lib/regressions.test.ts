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

for (const delay of [-1, NaN, Infinity, "nonsense"]) {
  test(`rejects invalid delay ${delay}`, () => {
    expect(() => Cron.create({ name: "bad", cron: "@daily", delay, callback() {} })).toThrow();
  });
}
