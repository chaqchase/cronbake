import {
  type AtHourStrType,
  type BetweenStrType,
  type CronExpression,
  type CronExpressionType,
  type CronTime,
  type EveryStrType,
  type ICronParser,
  type OnDayStrType,
} from "./types";

/**
 * A class that implements the `ICronParser` interface and provides methods to parse a cron expression
 * and get the next and previous execution times.
 */
class CronParser<T extends string> implements ICronParser {
  /**
   * Creates a new instance of the `CronParser` class.
   */
  constructor(private cron: CronExpressionType<T>) {}

  /**
   * A map of cron expression aliases to their corresponding cron expressions.
   *    * * * * * * (second minute hour day month day-of-week)
   *    | | | | | |
   *    | | | | | +-- day of the week (0 - 6) (Sunday to Saturday)
   *    | | | | +---- month (1 - 12)
   *    | | | +------ day of the month (1 - 31)
   *    | | +-------- hour (0 - 23)
   *    | +---------- minute (0 - 59)
   *    +------------ second (0 - 59)
   */
  private readonly aliases: Map<CronExpression, string> = new Map([
    ["@every_second", "* * * * * *"],
    ["@every_minute", "0 * * * * *"],
    ["@yearly",       "0 0 0 1 1 *"], // 00:00:00 at day 1 of month and Jan
    ["@annually",     "0 0 0 1 1 *"], // 00:00:00 at day 1 of month and Jan
    ["@monthly",      "0 0 0 1 * *"], // 00:00:00 at day 1 of month
    ["@weekly",       "0 0 0 * * 0"], // 00:00:00 at sun
    ["@daily",        "0 0 0 * * *"], // 00:00:00 every day
    ["@hourly",       "0 0 * * * *"], // 00:00  every hour
  ]);

  /**
   * Parses a string in the format "@every_<value>_<unit>" and returns the corresponding cron expression.
   */
  private parseEveryStr(str: EveryStrType): string {
    const [, value, unit] = str.split("_");
    switch (unit) {
      case "seconds":
        return `*/${value} * * * * *`;
      case "minutes":
        return `0 */${value} * * * *`;
      case "hours":
        return `0 0 */${value} * * *`;
      case "dayOfMonth":
        return `0 0 0 */${value} * *`;
      case "months":
        // Run at midnight on the 1st day every N months
        return `0 0 0 1 */${value} *`;
      case "dayOfWeek":
        // Run at midnight on every Nth day-of-week (e.g., */2 => Sun, Tue, Thu, Sat)
        return `0 0 0 * * */${value}`;
      default:
        throw new Error(`Unknown cron interval unit: ${unit}`);
    }
  }

  /**
   * Parses a string in the format "@at_<time>" and returns the corresponding cron expression.
   */
  private parseAtHourStr(str: AtHourStrType): string {
    const [, time] = str.split("_");
    const [hour, minute] = time.split(":");
    return `0 ${minute} ${hour} * * *`;
  }

  /**
   * Parses a string in the format "@on_<day>" and returns the corresponding cron expression.
   */
  private parseOnDayStr(str: OnDayStrType): string {
    const [, day] = str.split("_");
    const days = new Map([
      ["sunday", 0],
      ["monday", 1],
      ["tuesday", 2],
      ["wednesday", 3],
      ["thursday", 4],
      ["friday", 5],
      ["saturday", 6],
    ]);
    return `0 0 0 * * ${days.get(day)}`;
  }

  /**
   * Parses a string in the format "@between_<start>_<end>" and returns the corresponding cron expression.
   */
  private parseBetweenStr(str: BetweenStrType): string {
    const [, start, end] = str.split("_");
    return `0 0 ${start}-${end} * * *`;
  }

  /**
   * Parses the input string and returns the corresponding cron expression.
   */
  private parseStr(str: string): CronExpressionType<T> {
    if (this.aliases.has(str as CronExpression)) {
      return (
        (this.aliases.get(str as CronExpression) as CronExpressionType<T>) ||
        ("" as CronExpressionType<T>)
      );
    }
    if (/^@every_\d+_(seconds|minutes|hours|dayOfMonth|months|dayOfWeek)$/.test(str)) {
      return this.parseEveryStr(str as EveryStrType) as CronExpressionType<T>;
    }
    if (/^@at_\d+:\d+$/.test(str)) {
      return this.parseAtHourStr(str as AtHourStrType) as CronExpressionType<T>;
    }
    if (/^@on_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(str)) {
      return this.parseOnDayStr(str as OnDayStrType) as CronExpressionType<T>;
    }
    if (/^@between_\d+_\d+$/.test(str)) {
      return this.parseBetweenStr(
        str as BetweenStrType,
      ) as CronExpressionType<T>;
    }
    return str as CronExpressionType<T>;
  }

  /**
   * Parses the cron expression and returns a `CronTime` object representing the parsed cron expression.
   * @returns A `CronTime` object representing the parsed cron expression.
   */
  parse(): CronTime {
    const fields = this.parseStr(this.cron.trim()).split(/\s+/);
    if (fields.length !== 6) throw new Error("Cron expressions require six fields");
    const [second, minute, hour, dayOfMonth, month, dayOfWeek] = fields;
    return {
      second: this.parseCronTime(second, 0, 59),
      minute: this.parseCronTime(minute, 0, 59),
      hour: this.parseCronTime(hour, 0, 23),
      dayOfMonth: this.parseCronTime(dayOfMonth, 1, 31),
      month: this.parseCronTime(month, 1, 12),
      dayOfWeek: this.parseCronTime(dayOfWeek, 0, 6),
    };
  }

  /**
   * Gets the next execution time based on the current time.
   * @returns A `Date` object representing the next execution time.
   */
  getNext(from: Date = new Date()): Date {
    return this.findExecution(from, 1);
  }

  getPrevious(from: Date = new Date()): Date {
    return this.findExecution(from, -1);
  }

  private findExecution(from: Date, direction: 1 | -1): Date {
    if (!Number.isFinite(from.getTime())) throw new Error("Invalid reference date");
    const fields = this.parse();
    const date = new Date(Math.floor(from.getTime() / 1000) * 1000);
    date.setTime(date.getTime() + direction * 1000);
    const limit = from.getFullYear() + direction * 400;
    while (direction > 0 ? date.getFullYear() <= limit : date.getFullYear() >= limit) {
      if (!fields.month!.includes(date.getMonth() + 1) ||
          !fields.dayOfMonth!.includes(date.getDate()) ||
          !fields.dayOfWeek!.includes(date.getDay())) {
        date.setDate(date.getDate() + direction);
        date.setHours(direction > 0 ? 0 : 23, direction > 0 ? 0 : 59, direction > 0 ? 0 : 59, 0);
        continue;
      }
      if (this.checkCronTime(fields, date)) return date;
      date.setTime(date.getTime() + direction * 1000);
    }
    throw new Error("Cron expression has no execution within 400 years");
  }

  /**
   * Parses a cron time string and returns an array of numbers representing the valid values for that field.
   */
  private parseCronTime(cronTime: string, min: number, max: number): number[] {
    const result = new Set<number>();
    for (const part of cronTime.split(",")) {
      const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
      if (!match) throw new Error(`Invalid cron field: ${cronTime}`);
      const [, base, stepText] = match;
      const step = stepText === undefined ? 1 : Number(stepText);
      if (!Number.isSafeInteger(step) || step <= 0) {
        throw new Error(`Invalid cron step: ${part}`);
      }
      let start = min;
      let end = max;
      if (base !== "*") {
        const bounds = base.split("-").map(Number);
        start = bounds[0];
        end = bounds.length === 2 ? bounds[1] : stepText === undefined ? start : max;
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
          start < min || end > max || start > end) {
        throw new Error(`Cron field out of range: ${part}`);
      }
      for (let value = start; value <= end; value += step) result.add(value);
    }
    return [...result].sort((a, b) => a - b);
  }

  /**
   * Checks if the given date matches the cron time.
   */
  private checkCronTime(cronTime: CronTime, date: Date): boolean {
    if (cronTime.second && !cronTime.second.includes(date.getSeconds())) {
      return false;
    }
    if (cronTime.minute && !cronTime.minute.includes(date.getMinutes())) {
      return false;
    }
    if (cronTime.hour && !cronTime.hour.includes(date.getHours())) {
      return false;
    }
    if (cronTime.dayOfMonth && !cronTime.dayOfMonth.includes(date.getDate())) {
      return false;
    }
    if (cronTime.month && !cronTime.month.includes(date.getMonth() + 1)) {
      return false;
    }
    if (cronTime.dayOfWeek && !cronTime.dayOfWeek.includes(date.getDay())) {
      return false;
    }
    return true;
  }
}

export default CronParser;
