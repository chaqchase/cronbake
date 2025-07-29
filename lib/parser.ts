import {
  type AtHourStrType,
  type BetweenStrType,
  type CronExpression,
  type CronExpressionType,
  type CronTime,
  type EveryStrType,
  type ICronParser,
  type OnDayStrType,
} from "@/lib/types";

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
   */
  private readonly aliases: Map<CronExpression, string> = new Map([
    ["@every_second", "* * * * * *"],
    ["@every_minute", "0 * * * * *"],
    ["@yearly", "0 0 1 1 * *"],
    ["@annually", "0 0 1 1 * *"],
    ["@monthly", "0 0 1 * * *"],
    ["@weekly", "0 0 * * 0 *"],
    ["@daily", "0 0 * * * *"],
    ["@hourly", "0 * * * * *"],
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
        return `0 0 0 0 */${value} *`;
      case "dayOfWeek":
        return `0 0 0 0 0 */${value}`;
      default:
        return "* * * * * *";
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
   * Parses a string in the format "@on_<day>_<unit>" and returns the corresponding cron expression.
   */
  private parseOnDayStr(str: OnDayStrType): string {
    const [, day, _unit] = str.split("_");
    const days = new Map([
      ["sunday", 1],
      ["monday", 2],
      ["tuesday", 3],
      ["wednesday", 4],
      ["thursday", 5],
      ["friday", 6],
      ["saturday", 7],
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
    if (str.includes("@every_")) {
      return this.parseEveryStr(str as EveryStrType) as CronExpressionType<T>;
    }
    if (str.includes("@at_")) {
      return this.parseAtHourStr(str as AtHourStrType) as CronExpressionType<T>;
    }
    if (str.includes("@on_")) {
      return this.parseOnDayStr(str as OnDayStrType) as CronExpressionType<T>;
    }
    if (str.includes("@between_")) {
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
    this.cron = this.parseStr(this.cron);
    const [second, minute, hour, dayOfMonth, month, dayOfWeek] =
      this.cron.split(" ");
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
  getNext(): Date {
    const cronTime = this.parse();
    const now = new Date();
    let next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
    );
    next.setMilliseconds(0);
    next.setSeconds(next.getSeconds() + 1);

    while (!this.checkCronTime(cronTime, next)) {
      next.setSeconds(next.getSeconds() + 1);
    }

    return next;
  }

  /**
   * Gets the previous execution time based on the current time.
   * @returns A `Date` object representing the previous execution time.
   */
  getPrevious(): Date {
    const cronTime = this.parse();
    const now = new Date();
    let previous = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
    );
    previous.setMilliseconds(0);
    previous.setSeconds(previous.getSeconds() - 1);

    while (!this.checkCronTime(cronTime, previous)) {
      previous.setSeconds(previous.getSeconds() - 1);
    }

    return previous;
  }

  /**
   * Parses a cron time string and returns an array of numbers representing the valid values for that field.
   */
  private parseCronTime(cronTime: string, min: number, max: number): number[] {
    const result: number[] = [];
    switch (true) {
      case cronTime === "*":
        for (let i = min; i <= max; i++) {
          result.push(i);
        }
        break;
      case cronTime.includes("-"): {
        const [start, end] = cronTime.split("-");
        const step = this.getStep(cronTime);
        for (let i = parseInt(start); i <= parseInt(end); i += step) {
          result.push(i);
        }
        break;
      }
      case cronTime.includes("/"): {
        const [value, step] = cronTime.split("/");
        const start = value === "*" ? min : parseInt(value);
        for (let i = start; i <= max; i += parseInt(step)) {
          result.push(i);
        }
        break;
      }
      case cronTime.includes(","): {
        const times = cronTime.split(",");
        for (let i = 0; i < times.length; i++) {
          result.push(parseInt(times[i]));
        }
        break;
      }
      default:
        result.push(parseInt(cronTime));
        break;
    }
    return result;
  }

  /**
   * Gets the step value for a cron time string.
   */
  private getStep(cronTime: string): number {
    const [, step] = cronTime.split("/");
    const parsedStep = parseInt(step);
    return isNaN(parsedStep) ? 1 : parsedStep;
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
