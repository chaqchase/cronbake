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

  test("accepts a seventh field of *, which 0.4.0 ignored", () => {
    expect(Cron.isValid("0 0 12 * * * *")).toBe(true);
    expect(Cron.parse("0 0 12 * * * *")).toEqual(Cron.parse("0 0 12 * * *"));
    expect(Cron.isValid("0 0 12 * * * 2027")).toBe(false);
    expect(Cron.isValid("0 0 12 * * * * *")).toBe(false);
  });

  test("combines lists, ranges and steps in sorted unique order", () => {
    expect(Cron.parse("1-5/2,10,3,20/20 * * * * *").second).toEqual([1, 3, 5, 10, 20, 40]);
  });

  test("accepts whitespace between fields", () => {
    expect(Cron.parse("  0\t0  12 * * *  ").hour).toEqual([12]);
  });
});
