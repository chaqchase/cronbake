import { describe, expect, test } from "bun:test";
import { Cron } from "./index";

describe("strict cron parsing", () => {
  for (const expression of [
    "*/0 * * * * *", "*/-1 * * * * *", "60 * * * * *",
    "1-60 * * * * *", "9-2 * * * * *", "1x * * * * *",
    "1,,2 * * * * *", "* * * * *", "* * * * * * extra",
    "* * * 0 * *", "* * * * 13 *", "* * * * * 7",
    "@every_2_unknown", "prefix@at_12:30", "@at_12:30_suffix",
    "@on_unknown", "@every_0_seconds", "@at_24:00",
  ]) {
    test(`rejects ${expression}`, () => {
      expect(Cron.isValid(expression)).toBe(false);
      expect(() => Cron.parse(expression)).toThrow();
      expect(() => Cron.create({ name: "invalid", cron: expression, callback() {} })).toThrow();
    });
  }

  test("combines lists, ranges and steps in sorted unique order", () => {
    expect(Cron.parse("1-5/2,10,3,20/20 * * * * *").second).toEqual([1, 3, 5, 10, 20, 40]);
  });

  test("accepts whitespace between fields", () => {
    expect(Cron.parse("  0\t0  12 * * *  ").hour).toEqual([12]);
  });
});
