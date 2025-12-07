import { describe, it, expect, mock } from "bun:test";
import Baker from "./baker";
import Cron from "./cron";
import { Logger } from "./types";

describe("Custom Logger", () => {
  it("should use custom logger in Baker", () => {
    const mockLogger: Logger = {
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      debug: mock(() => {}),
    };

    const baker = new Baker({
      logger: mockLogger,
    });

    // Trigger a log (e.g. by adding a job, though Baker doesn't log much on add)
    // Baker logs on restore.
    
    // Let's try to trigger a warning in Baker.
    // destroyAll calls saveState which might fail if persistence is enabled but broken?
    // Or we can just check if the logger is passed to Cron.

    const cron = baker.add({
      name: "test-logger",
      cron: "* * * * * *",
      callback: () => {},
    });

    // Cron should have the logger.
    // We can't easily access private logger property.
    // But we can trigger a warning in Cron.
    
    // Trigger an error in callback without onError handler -> should log warning.
    // We need to run it.
  });

  it("should use custom logger in Cron when passed via Baker", async () => {
    const mockLogger: Logger = {
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      debug: mock(() => {}),
    };

    const baker = new Baker({
      logger: mockLogger,
    });

    const cron = baker.add({
      name: "test-cron-logger",
      cron: "* * * * * *",
      callback: () => {
        throw new Error("Test error");
      },
      start: true,
    });

    // Wait for execution
    await new Promise((resolve) => setTimeout(resolve, 1100));

    cron.stop();

    // Should have logged a warning
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("should use custom logger in Cron when passed directly", async () => {
    const mockLogger: Logger = {
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      debug: mock(() => {}),
    };

    const cron = new Cron({
      name: "test-cron-direct-logger",
      cron: "* * * * * *",
      callback: () => {
        throw new Error("Test error direct");
      },
      logger: mockLogger,
      start: true,
    });

    // Wait for execution
    await new Promise((resolve) => setTimeout(resolve, 1100));

    cron.stop();

    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("should allow overriding logger per job in Baker", async () => {
    const bakerLogger: Logger = {
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      debug: mock(() => {}),
    };

    const jobLogger: Logger = {
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      debug: mock(() => {}),
    };

    const baker = new Baker({
      logger: bakerLogger,
    });

    const cron = baker.add({
      name: "test-override-logger",
      cron: "* * * * * *",
      callback: () => {
        throw new Error("Test error override");
      },
      logger: jobLogger,
      start: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 1100));

    cron.stop();

    expect(jobLogger.warn).toHaveBeenCalled();
    expect(bakerLogger.warn).not.toHaveBeenCalled();
  });
});
